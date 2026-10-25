using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using BridgeDemo;
using Microsoft.AspNetCore.SignalR;

if (args.Length == 1 && args[0] == "--verify-data")
{
    using var verified = new StateStore(Environment.GetEnvironmentVariable("BRIDGE_DATA") ?? "data");
    if (!verified.CheckIntegrity()) throw new InvalidDataException("Database integrity check failed.");
    Console.WriteLine("Database migration and integrity check passed; no listener started.");
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://127.0.0.1:5080");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 8192);
builder.Services.AddSignalR();
builder.Services.AddSingleton<StateStore>(_ => new StateStore(Environment.GetEnvironmentVariable("BRIDGE_DATA") ?? "data"));
builder.Services.AddSingleton<BridgeMaintenance>();
builder.Services.AddHostedService(p => p.GetRequiredService<BridgeMaintenance>());
var app = builder.Build();
var store = app.Services.GetRequiredService<StateStore>();
var maintenance = app.Services.GetRequiredService<BridgeMaintenance>();
var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
bool Equal(string? supplied, string expected) => CryptographicOperations.FixedTimeEquals(
    SHA256.HashData(Encoding.UTF8.GetBytes(supplied ?? "")), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
bool Online(Connection c) => c.LastSeen > DateTimeOffset.UtcNow.AddSeconds(-10);
Task Changed() { maintenance.Notify(); return Task.CompletedTask; }
void Sweep(BridgeState s)
{
    BridgeMaintenance.Sweep(s);
}

app.Use(async (context, next) =>
{
    try { await next(); }
    catch (Exception error) when (!context.Response.HasStarted && error is SqliteException or IOException or StoreBusyException)
    {
        app.Logger.LogError("Storage operation failed; HTTP 503 returned. Error type: {Type}", error.GetType().Name);
        context.Response.StatusCode = 503;
        context.Response.Headers.RetryAfter = "5";
        await context.Response.WriteAsJsonAsync(new { error = "Storage unavailable or busy; no successful acknowledgement was issued. Retry the same event ID." });
    }
});

app.Use(async (context, next) =>
{
    // Public deployments must enter through the local HTTPS reverse proxy.
    var ip = context.Connection.RemoteIpAddress;
    if (ip is null || !IPAddress.IsLoopback(ip)) { context.Response.StatusCode = 403; return; }
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    var path = context.Request.Path;
    if (path.StartsWithSegments("/api") || path.StartsWithSegments("/hub"))
        context.Response.Headers.CacheControl = "no-store";
    string? expected = path.StartsWithSegments("/api/admin") || path.StartsWithSegments("/hub/portal")
        ? store.Read(s => s.AdminKey)
        : path.StartsWithSegments("/api/terminal") ? store.Read(s => s.Connection.TerminalKey) : null;
    if (expected is not null)
    {
        var supplied = context.Request.Headers["X-Bridge-Key"].ToString();
        if (path.StartsWithSegments("/hub/portal") && string.IsNullOrEmpty(supplied))
        {
            var authorization = context.Request.Headers.Authorization.ToString();
            if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) supplied = authorization[7..];
        }
        if (path.StartsWithSegments("/hub/portal") && string.IsNullOrEmpty(supplied))
            supplied = context.Request.Query["access_token"].ToString();
        if (!Equal(supplied, expected)) { context.Response.StatusCode = 401; return; }
    }
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapGet("/health", () => store.Healthy() ? Results.Ok(new { status = "ok", storage = "sqlite" }) : Results.StatusCode(503));
app.MapGet("/api/admin/state", () =>
{
    store.Change(s => { Sweep(s); return true; });
    return store.Read(s => Results.Json(new {
        connection = s.Connection,
        online = Online(s.Connection),
        policy = s.Policy,
        queue = new { queued = s.Signals.Count(x => x.Status == "queued"), blocked = s.Signals.Any(x => x.Status == "unknown"), capacity = 1000 },
        signals = s.Signals.AsEnumerable().Reverse().Take(200).ToArray()
    }));
});

app.MapPost("/api/webhook/{connectionId}", async (string connectionId, HttpRequest http) =>
{
    AlertRequest? request = null;
    string? bodySecret = null;
    try
    {
        using var document = await JsonDocument.ParseAsync(http.Body, cancellationToken: http.HttpContext.RequestAborted);
        if (document.RootElement.ValueKind == JsonValueKind.Object)
            foreach (var property in document.RootElement.EnumerateObject())
                if (property.Name.Equals("secret", StringComparison.OrdinalIgnoreCase) && property.Value.ValueKind == JsonValueKind.String) bodySecret = property.Value.GetString();
        request = document.RootElement.Deserialize<AlertRequest>(jsonOptions);
    }
    catch (JsonException) { }
    var webhookKey = http.Headers["X-Bridge-Key"].FirstOrDefault() ?? bodySecret;
    if (!Equal(webhookKey, store.Read(s => s.Connection.WebhookKey))) return Results.Unauthorized();
    var valid = request is not null && !(request.Id is null || !Regex.IsMatch(request.Id, @"\A[A-Za-z0-9_.:-]{1,128}\z") ||
        request.Symbol is null || !Regex.IsMatch(request.Symbol, @"\A[A-Za-z0-9_.-]{1,32}\z") ||
        request.Action is not ("buy" or "sell" or "close") ||
        !double.IsFinite(request.Lots) || request.Lots <= 0 || request.Lots > 1 ||
        !double.IsFinite(request.SlPoints) || !double.IsFinite(request.TpPoints) ||
        request.SlPoints < 0 || request.TpPoints < 0 || request.SlPoints > 100000 || request.TpPoints > 100000 ||
        request.SentAt > DateTimeOffset.UtcNow.AddSeconds(5));
    var result = store.Change<IResult>(s =>
    {
        Sweep(s);
        IResult ReceiptResult(string disposition, int status, string detail, Signal? command = null, bool duplicate = false)
        {
            var eventId = request?.Id is { Length: <= 128 } ? request.Id : null;
            object? payload = valid ? new { request!.Id, request.Action, request.Symbol, request.Lots, request.SlPoints, request.TpPoints, request.SentAt } : null;
            var receipt = new Receipt(Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow, eventId, disposition, detail, payload);
            s.PendingReceipts.Add(receipt);
            s.PendingEvents.Add(StateStore.Event(disposition, detail, eventId));
            return Results.Json(new { receiptId = receipt.Id, disposition, signal = command, duplicate, detail }, statusCode: status);
        }
        if (connectionId != s.Connection.Id) return ReceiptResult("wrong_connection", 404, "Unknown connection.");
        if (!valid) return ReceiptResult("invalid", 400, "Invalid JSON, id, action, symbol, lot size, targets or producer timestamp.");
        var alert = request!;
        var previous = s.Signals.Find(x => x.Id == alert.Id) ?? store.FindSignal(alert.Id!);
        if (previous is not null)
            return previous.Action == alert.Action && previous.Symbol == alert.Symbol && previous.Lots == alert.Lots &&
                previous.SlPoints == alert.SlPoints && previous.TpPoints == alert.TpPoints && previous.SentAt == alert.SentAt
                ? ReceiptResult("duplicate", 200, "Existing event; no additional command created.", previous, true)
                : ReceiptResult("conflict", 409, "Event ID already belongs to different command fields.");
        if (!s.Policy.AllowedSymbols.Contains(alert.Symbol, StringComparer.Ordinal) || alert.Lots > s.Policy.MaxLots)
            return ReceiptResult("policy_rejected", 422, "Symbol or lot size is outside the operator's execution policy.");
        if (s.Signals.Count(x => x.Status == "queued") >= 1000)
            return ReceiptResult("queue_full", 409, "Pending queue is full; receipt retained without an executable command.");
        var created = DateTimeOffset.UtcNow;
        var expiry = (alert.SentAt ?? created).AddSeconds(s.Policy.MaxAgeSeconds);
        if (expiry > created.AddSeconds(s.Policy.MaxAgeSeconds)) expiry = created.AddSeconds(s.Policy.MaxAgeSeconds);
        var signal = new Signal { Id = alert.Id!, Action = alert.Action, Symbol = alert.Symbol!,
            Lots = alert.Lots, SlPoints = alert.SlPoints, TpPoints = alert.TpPoints, CreatedAt = created, ExpiresAt = expiry, SentAt = alert.SentAt };
        if (expiry <= created) { signal.Status = "expired"; signal.Detail = "Producer event was already stale at receipt."; }
        s.Signals.Add(signal);
        return ReceiptResult(signal.Status == "expired" ? "expired" : "accepted", 202, "Alert and command committed to the server database.", signal);
    });
    await Changed();
    return result;
});

app.MapGet("/api/terminal/poll", async (HttpRequest request) =>
{
    var account = request.Query["account"].ToString();
    var broker = request.Query["broker"].ToString();
    if (request.Query["mode"] != "demo" || !Regex.IsMatch(account, @"\A[0-9]{1,20}\z") || broker.Length is < 1 or > 100)
        return Results.BadRequest("Demo account and broker required.");
    var result = store.Change<IResult>(s =>
    {
        var c = s.Connection;
        if (c.Account is not null && (c.Account != account || c.Broker != broker))
            return Results.Conflict("Connection is bound to a different account/broker.");
        c.Account = account; c.Broker = broker; c.LastSeen = DateTimeOffset.UtcNow;
        if (double.TryParse(request.Query["balance"], System.Globalization.CultureInfo.InvariantCulture, out var balance) && double.IsFinite(balance)) c.Balance = balance;
        if (double.TryParse(request.Query["equity"], System.Globalization.CultureInfo.InvariantCulture, out var equity) && double.IsFinite(equity)) c.Equity = equity;
        if (int.TryParse(request.Query["positions"], out var positions) && positions >= 0) c.Positions = positions;
        Sweep(s);
        if (s.Policy.Paused || s.Signals.Any(x => x.Status is "dispatched" or "unknown")) return Results.NoContent();
        foreach (var pending in s.Signals.Where(x => x.Status == "queued" &&
            (!s.Policy.AllowedSymbols.Contains(x.Symbol, StringComparer.Ordinal) || x.Lots > s.Policy.MaxLots)))
        {
            pending.Status = "rejected"; pending.Detail = "Execution policy changed before dispatch.";
            s.PendingEvents.Add(StateStore.Event("policy_rejected", pending.Detail, pending.Id));
        }
        var next = s.Signals.Find(x => x.Status == "queued");
        if (next is null) return Results.NoContent();
        next.Status = "dispatched"; next.DispatchedAt = DateTimeOffset.UtcNow;
        s.PendingEvents.Add(StateStore.Event("dispatched", "Command durably dispatched; it will not be delivered again.", next.Id));
        // A small, explicitly versioned wire format avoids a JSON library inside the EA.
        return Results.Text(FormattableString.Invariant($"v1|{next.Id}|{next.Action}|{next.Symbol}|{next.Lots}|{next.SlPoints}|{next.TpPoints}"));
    });
    await Changed();
    return result;
});

app.MapPost("/api/terminal/result", async (ResultRequest request) =>
{
    if (request.Id is null || request.Status is not ("filled" or "closed" or "rejected" or "unknown") || request.Detail is null || request.Ticket is null || request.Detail.Length > 500 || request.Ticket.Length > 40)
        return Results.BadRequest();
    var result = store.Change<IResult>(s =>
    {
        var signal = s.Signals.Find(x => x.Id == request.Id) ?? store.FindSignal(request.Id);
        if (signal is null) return Results.NotFound();
        if (signal.Status == "resolved") return Results.Ok(); // An old terminal journal can now be cleared.
        if (signal.Status is not ("dispatched" or "unknown"))
            return signal.Status == request.Status && signal.Ticket == request.Ticket && signal.Detail == request.Detail
                ? Results.Ok() : Results.Conflict();
        if ((request.Status == "closed" && signal.Action != "close") || (request.Status == "filled" && signal.Action == "close")) return Results.BadRequest();
        signal.Status = request.Status; signal.Ticket = request.Ticket; signal.Detail = request.Detail;
        signal.CompletedAt = DateTimeOffset.UtcNow;
        s.PendingEvents.Add(StateStore.Event(request.Status, "Terminal execution result recorded.", signal.Id));
        return Results.Ok();
    });
    await Changed();
    return result;
});

app.MapHub<PortalHub>("/hub/portal");
app.MapPost("/api/admin/resolve/{id}", async (string id) =>
{
    var result = store.Change<IResult>(s =>
    {
        var signal = s.Signals.Find(x => x.Id == id);
        if (signal is null) return Results.NotFound();
        if (signal.Status != "unknown") return Results.Conflict();
        signal.Status = "resolved";
        signal.Detail = "Operator acknowledged after checking broker state. No execution or reversal was requested.";
        s.PendingEvents.Add(StateStore.Event("resolved", signal.Detail, signal.Id));
        return Results.Ok();
    });
    await Changed();
    return result;
});
app.MapGet("/api/admin/receipts", () => Results.Json(store.History()));
app.MapPost("/api/admin/policy", async (ExecutionPolicy policy) =>
{
    if (policy.AllowedSymbols is null || policy.AllowedSymbols.Length > 64 ||
        policy.AllowedSymbols.Any(x => x is null || !Regex.IsMatch(x, @"\A[A-Za-z0-9_.-]{1,32}\z")) ||
        !double.IsFinite(policy.MaxLots) || policy.MaxLots <= 0 || policy.MaxLots > 1 || policy.MaxAgeSeconds is < 5 or > 300)
        return Results.BadRequest(new { error = "Use exact symbols, maximum lots (0..1), and expiry from 5 to 300 seconds." });
    store.Change(s => {
        s.Policy = policy with { AllowedSymbols = policy.AllowedSymbols.Distinct(StringComparer.Ordinal).ToArray() };
        s.PendingEvents.Add(StateStore.Event("policy_changed", policy.Paused ? "Execution paused by operator." : "Execution enabled under the configured symbol/lot policy."));
        return true;
    });
    await Changed();
    return Results.Ok(new { policy });
});
app.MapPost("/api/admin/backup", () => Results.Json(store.Backup()));
Console.WriteLine("\nBRIDGE DEMO — MT5 demo accounts only");
if (app.Environment.IsDevelopment())
{
    Console.WriteLine("Portal: http://127.0.0.1:5080");
    Console.WriteLine("Admin key (paste into portal): " + store.Read(s => s.AdminKey));
}
else Console.WriteLine("Credentials are stored in BRIDGE_DATA/bridge.db; retrieve through an authorized server session.");
app.Run();

public sealed class PortalHub : Hub { }
