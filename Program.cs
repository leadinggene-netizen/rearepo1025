using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using BridgeDemo;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://127.0.0.1:5080");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 8192);
builder.Services.AddSignalR();
builder.Services.AddSingleton(new StateStore(Environment.GetEnvironmentVariable("BRIDGE_DATA") ?? "data"));
var app = builder.Build();
var store = app.Services.GetRequiredService<StateStore>();
var hub = app.Services.GetRequiredService<IHubContext<PortalHub>>();
bool Equal(string? supplied, string expected) => CryptographicOperations.FixedTimeEquals(
    SHA256.HashData(Encoding.UTF8.GetBytes(supplied ?? "")), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
bool Online(Connection c) => c.LastSeen > DateTimeOffset.UtcNow.AddSeconds(-10);
Task Changed() => hub.Clients.All.SendAsync("changed");
void Sweep(BridgeState s)
{
    foreach (var signal in s.Signals.Where(x => x.Status == "queued" && x.CreatedAt < DateTimeOffset.UtcNow.AddSeconds(-30)))
    { signal.Status = "expired"; signal.Detail = "Not collected within 30 seconds."; }
    foreach (var signal in s.Signals.Where(x => x.Status == "dispatched" && x.DispatchedAt < DateTimeOffset.UtcNow.AddSeconds(-30)))
    { signal.Status = "unknown"; signal.Detail = "Result overdue; inspect MT5. Never retry automatically."; }
}

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
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/admin/state", () =>
{
    var cutoff = DateTimeOffset.UtcNow.AddSeconds(-30);
    if (store.Read(s => s.Signals.Any(x =>
        (x.Status == "queued" && x.CreatedAt < cutoff) ||
        (x.Status == "dispatched" && x.DispatchedAt < cutoff))))
        store.Change(s => { Sweep(s); return true; });
    return store.Read(s => Results.Json(new {
        connection = s.Connection,
        online = Online(s.Connection),
        signals = s.Signals.AsEnumerable().Reverse().Take(200).ToArray()
    }));
});

app.MapPost("/api/webhook/{connectionId}", async (string connectionId, AlertRequest request, HttpRequest http) =>
{
    var webhookKey = http.Headers["X-Bridge-Key"].FirstOrDefault() ?? request.Secret;
    if (!Equal(webhookKey, store.Read(s => s.Connection.WebhookKey))) return Results.Unauthorized();
    if (request.Id is null || !Regex.IsMatch(request.Id, @"\A[A-Za-z0-9_.:-]{1,128}\z") ||
        request.Symbol is null || !Regex.IsMatch(request.Symbol, @"\A[A-Za-z0-9_.-]{1,32}\z") ||
        request.Action is not ("buy" or "sell" or "close") ||
        !double.IsFinite(request.Lots) || request.Lots <= 0 || request.Lots > 1 ||
        !double.IsFinite(request.SlPoints) || !double.IsFinite(request.TpPoints) ||
        request.SlPoints < 0 || request.TpPoints < 0 || request.SlPoints > 100000 || request.TpPoints > 100000)
        return Results.BadRequest(new { error = "Invalid id, action, symbol, lots (0..1), or target points." });
    var result = store.Change<IResult>(s =>
    {
        Sweep(s);
        if (connectionId != s.Connection.Id) return Results.NotFound();
        var previous = s.Signals.Find(x => x.Id == request.Id);
        if (previous is not null)
            return previous.Action == request.Action && previous.Symbol == request.Symbol && previous.Lots == request.Lots &&
                previous.SlPoints == request.SlPoints && previous.TpPoints == request.TpPoints
                ? Results.Ok(new { signal = previous, duplicate = true })
                : Results.Conflict(new { error = "Id already belongs to a different command." });
        if (!Online(s.Connection)) return Results.Conflict(new { error = "MT5 adapter is offline. Connect your demo terminal first." });
        if (s.Signals.Any(x => x.Status is "queued" or "dispatched" or "unknown"))
            return Results.Conflict(new { error = "Resolve the outstanding command before sending another." });
        if (s.Signals.Count >= 10000) return Results.Conflict(new { error = "Demo journal is full; archive it before continuing." });
        var signal = new Signal { Id = request.Id, Action = request.Action, Symbol = request.Symbol,
            Lots = request.Lots, SlPoints = request.SlPoints, TpPoints = request.TpPoints };
        s.Signals.Add(signal);
        return Results.Accepted($"/api/admin/state", new { signal, duplicate = false });
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
        var next = s.Signals.Find(x => x.Status == "queued");
        if (next is null) return Results.NoContent();
        next.Status = "dispatched"; next.DispatchedAt = DateTimeOffset.UtcNow;
        // A small, explicitly versioned wire format avoids a JSON library inside the EA.
        return Results.Text(FormattableString.Invariant($"v1|{next.Id}|{next.Action}|{next.Symbol}|{next.Lots}|{next.SlPoints}|{next.TpPoints}"));
    });
    await Changed();
    return result;
});

app.MapPost("/api/terminal/result", async (ResultRequest request) =>
{
    if (request.Status is not ("filled" or "closed" or "rejected" or "unknown") || request.Detail?.Length > 500 || request.Ticket?.Length > 40)
        return Results.BadRequest();
    var result = store.Change<IResult>(s =>
    {
        var signal = s.Signals.Find(x => x.Id == request.Id);
        if (signal is null) return Results.NotFound();
        if (signal.Status == "resolved") return Results.Ok(); // An old terminal journal can now be cleared.
        if (signal.Status is not ("dispatched" or "unknown"))
            return signal.Status == request.Status && signal.Ticket == request.Ticket && signal.Detail == request.Detail
                ? Results.Ok() : Results.Conflict();
        if ((request.Status == "closed" && signal.Action != "close") || (request.Status == "filled" && signal.Action == "close")) return Results.BadRequest();
        signal.Status = request.Status; signal.Ticket = request.Ticket; signal.Detail = request.Detail;
        signal.CompletedAt = DateTimeOffset.UtcNow;
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
        return Results.Ok();
    });
    await Changed();
    return result;
});
Console.WriteLine("\nBRIDGE DEMO — MT5 demo accounts only");
if (app.Environment.IsDevelopment())
{
    Console.WriteLine("Portal: http://127.0.0.1:5080");
    Console.WriteLine("Admin key (paste into portal): " + store.Read(s => s.AdminKey));
}
else Console.WriteLine("Credentials are stored in BRIDGE_DATA/state.json; retrieve through an authorized server session.");
app.Run();

public sealed class PortalHub : Hub { }
