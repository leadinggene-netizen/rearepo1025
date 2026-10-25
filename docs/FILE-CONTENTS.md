# Authored file contents

Paths are relative to the repository root. Generated data, local tools and third-party dependency code are deliberately excluded. See FILES.md and the dependency license.

## BridgeDemo.csproj

`````text
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <DefaultItemExcludes>$(DefaultItemExcludes);.tools/**;data/**;artifacts/**</DefaultItemExcludes>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="10.0.13" />
    <Content Remove=".tools/**;data/**;artifacts/**;tests/**;mt5/*.ex5;mt5/*.log" />
    <None Remove=".tools/**;data/**;artifacts/**;tests/**;mt5/*.ex5;mt5/*.log" />
  </ItemGroup>
</Project>

`````

## global.json

`````text
{"sdk":{"version":"10.0.100","rollForward":"latestFeature"}}

`````

## NuGet.Config

`````text
<?xml version="1.0" encoding="utf-8"?>
<configuration><packageSources><clear /><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>

`````

## packages.lock.json

`````text
{
  "version": 1,
  "dependencies": {
    "net10.0": {
      "Microsoft.Data.Sqlite": {
        "type": "Direct",
        "requested": "[10.0.13, )",
        "resolved": "10.0.13",
        "contentHash": "w37nz3WFmDtRfXxWEwIXX2OgqDRiwhD1JGbFwfpFCF8GkCrV/yO6Y2JF5058J2RGoI2sCcdn02wrk0yEcekWcw==",
        "dependencies": {
          "Microsoft.Data.Sqlite.Core": "10.0.13",
          "SQLitePCLRaw.bundle_e_sqlite3": "2.1.13",
          "SQLitePCLRaw.core": "2.1.13"
        }
      },
      "Microsoft.Data.Sqlite.Core": {
        "type": "Transitive",
        "resolved": "10.0.13",
        "contentHash": "Gge8XsSCOwcbkbdmt2UDAe6kIv9Q0vA6yb3wsTStjjexaMFLTWfc/1gH4kbhJ+zWiXRTRA4lG2sOQNVfir204w==",
        "dependencies": {
          "SQLitePCLRaw.core": "2.1.13"
        }
      },
      "SQLitePCLRaw.bundle_e_sqlite3": {
        "type": "Transitive",
        "resolved": "2.1.13",
        "contentHash": "NlDixlC7uHmo+ojXRgkNvN0tQtVGpLDZ3x2OpgNj+G07VHh5cXSszFDrAiC4BpUiPwkcaeuQkMV9WQ123xVtmQ==",
        "dependencies": {
          "SQLitePCLRaw.lib.e_sqlite3": "2.1.13",
          "SQLitePCLRaw.provider.e_sqlite3": "2.1.13"
        }
      },
      "SQLitePCLRaw.core": {
        "type": "Transitive",
        "resolved": "2.1.13",
        "contentHash": "2joofoinuHBFs0nMX3nKuXgxpXryRkCOdM2Ua6HBqQLLy6IW+5f28ZI+HAvMyF8vG7XfNz/lwfBfE6V4juru8Q=="
      },
      "SQLitePCLRaw.lib.e_sqlite3": {
        "type": "Transitive",
        "resolved": "2.1.13",
        "contentHash": "D2UAuiGxFYBqeRXjjjGgvJ5UQifzn6wefmSqeKU7XcNGKLbJRP6X7kcPZ6opOBJGdCIlgbSxTvDpBbLvsN594A=="
      },
      "SQLitePCLRaw.provider.e_sqlite3": {
        "type": "Transitive",
        "resolved": "2.1.13",
        "contentHash": "ZU60dSqoSNRe49KcQDUmOVgdRtjITOssVXFtiISs+zJXDI4D2Sndwpn2NOtzDQNPu0ZAvpoLPQ+GLKv6iEZn8Q==",
        "dependencies": {
          "SQLitePCLRaw.core": "2.1.13"
        }
      }
    }
  }
}
`````

## Models.cs

`````text
using System.Text.Json.Serialization;

namespace BridgeDemo;

public sealed class BridgeState
{
    public string AdminKey { get; set; } = Guid.NewGuid().ToString("N");
    public Connection Connection { get; set; } = new();
    public List<Signal> Signals { get; set; } = [];
    public ExecutionPolicy Policy { get; set; } = new();
    [JsonIgnore] public List<Receipt> PendingReceipts { get; set; } = [];
    [JsonIgnore] public List<AuditEvent> PendingEvents { get; set; } = [];
}

public sealed record Connection
{
    public string Id { get; set; } = "demo-mt5";
    public string WebhookKey { get; set; } = Guid.NewGuid().ToString("N");
    public string TerminalKey { get; set; } = Guid.NewGuid().ToString("N");
    public string? Account { get; set; }
    public string? Broker { get; set; }
    public DateTimeOffset? LastSeen { get; set; }
    public double Balance { get; set; }
    public double Equity { get; set; }
    public int Positions { get; set; }
}

public sealed record Signal
{
    public string Id { get; set; } = "";
    public string Action { get; set; } = "";
    public string Symbol { get; set; } = "";
    public double Lots { get; set; }
    public double SlPoints { get; set; }
    public double TpPoints { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddSeconds(30);
    public DateTimeOffset? SentAt { get; set; }
    public DateTimeOffset? DispatchedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Status { get; set; } = "queued";
    public string? Ticket { get; set; }
    public string? Detail { get; set; }
}

public sealed record AlertRequest(string Id, string Action, string Symbol, double Lots = 0.01,
    double SlPoints = 0, double TpPoints = 0, string? Secret = null, DateTimeOffset? SentAt = null);
public sealed record ResultRequest(string Id, string Status, string Ticket, string Detail);

public sealed record ExecutionPolicy
{
    public bool Paused { get; set; } = true;
    public string[] AllowedSymbols { get; set; } = [];
    public double MaxLots { get; set; } = 0.10;
    public int MaxAgeSeconds { get; set; } = 30;
}
public sealed record Receipt(string Id, DateTimeOffset ReceivedAt, string? EventId,
    string Disposition, string Detail, object? Payload);
public sealed record AuditEvent(string Id, DateTimeOffset CreatedAt, string Kind, string Detail, string? EventId = null);
public sealed class StoreBusyException : Exception { }

`````

## StateStore.cs

`````text
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace BridgeDemo;

public sealed class StateStore : IDisposable
{
    readonly object gate = new();
    readonly FileStream lease;
    readonly SqliteConnection db;
    readonly string directory;
    readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web);
    BridgeState state;
    bool faulted;

    public StateStore(string directory)
    {
        this.directory = Path.GetFullPath(directory);
        Directory.CreateDirectory(this.directory);
        lease = new FileStream(Path.Combine(this.directory, "server.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        db = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = Path.Combine(this.directory, "bridge.db"), DefaultTimeout = 1, Pooling = false
        }.ToString());
        try
        {
            db.Open();
            Execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
            var version = Convert.ToInt32(Scalar("PRAGMA user_version"));
            if (version is not (0 or 1)) throw new InvalidDataException("Unsupported database schema; refusing migration.");
            Execute("""
                CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS commands(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL, document TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS commands_status ON commands(status,sequence);
                CREATE TABLE IF NOT EXISTS receipts(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
                    event_id TEXT, disposition TEXT NOT NULL, document TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS receipts_event ON receipts(event_id);
                CREATE TABLE IF NOT EXISTS audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT, document TEXT NOT NULL);
                """);
            if (Scalar("SELECT document FROM settings WHERE id=1") is not string metadata)
            {
                if (version != 0 || Convert.ToInt64(Scalar("SELECT count(*) FROM commands")) != 0)
                    throw new InvalidDataException("Database settings are missing; refusing to reset credentials or history.");
                var legacy = Path.Combine(this.directory, "state.json");
                state = File.Exists(legacy)
                    ? JsonSerializer.Deserialize<BridgeState>(File.ReadAllText(legacy), json) ?? throw new InvalidDataException("Empty legacy state")
                    : new BridgeState();
                state.Policy = new ExecutionPolicy();
                if (state.AdminKey.Length < 20 || state.Connection.TerminalKey.Length < 20 || state.Connection.WebhookKey.Length < 20 || state.Signals.Select(x => x.Id).Distinct().Count() != state.Signals.Count)
                    throw new InvalidDataException("Legacy credentials or event identity are invalid; refusing migration.");
                state.Connection = DurableConnection(state.Connection);
                foreach (var signal in state.Signals)
                {
                    signal.ExpiresAt = signal.CreatedAt.AddSeconds(30);
                    if (signal.Status == "queued") { signal.Status = "expired"; signal.Detail = "Legacy queue expired during migration; no historical replay."; }
                    if (signal.Status == "dispatched") { signal.Status = "unknown"; signal.Detail = "Migration after dispatch; inspect MT5."; }
                }
                using var tx = db.BeginTransaction();
                Execute("INSERT INTO settings VALUES(1,$document)", tx, ("$document", Metadata(state)));
                foreach (var signal in state.Signals) WriteSignal(signal, tx);
                Execute("PRAGMA user_version=1", tx);
                tx.Commit();
            }
            else state = JsonSerializer.Deserialize<BridgeState>(metadata, json) ?? throw new InvalidDataException("Empty database settings");
            state.Connection = DurableConnection(state.Connection);
            state.Signals = QueryDocuments<Signal>("""
                SELECT document FROM commands WHERE status IN ('queued','dispatched','unknown')
                OR sequence IN (SELECT sequence FROM commands ORDER BY sequence DESC LIMIT 200) ORDER BY sequence
                """);
            Change(s => {
                foreach (var signal in s.Signals.Where(x => x.Status == "dispatched"))
                { signal.Status = "unknown"; signal.Detail = "Server restarted after dispatch; inspect MT5 before continuing."; }
                s.PendingEvents.Add(Event("server_started", "Server started; persisted heartbeats cleared. Unknown execution is never redelivered."));
                return true;
            });
        }
        catch { db.Dispose(); lease.Dispose(); throw; }
    }

    public static AuditEvent Event(string kind, string detail, string? id = null) => new(Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow, kind, detail, id);
    static Connection DurableConnection(Connection c) => c with { LastSeen = null, Balance = 0, Equity = 0, Positions = 0 };
    string Metadata(BridgeState s) => JsonSerializer.Serialize(new { s.AdminKey, Connection = DurableConnection(s.Connection), s.Policy }, json);
    SqliteCommand Command(string sql, SqliteTransaction? tx = null, params (string, object?)[] parameters)
    {
        var command = db.CreateCommand(); command.CommandText = sql; command.Transaction = tx;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return command;
    }
    void Execute(string sql, SqliteTransaction? tx = null, params (string, object?)[] parameters)
    { using var command = Command(sql, tx, parameters); command.ExecuteNonQuery(); }
    object? Scalar(string sql, params (string, object?)[] parameters)
    { using var command = Command(sql, null, parameters); return command.ExecuteScalar(); }
    List<T> QueryDocuments<T>(string sql)
    {
        using var command = Command(sql); using var rows = command.ExecuteReader(); var list = new List<T>();
        while (rows.Read()) list.Add(JsonSerializer.Deserialize<T>(rows.GetString(0), json) ?? throw new InvalidDataException("Invalid database document"));
        return list;
    }
    void WriteSignal(Signal s, SqliteTransaction tx) => Execute("""
        INSERT INTO commands(id,status,document) VALUES($id,$status,$document)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,document=excluded.document
        """, tx, ("$id", s.Id), ("$status", s.Status), ("$document", JsonSerializer.Serialize(s, json)));

    public T Read<T>(Func<BridgeState, T> read)
    {
        if (!Monitor.TryEnter(gate, 100)) throw new StoreBusyException();
        try
        {
            if (faulted) throw new InvalidDataException("Storage failed; restart after diagnosing the database before further delivery.");
            return read(state);
        }
        finally { Monitor.Exit(gate); }
    }
    public Signal? FindSignal(string id) => Read(s => {
        var cached = s.Signals.Find(x => x.Id == id);
        if (cached is not null) return cached with { };
        return Scalar("SELECT document FROM commands WHERE id=$id", ("$id", id)) is string text ? JsonSerializer.Deserialize<Signal>(text, json) : null;
    });
    public object History() => Read(_ => new {
        receipts = QueryDocuments<Receipt>("SELECT document FROM receipts ORDER BY sequence DESC LIMIT 100"),
        events = QueryDocuments<AuditEvent>("SELECT document FROM audit ORDER BY sequence DESC LIMIT 100")
    });
    public bool Healthy() => Read(_ => Convert.ToInt32(Scalar("SELECT 1")) == 1);
    public bool CheckIntegrity() => Read(_ => Scalar("PRAGMA integrity_check") as string == "ok");

    public T Change<T>(Func<BridgeState, T> change)
    {
        if (!Monitor.TryEnter(gate, 100)) throw new StoreBusyException();
        try
        {
            if (faulted) throw new InvalidDataException("Storage failed; refusing delivery from potentially stale memory.");
            var next = new BridgeState { AdminKey = state.AdminKey, Connection = state.Connection with { },
                Policy = state.Policy with { AllowedSymbols = state.Policy.AllowedSymbols.ToArray() },
                Signals = state.Signals.Select(x => x with { }).ToList() };
            var result = change(next);
            var metadata = Metadata(next);
            var metadataChanged = metadata != Metadata(state);
            var before = state.Signals.ToDictionary(x => x.Id);
            var changed = next.Signals.Where(x => !before.TryGetValue(x.Id, out var previous) || previous != x).ToArray();
            if (metadataChanged || changed.Length > 0 || next.PendingReceipts.Count > 0 || next.PendingEvents.Count > 0)
            {
                using var tx = db.BeginTransaction();
                if (metadataChanged) Execute("UPDATE settings SET document=$document WHERE id=1", tx, ("$document", metadata));
                foreach (var signal in changed) WriteSignal(signal, tx);
                foreach (var receipt in next.PendingReceipts)
                    Execute("INSERT INTO receipts(id,event_id,disposition,document) VALUES($id,$event,$disposition,$document)", tx,
                        ("$id", receipt.Id), ("$event", receipt.EventId), ("$disposition", receipt.Disposition), ("$document", JsonSerializer.Serialize(receipt, json)));
                foreach (var entry in next.PendingEvents) Execute("INSERT INTO audit(document) VALUES($document)", tx, ("$document", JsonSerializer.Serialize(entry, json)));
                tx.Commit();
            }
            next.PendingReceipts.Clear(); next.PendingEvents.Clear();
            var recent = next.Signals.TakeLast(200).Select(x => x.Id).ToHashSet();
            next.Signals = next.Signals.Where(x => recent.Contains(x.Id) || x.Status is "queued" or "dispatched" or "unknown").ToList();
            state = next;
            return result;
        }
        catch (SqliteException e) when (e.SqliteErrorCode is 10 or 11 or 13 or 26)
        {
            faulted = true;
            throw;
        }
        finally { Monitor.Exit(gate); }
    }

    public object Backup() => Read(_ => {
        var backups = Path.Combine(directory, "backups"); Directory.CreateDirectory(backups);
        var file = "relay-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N") + ".db";
        using var target = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.Combine(backups, file), Pooling = false }.ToString());
        target.Open(); db.BackupDatabase(target);
        using var check = target.CreateCommand(); check.CommandText = "PRAGMA integrity_check";
        if (check.ExecuteScalar() as string != "ok") throw new InvalidDataException("Backup integrity check failed");
        return new { file, integrity = "ok" };
    });
    public void Dispose() { db.Dispose(); lease.Dispose(); }
}

`````

## Program.cs

`````text
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

`````

## BridgeMaintenance.cs

`````text
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;

namespace BridgeDemo;

public sealed class BridgeMaintenance(StateStore store, IHubContext<PortalHub> hub, ILogger<BridgeMaintenance> logger) : BackgroundService
{
    int dirty;
    bool wasOnline;
    public void Notify() => Interlocked.Exchange(ref dirty, 1);
    public static bool Sweep(BridgeState s)
    {
        var changed = false;
        var now = DateTimeOffset.UtcNow;
        foreach (var signal in s.Signals.Where(x => x.Status == "queued" && x.ExpiresAt <= now))
        {
            signal.Status = "expired"; signal.Detail = "Command expired before dispatch; no execution requested.";
            s.PendingEvents.Add(StateStore.Event("expired", signal.Detail, signal.Id)); changed = true;
        }
        foreach (var signal in s.Signals.Where(x => x.Status == "dispatched" && x.DispatchedAt < now.AddSeconds(-30)))
        {
            signal.Status = "unknown"; signal.Detail = "Result overdue; inspect MT5. Never retry automatically.";
            s.PendingEvents.Add(StateStore.Event("unknown", signal.Detail, signal.Id)); changed = true;
        }
        return changed;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    var online = store.Read(s => s.Connection.LastSeen > DateTimeOffset.UtcNow.AddSeconds(-10));
                    var changed = store.Change(s => {
                        var swept = Sweep(s);
                        if (wasOnline && !online) s.PendingEvents.Add(StateStore.Event("terminal_offline", "MT5 heartbeat lost; pending commands keep their original expiry."));
                        return swept;
                    });
                    changed |= online != wasOnline; wasOnline = online;
                    if (Interlocked.Exchange(ref dirty, 0) == 1 || changed)
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(TimeSpan.FromSeconds(2));
                        await hub.Clients.All.SendAsync("changed", timeout.Token);
                    }
                }
                catch (Exception e) when (e is SqliteException or IOException or StoreBusyException or OperationCanceledException)
                { logger.LogWarning("Database maintenance or portal notification could not complete; it will be retried."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}

`````

## wwwroot/index.html

`````text
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relay / MT5 bridge</title><link rel="stylesheet" href="/style.css"></head>
<body><aside><a class="brand" href="/">↗ <strong>relay<span>Trading bridge lab</span></strong></a><div class="nav">◉ &nbsp; Workspace</div><div class="aside-note">INDEPENDENT IMPLEMENTATION<br>ASP.NET Core · SignalR · MT5</div><div class="demo-badge">DEMO ACCOUNTS ONLY</div></aside>
<main><header><div><div class="eyebrow">YOUR EXECUTION WORKSPACE</div><h1>A clear path from alert to order.</h1><p>Connect a demo terminal, send an instruction, and inspect its actual result.</p></div><span id="live" class="pill">Portal locked</span></header>
<section id="login" class="card login"><h2>Open your workspace</h2><p>Paste your admin key. It stays in this tab’s memory.</p><form id="login-form"><input id="admin-key" type="password" autocomplete="off" placeholder="Admin key" required><button>Connect portal →</button></form></section>
<div id="workspace" hidden><section class="stats"><div class="card"><label>Terminal</label><strong id="terminal-status">Offline</strong><small id="account-label">Awaiting MT5</small></div><div class="card"><label>Balance</label><strong id="balance">—</strong><small>Account currency</small></div><div class="card"><label>Equity</label><strong id="equity">—</strong><small>Reported by your terminal</small></div><div class="card"><label>Open positions</label><strong id="positions">—</strong><small>Whole account count</small></div></section>
<section class="card controls"><div class="section-heading"><h2>Execution controls</h2><span id="queue-status" class="pill">Queue empty</span></div><p id="execution-note" role="status"></p><form id="policy-form"><div class="form-grid"><label>Allowed MT5 symbols · comma separated<input id="allowed-symbols" placeholder="btcusd, EURUSD" maxlength="2200"></label><label>Maximum lots<input id="max-lots" type="number" min="0.001" max="1" step="any" required></label><label>Command lifetime · seconds<input id="max-age" type="number" min="5" max="300" step="1" required></label><label class="check-row"><input id="execution-paused" type="checkbox" checked> Pause execution</label></div><button>Save execution policy</button></form><p class="note">Alerts are stored while paused or offline. Commands keep their expiry. Resuming can execute unexpired queued commands; it does not retry unknown outcomes or close positions.</p><button type="button" id="backup" class="subtle">Create database backup</button></section>
<div class="columns"><section class="card"><div class="eyebrow">01 / CONNECT</div><h2>Your MT5 connection</h2><p>Attach <code>RelayDemoRemote.mq5</code> to one chart on your demo account. Enter your account login and the terminal key below.</p><dl><dt>Bridge URL</dt><dd><code id="base-url"></code></dd><dt>Connection ID</dt><dd><code>demo-mt5</code></dd><dt>Terminal key</dt><dd><input id="terminal-key" type="password" readonly aria-label="Terminal key"><button type="button" id="show-key" class="subtle">Show / hide</button></dd></dl><p class="note">In MT5: Tools → Options → Expert Advisors → allow WebRequest for this URL. Enable Algo Trading. No DLL required.</p></section>
<section class="card"><div class="eyebrow">02 / SEND</div><h2>Send a demo instruction</h2><p>Symbols must match your broker exactly. SL/TP distances use broker points.</p><form id="signal-form"><div class="form-grid"><label>Action<select id="action"><option value="buy">Buy</option><option value="sell">Sell</option><option value="close">Close own positions</option></select></label><label>Broker symbol<input id="symbol" value="EURUSD" required maxlength="32"></label><label>Lots<input id="lots" type="number" value="0.01" min="0.01" max="1" step="0.01" required></label><label>SL distance · points<input id="sl" type="number" value="200" min="0" max="100000" required></label><label>TP distance · points<input id="tp" type="number" value="400" min="0" max="100000" required></label></div><button id="send" disabled>Send to demo MT5 →</button><small id="send-note">Connect the EA first.</small></form></section></div>
<section class="card journal"><div class="section-heading"><div><div class="eyebrow">03 / VERIFY</div><h2>Execution journal</h2></div><span class="pill">Receipt ≠ execution</span></div><div class="table-scroll"><table><thead><tr><th>Received</th><th>Request</th><th>Instruction</th><th>Status</th><th>Broker reference / detail</th></tr></thead><tbody id="signals"></tbody></table></div><p id="empty">Your first instruction will appear here. Nothing has been sent yet.</p></section>
<details class="card"><summary>TradingView webhook integration</summary><p>A unique ID identifies each intended action. Repeating that ID with the same fields records a duplicate receipt without creating another command. The template below assumes one buy per strategy/bar; use strategy-generated event IDs for multiple events.</p><pre id="webhook-example"></pre><p>Set the HTTPS webhook URL and paste the JSON into TradingView's alert message. Use the broker's exact MT5 symbol. Keep your webhook key private.</p></details>
<details class="card"><summary>Alert receipts · latest 100</summary><p>Receipt means the alert was recorded; execution is tracked separately above. Secrets are excluded from receipt payloads.</p><div class="table-scroll"><table><thead><tr><th>Received</th><th>Event ID</th><th>Disposition</th><th>Detail</th></tr></thead><tbody id="receipts"></tbody></table></div></details>
<details class="card"><summary>Activity and warnings · latest 100</summary><div class="table-scroll"><table><thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead><tbody id="events"></tbody></table></div></details></div>
<div id="message" role="status" aria-live="polite"></div><footer>Relay / independent implementation · Demo accounts only · Verify every broker result</footer></main>
<script src="/vendor/signalr.min.js"></script><script src="/app.js"></script></body></html>

`````

## wwwroot/style.css

`````text
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#dfe9ee;background:#10191e;font-size:14px;color-scheme:dark}*{box-sizing:border-box}body{margin:0;display:flex}aside{width:230px;position:fixed;inset:0 auto 0 0;border-right:1px solid #2b393f;padding:36px 24px;background:#121f25}.brand{display:flex;gap:12px;font-size:32px;color:#81ddc1;text-decoration:none;align-items:center}.brand strong{font-size:25px;color:#ecf4f6;letter-spacing:-1px}.brand span{display:block;font-size:11px;color:#9dafb6;font-weight:400;letter-spacing:.5px;margin-top:5px}.nav{margin-top:55px;border:1px solid #3e615a;border-radius:9px;padding:14px;background:#213b36;color:#9ce9d0}.aside-note{position:absolute;bottom:100px;font-size:10px;line-height:2;letter-spacing:1px;color:#789098}.demo-badge{position:absolute;bottom:35px;font-size:10px;letter-spacing:1px;color:#e1bf87;border:1px solid #70593d;border-radius:5px;padding:9px}main{margin-left:230px;padding:48px 5%;width:calc(100% - 230px);max-width:1700px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;gap:25px}.eyebrow{font-size:10px;letter-spacing:2px;font-weight:700;color:#88b5ae;margin-bottom:15px}h1{font-size:clamp(25px,3vw,39px);line-height:1.2;letter-spacing:-1.4px;margin:0 0 15px;font-weight:500}p{color:#9bafb8;line-height:1.7;margin:12px 0 22px}h2{font-size:19px;font-weight:500;margin:0 0 12px;letter-spacing:-.3px}.card{background:#18262d;border:1px solid #30434b;border-radius:12px;padding:27px;box-shadow:0 5px 15px #0000000a}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}.stats label{display:block;color:#9bafb8;font-size:12px}.stats strong{display:block;font-size:27px;font-weight:500;margin:15px 0 9px}.stats small{color:#829aa4;font-size:11px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}.pill{font-size:11px;border:1px solid #3c535b;padding:8px 12px;border-radius:20px;color:#9eb9be;white-space:nowrap}.pill.online{color:#99e6c7;border-color:#477764}input,select{padding:12px;background:#112027;border:1px solid #3c525b;color:#dfe9ee;border-radius:6px;font:inherit;width:100%;margin-top:8px}input:focus,select:focus,button:focus-visible{outline:2px solid #84dfbf;outline-offset:2px}button{background:#98e1c6;border:0;color:#142a24;border-radius:6px;padding:13px 18px;font:inherit;font-weight:650;cursor:pointer;margin-top:18px}button:hover{background:#b5f2db}button:disabled{opacity:.4;cursor:not-allowed}.subtle{padding:7px 10px;background:transparent;color:#9cdac5;border:1px solid #3c6057;font-size:11px;margin-top:8px}dt{font-size:11px;color:#8ca1aa;margin-top:18px}dd{margin:7px 0 0}code{font-family:ui-monospace,monospace;font-size:12px;color:#bcded9}.note{border-left:2px solid #5e9e8b;padding-left:15px;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.form-grid label{font-size:11px;color:#9fb5be}#send-note{display:block;color:#8fa5ad;margin-top:12px;font-size:11px}.section-heading{display:flex;justify-content:space-between;align-items:center}.journal{margin-bottom:24px}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:680px;text-align:left;margin-top:20px}th{color:#8ea8b2;font-size:10px;letter-spacing:.8px;text-transform:uppercase;font-weight:500;padding:14px 8px;border-bottom:1px solid #3a4d55}td{padding:18px 8px;border-bottom:1px solid #2d4049;font-size:12px;vertical-align:top}td:last-child{max-width:320px;overflow-wrap:anywhere}.status{color:#d8bc7e}.status.filled,.status.closed{color:#96e0c2}.status.rejected,.status.unknown{color:#f1a49c}#empty{text-align:center;padding:30px;font-size:12px}details{margin-bottom:20px}summary{cursor:pointer;color:#b6d4d2}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#101e24;padding:18px;font-size:11px;line-height:1.8;border-radius:6px}#message{position:fixed;bottom:25px;right:25px;max-width:430px;white-space:pre-wrap;background:#244b43;color:#d7f6e9;border-radius:8px;padding:16px;display:none;box-shadow:0 5px 30px #0005}footer{font-size:10px;color:#6e8a94;letter-spacing:.6px;padding:16px 0}.login{max-width:600px}.login form{display:flex;align-items:end;gap:12px}.login input{flex:1}.login button{white-space:nowrap}[hidden]{display:none!important}@media(max-width:1050px){aside{width:180px;padding:30px 16px}main{margin-left:180px;width:calc(100% - 180px);padding:30px 24px}.columns{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){body{display:block}aside{position:static;width:100%;height:82px;padding:18px 22px;border-right:0;border-bottom:1px solid #2b393f}.brand{font-size:25px}.brand strong{font-size:21px}.brand span,.nav,.aside-note,.demo-badge{display:none}main{margin:0;width:100%;padding:27px 17px}header{align-items:start;flex-direction:column;gap:8px}.card{padding:21px}.stats{gap:10px}.stats .card{padding:18px}.stats strong{font-size:23px}.form-grid{gap:12px}.login form{display:block}.login button{width:100%}.section-heading{align-items:start;gap:12px}.section-heading .pill{font-size:9px}#message{left:15px;right:15px;bottom:15px}}
.controls{margin-bottom:24px}.controls .check-row{display:flex;align-items:center;gap:12px}.controls .check-row input{width:auto;margin:0}#execution-note{color:#d8bc7e}

`````

## wwwroot/app.js

`````text
const $ = id => document.getElementById(id);
let adminKey = '', current, connection, noticeTimer, policyDirty = false, refreshGeneration = 0;
function notify(text) { $('message').textContent = text; $('message').style.display = 'block'; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('message').style.display = 'none', 7000); }
async function api(path, options = {}, key = adminKey) {
  const response = await fetch(path, { ...options, headers: { 'X-Bridge-Key': key, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0,400)}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}
function cell(row, text, className) { const td = row.insertCell(); td.textContent = text; if (className) td.className = className; return td; }
function executionState() {
  if (!current) return;
  const p = current.policy, q = current.queue;
  $('queue-status').textContent = `${q.queued} / ${q.capacity} queued`;
  $('execution-note').textContent = q.blocked ? 'Execution blocked: inspect the unknown result in MT5 before acknowledging it.' : p.paused ? 'Execution paused. Incoming authenticated alerts are still recorded.' : !current.online ? 'MT5 is offline. Received commands expire at their original deadline.' : 'Execution enabled under your saved symbol and lot limits.';
  const allowed = p.allowedSymbols.includes($('symbol').value.trim()) && Number($('lots').value) <= p.maxLots;
  $('send').disabled = !current.online || p.paused || q.blocked || q.queued >= q.capacity || !allowed;
  $('send-note').textContent = !allowed ? 'Use an allowed symbol and a lot size within the saved policy.' : p.paused ? 'Enable execution in the policy before sending manually.' : q.blocked ? 'Reconcile the unknown result first.' : !current.online ? 'Connect the EA first.' : 'This queues an actual instruction for your demo account.';
}
async function refresh() {
  const generation = ++refreshGeneration;
  const [state, history] = await Promise.all([api('/api/admin/state'), api('/api/admin/receipts')]);
  if (generation !== refreshGeneration) return;
  current = state;
  const c = current.connection;
  $('terminal-status').textContent = current.online ? 'Connected' : 'Offline';
  $('account-label').textContent = c.account ? `${c.account} / ${c.broker}` : 'Awaiting MT5';
  $('balance').textContent = c.account ? c.balance.toLocaleString() : '—';
  $('equity').textContent = c.account ? c.equity.toLocaleString() : '—';
  $('positions').textContent = c.account ? c.positions : '—';
  $('terminal-key').value = c.terminalKey; $('base-url').textContent = location.origin;
  if (!policyDirty) {
    $('allowed-symbols').value = current.policy.allowedSymbols.join(', ');
    $('max-lots').value = current.policy.maxLots;
    $('max-age').value = current.policy.maxAgeSeconds;
    $('execution-paused').checked = current.policy.paused;
  }
  executionState();
  $('signals').replaceChildren();
  for (const s of current.signals) {
    const row = $('signals').insertRow();
    cell(row, new Date(s.createdAt).toLocaleTimeString()); cell(row, s.id.slice(0,12));
    cell(row, `${s.action.toUpperCase()} ${s.symbol}${s.action === 'close' ? '' : ` · ${s.lots} lot`}`);
    cell(row, s.status, `status ${s.status}`);
    const detail = cell(row, [s.ticket, s.detail].filter(Boolean).join(' / ') || 'Awaiting terminal');
    if (s.status === 'unknown') {
      const button = document.createElement('button'); button.className = 'subtle'; button.textContent = 'Acknowledge after checking MT5';
      button.onclick = async () => { if (!confirm('Have you checked actual MT5 positions and history? This clears the block without sending or reversing a trade.')) return;
        try { await api(`/api/admin/resolve/${encodeURIComponent(s.id)}`, { method: 'POST' }); await refresh(); } catch (e) { notify(e.message); } };
      detail.append(document.createElement('br'), button);
    }
  }
  $('empty').hidden = current.signals.length > 0;
  $('webhook-example').textContent = `Webhook URL: ${location.origin}/api/webhook/${c.id}\n\nMessage:\n${JSON.stringify({secret:c.webhookKey,id:'strategy1-{{time}}-{{interval}}-buy',sentAt:'{{timenow}}',action:'buy',symbol:current.policy.allowedSymbols[0] || 'EXACT_MT5_SYMBOL',lots:Math.min(0.01,current.policy.maxLots),slPoints:200,tpPoints:400},null,2)}`;
  $('receipts').replaceChildren();
  for (const r of history.receipts) { const row = $('receipts').insertRow(); cell(row,new Date(r.receivedAt).toLocaleString()); cell(row,r.eventId || '—'); cell(row,r.disposition); cell(row,r.detail); }
  $('events').replaceChildren();
  for (const e of history.events) { const row = $('events').insertRow(); cell(row,new Date(e.createdAt).toLocaleString()); cell(row,e.kind); cell(row,e.detail); }
}
$('policy-form').oninput = () => { policyDirty = true; };
$('signal-form').oninput = executionState;
$('policy-form').onsubmit = async event => {
  event.preventDefault();
  const policy = {paused:$('execution-paused').checked,allowedSymbols:$('allowed-symbols').value.split(',').map(s=>s.trim()).filter(Boolean),maxLots:Number($('max-lots').value),maxAgeSeconds:Number($('max-age').value)};
  if (!policy.paused && !confirm('Enable execution? Unexpired queued commands may execute immediately. Check MT5 and your limits first.')) return;
  try { await api('/api/admin/policy',{method:'POST',body:JSON.stringify(policy)}); policyDirty=false; await refresh(); notify('Execution policy saved.'); } catch(e) { notify(e.message); }
};
$('backup').onclick = async () => {
  $('backup').disabled = true;
  try { const result=await api('/api/admin/backup',{method:'POST',body:'{}'}); notify(`Database backup created on server: ${result.file}\nIntegrity check: ${result.integrity}`); } catch(e) { notify(e.message); }
  finally { $('backup').disabled=false; }
};
$('login-form').onsubmit = async event => {
  event.preventDefault(); adminKey = $('admin-key').value.trim();
  try {
    await refresh();
    if (!window.signalR) throw new Error('SignalR client missing. Run scripts/prepare-client.ps1 and reload.');
    $('login').hidden = true; $('workspace').hidden = false; $('admin-key').value = '';
    connection = new signalR.HubConnectionBuilder().withUrl('/hub/portal', {accessTokenFactory: () => adminKey}).withAutomaticReconnect().build();
    connection.on('changed', () => refresh().catch(e => notify(e.message)));
    connection.onreconnecting(() => { $('live').textContent = 'Reconnecting'; $('live').classList.remove('online'); });
    connection.onreconnected(() => { $('live').textContent = 'Live portal'; $('live').classList.add('online'); refresh().catch(e => notify(e.message)); });
    connection.onclose(() => { $('live').textContent = 'Refresh to reconnect'; $('live').classList.remove('online'); });
    await connection.start(); $('live').textContent = 'Live portal'; $('live').classList.add('online');
    setInterval(() => refresh().catch(() => { $('live').textContent = 'Server unavailable'; $('send').disabled = true; }), 5000);
  } catch(e) { notify(e.message); }
};
$('show-key').onclick = () => $('terminal-key').type = $('terminal-key').type === 'password' ? 'text' : 'password';
$('signal-form').onsubmit = async event => {
  event.preventDefault(); $('send').disabled = true;
  const request = { id: crypto.randomUUID(), action: $('action').value, symbol: $('symbol').value.trim(), lots: Number($('lots').value), slPoints: Number($('sl').value), tpPoints: Number($('tp').value) };
  try { await api(`/api/webhook/${current.connection.id}`, {method:'POST', body:JSON.stringify(request)}, current.connection.webhookKey); notify('Instruction accepted. Waiting for the terminal result.'); }
  catch(e) { notify(e.message); }
  finally { await refresh().catch(e => notify(e.message)); }
};

`````

## mt5/RelayDemoRemote.mq5

`````text
#property strict
#property version "1.100"
#property description "Independent HTTPS alert bridge. DEMO accounts only."
#include <Trade/Trade.mqh>

input string BridgeUrl = "https://relay.tradingviewtometatraders.com";
input string TerminalKey = "PASTE_TERMINAL_KEY";
input long ExpectedLogin = 0;
input ulong MagicNumber = 1025001;
input double MaxLots = 0.10;
input uint DeviationPoints = 20;

CTrade trade;
string journal;
bool busy = false;

bool AccountAllowed()
{
   return AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO &&
          AccountInfoInteger(ACCOUNT_LOGIN) == ExpectedLogin;
}

string EscapeJson(string value)
{
   string result = "";
   for(int i = 0; i < StringLen(value); i++)
   {
      ushort c = StringGetCharacter(value, i);
      if(c == 34) result += "\\\"";
      else if(c == 92) result += "\\\\";
      else if(c < 32) result += StringFormat("\\u%04x", (uint)c);
      else result += StringSubstr(value, i, 1);
   }
   return result;
}

string UrlEncode(string value)
{
   uchar bytes[]; int size = StringToCharArray(value, bytes, 0, WHOLE_ARRAY, CP_UTF8);
   string result = "";
   for(int i = 0; i < size - 1; i++)
   {
      uchar c = bytes[i];
      if((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.')
         result += CharToString(c);
      else result += StringFormat("%%%02X", (int)c);
   }
   return result;
}

int Request(string method, string path, string payload, string &response)
{
   char data[], result[]; string headers;
   if(payload != "") { StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8); ArrayResize(data, ArraySize(data)-1); }
   ResetLastError();
   int code = WebRequest(method, BridgeUrl + path,
      "Content-Type: application/json\r\nX-Bridge-Key: " + TerminalKey + "\r\n", 5000, data, result, headers);
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code == -1) Print("Relay WebRequest failed: ", GetLastError(), ". Check the allowed URL and server.");
   return code;
}

bool SaveResult(string id, string status, string ticket, string detail)
{
   int file = FileOpen(journal, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(file == INVALID_HANDLE) { Print("Cannot write execution journal. Trading stopped."); return false; }
   string payload = "{\"id\":\"" + EscapeJson(id) + "\",\"status\":\"" + status +
      "\",\"ticket\":\"" + EscapeJson(ticket) + "\",\"detail\":\"" + EscapeJson(detail) + "\"}";
   bool written = FileWriteString(file, payload) > 0;
   FileFlush(file); FileClose(file);
   return written;
}

bool ReportPending()
{
   if(!FileIsExist(journal)) return true;
   int file = FileOpen(journal, FILE_READ | FILE_TXT | FILE_ANSI);
   if(file == INVALID_HANDLE) return false;
   string payload = FileReadString(file); FileClose(file);
   string response;
   if(Request("POST", "/api/terminal/result", payload, response) != 200) return false;
   return FileDelete(journal);
}

void Execute(string command)
{
   string parts[];
   if(StringSplit(command, '|', parts) != 7 || parts[0] != "v1") { Print("Invalid bridge protocol"); return; }
   string id = parts[1], action = parts[2], symbol = parts[3];
   double lots = StringToDouble(parts[4]), slPoints = StringToDouble(parts[5]), tpPoints = StringToDouble(parts[6]);
   // Persist an uncertain outcome BEFORE touching the broker. On a crash, only report it.
   if(!SaveResult(id, "unknown", "", "Execution interrupted or not yet confirmed; inspect MT5.")) return;
   string status = "rejected", detail = "Demo account, login or trading permission check failed", ticket = "";
   if(AccountAllowed() && TerminalInfoInteger(TERMINAL_CONNECTED) && TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) &&
      MQLInfoInteger(MQL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
   {
      if(!SymbolSelect(symbol, true)) detail = "Broker symbol unavailable";
      else if(action == "close" && AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
         detail = "Automatic close requires a hedging account to isolate this EA positions. Close netting positions manually.";
      else if(action == "close")
      {
         int closed = 0, failed = 0;
         for(int i = PositionsTotal() - 1; i >= 0; i--)
         {
            ulong position = PositionGetTicket(i);
            if(position == 0 || PositionGetString(POSITION_SYMBOL) != symbol || (ulong)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
            bool ok = trade.PositionClose(position, DeviationPoints);
            if(ok && trade.ResultRetcode() == TRADE_RETCODE_DONE) closed++; else failed++;
         }
         status = failed > 0 ? "unknown" : "closed";
         detail = StringFormat("Closed %d matching positions; %d unconfirmed. Only this EA magic and symbol were selected.", closed, failed);
      }
      else if(action == "buy" || action == "sell")
      {
         bool existing = false;
         for(int i = 0; i < PositionsTotal(); i++)
            if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_SYMBOL) == symbol) existing = true;
         double minimum = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN), maximum = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
         double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
         if(existing) detail = "An existing position on this symbol blocks new entries; no pyramiding or implicit reversal.";
         else if(lots <= 0 || lots > MaxLots || lots > 1 || lots < minimum || lots > maximum || step <= 0 || MathAbs(lots / step - MathRound(lots / step)) > 0.0000001)
            detail = "Lots violate EA limit or broker volume rules";
         else
         {
            MqlTick tick;
            if(!SymbolInfoTick(symbol, tick)) detail = "No broker quote";
            else
            {
               double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
               double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
               int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
               double price = action == "buy" ? tick.ask : tick.bid;
               double direction = action == "buy" ? 1 : -1;
               double sl = slPoints > 0 ? price - direction * slPoints * point : 0;
               double tp = tpPoints > 0 ? price + direction * tpPoints * point : 0;
               if(tickSize > 0) { if(sl > 0) sl = MathRound(sl / tickSize) * tickSize; if(tp > 0) tp = MathRound(tp / tickSize) * tickSize; }
               sl = NormalizeDouble(sl, digits); tp = NormalizeDouble(tp, digits);
               trade.SetTypeFillingBySymbol(symbol);
               bool ok = action == "buy" ? trade.Buy(lots, symbol, 0, sl, tp, "Relay demo") : trade.Sell(lots, symbol, 0, sl, tp, "Relay demo");
               uint code = trade.ResultRetcode();
               status = ok && code == TRADE_RETCODE_DONE ? "filled" :
                  (code == TRADE_RETCODE_DONE_PARTIAL || code == TRADE_RETCODE_TIMEOUT || code == TRADE_RETCODE_CONNECTION || code == TRADE_RETCODE_PLACED ? "unknown" : "rejected");
               ticket = StringFormat("%I64u", trade.ResultDeal());
               detail = StringFormat("retcode=%u; %s; confirmed volume=%.4f", code, trade.ResultRetcodeDescription(), trade.ResultVolume());
            }
         }
      }
      else detail = "Unsupported command";
   }
   SaveResult(id, status, ticket, detail);
   Print("Relay ", id, ": ", status, " / ", detail);
}

int OnInit()
{
   if(ExpectedLogin <= 0 || !AccountAllowed()) { Print("Relay requires the explicitly selected DEMO login."); return INIT_PARAMETERS_INCORRECT; }
   if(TerminalKey == "PASTE_TERMINAL_KEY" || StringLen(TerminalKey) < 20 || MaxLots <= 0 || MaxLots > 1 || MagicNumber == 0) return INIT_PARAMETERS_INCORRECT;
   if(BridgeUrl != "http://127.0.0.1:5080" && BridgeUrl != "https://relay.tradingviewtometatraders.com")
   { Print("Use the Relay HTTPS deployment or the local demo server URL, without a trailing slash."); return INIT_PARAMETERS_INCORRECT; }
   journal = StringFormat("relay-demo-%I64d-%I64u.json", ExpectedLogin, MagicNumber);
   trade.SetExpertMagicNumber(MagicNumber); trade.SetDeviationInPoints(DeviationPoints); trade.SetAsyncMode(false);
   EventSetTimer(1);
   Print("Relay endpoint configured: ", BridgeUrl, ". No live accounts supported. Keep only one Relay EA attached.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   if(busy || !AccountAllowed()) return;
   busy = true;
   if(ReportPending())
   {
      string response;
      string path = "/api/terminal/poll?mode=demo&account=" + (string)ExpectedLogin + "&broker=" + UrlEncode(AccountInfoString(ACCOUNT_SERVER)) +
         "&balance=" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "&equity=" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
         "&positions=" + (string)PositionsTotal();
      if(Request("GET", path, "", response) == 200) { Execute(response); ReportPending(); }
   }
   busy = false;
}

`````

## deploy/relay.service

`````text
[Unit]
Description=Relay demo-account trading bridge
After=network-online.target
Wants=network-online.target

[Service]
User=relay
Group=relay
WorkingDirectory=/opt/relay/current
ExecStart=/usr/bin/dotnet /opt/relay/current/BridgeDemo.dll
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5080
Environment=BRIDGE_DATA=/var/lib/relay
Environment=AllowedHosts=relay.tradingviewtometatraders.com;127.0.0.1;localhost
Environment=Logging__LogLevel__Default=Warning
Environment=Logging__LogLevel__Microsoft=Warning
Environment=DOTNET_CLI_TELEMETRY_OPTOUT=1
StateDirectory=relay
StateDirectoryMode=0700
UMask=0077
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
MemoryMax=768M
TasksMax=128

[Install]
WantedBy=multi-user.target

`````

## deploy/relay.nginx.conf

`````text
# Installed under /etc/nginx/conf.d; all variables are native Nginx variables.
map $http_upgrade $relay_connection_upgrade {
    default upgrade;
    '' close;
}
map $http_origin $relay_origin_allowed {
    default 0;
    '' 1;
    'https://relay.tradingviewtometatraders.com' 1;
}
limit_req_zone $binary_remote_addr zone=relay_requests:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=relay_connections:10m;
# Exclude query strings (SignalR tokens and terminal telemetry), headers and bodies.
log_format relay_safe '$remote_addr $time_iso8601 $request_method $uri $status $request_time';

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}
server {
    listen 80;
    listen [::]:80;
    server_name relay.tradingviewtometatraders.com;
    access_log /var/log/nginx/relay-access.log relay_safe;
    location ^~ /.well-known/acme-challenge/ { root /var/lib/letsencrypt; }
    location / { return 308 https://relay.tradingviewtometatraders.com$request_uri; }
}
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
    return 444;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name relay.tradingviewtometatraders.com;
    ssl_certificate /etc/letsencrypt/live/relay.tradingviewtometatraders.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.tradingviewtometatraders.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:relay_tls:10m;
    ssl_session_tickets off;
    server_tokens off;
    access_log /var/log/nginx/relay-access.log relay_safe;
    # Nginx error records can include query strings; routine request errors stay out.
    error_log /var/log/nginx/relay-error.log crit;
    client_max_body_size 8k;
    client_body_timeout 10s;
    client_header_timeout 10s;
    limit_req zone=relay_requests burst=30 nodelay;
    limit_req_status 429;
    limit_conn relay_connections 32;
    limit_conn_status 429;
    if ($relay_origin_allowed = 0) { return 403; }
    add_header Strict-Transport-Security 'max-age=31536000' always;
    add_header X-Frame-Options DENY always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://relay.tradingviewtometatraders.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" always;
    location / {
        proxy_pass http://127.0.0.1:5080;
        proxy_http_version 1.1;
        proxy_set_header Host relay.tradingviewtometatraders.com;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $relay_connection_upgrade;
        # The application keeps its direct-peer loopback boundary. It does not trust forwarded IP headers.
        proxy_set_header X-Forwarded-For '';
        proxy_set_header X-Forwarded-Proto '';
        proxy_connect_timeout 5s;
        proxy_read_timeout 75s;
        proxy_buffering off;
    }
}

`````

## deploy/install-release.sh

`````text
#!/usr/bin/env bash
# Run as root on the VPS after runtime/Nginx/TLS bootstrap. No secrets in the archive.
set -euo pipefail
if [[ $# != 3 || ! $2 =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$ || ! $3 =~ ^[a-f0-9]{64}$ ]]; then
  echo 'Usage: install-release.sh ARCHIVE RELEASE_ID EXPECTED_SHA256' >&2
  exit 2
fi
archive=$(realpath "$1")
release="/opt/relay/releases/$2"
printf '%s  %s\n' "$3" "$archive" | sha256sum --check --status
id relay >/dev/null 2>&1 || useradd --system --home-dir /var/lib/relay --shell /usr/sbin/nologin relay
install -d -m 0755 /opt/relay/releases
install -d -o relay -g relay -m 0700 /var/lib/relay
test ! -e "$release"
install -d -m 0755 "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
test -f "$release/BridgeDemo.dll"
chown -R root:root "$release"
chmod -R go-w "$release"
previous=$(readlink -f /opt/relay/current || true)
if [[ -f /var/lib/relay/bridge.db ]]; then
  python3 -c 'import json,sys; assert json.load(open(sys.argv[1])).get("storageFormat")=="sqlite-v1", "Refusing a legacy application against a SQLite data directory"' "$release/release.json"
fi
install -d -m 0700 /var/backups/relay
snapshot="/var/backups/relay/pre-$2"
test ! -e "$snapshot"
install -d -m 0700 "$snapshot/state" "$snapshot/preflight"
if systemctl cat relay.service >/dev/null 2>&1; then systemctl stop relay.service; fi
cp -a /var/lib/relay/. "$snapshot/state/"
cp -a "$snapshot/state/." "$snapshot/preflight/"
if ! BRIDGE_DATA="$snapshot/preflight" /usr/bin/dotnet "$release/BridgeDemo.dll" --verify-data; then
  echo 'Migration preflight failed on an isolated copy; active state was not migrated.' >&2
  if [[ -n "$previous" ]]; then systemctl start relay.service; fi
  exit 1
fi
install -m 0644 "$release/deploy/relay.service" /etc/systemd/system/relay.service
ln -s "$release" /opt/relay/current.next
mv -Tf /opt/relay/current.next /opt/relay/current
systemctl daemon-reload
systemctl enable relay.service
systemctl restart relay.service
healthy=0
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:5080/health >/dev/null; then healthy=1; break; fi
  sleep 1
done
if [[ $healthy != 1 ]]; then
  echo 'Release failed health check.' >&2
  systemctl stop relay.service
  if [[ -n "$previous" && -d "$previous" ]] && python3 -c 'import json,sys; assert json.load(open(sys.argv[1])).get("storageFormat")=="sqlite-v1"' "$previous/release.json"; then
    ln -s "$previous" /opt/relay/current.rollback
    mv -Tf /opt/relay/current.rollback /opt/relay/current
    systemctl start relay.service
  fi
  echo "State retained. Pre-deployment copy: $snapshot/state. Legacy rollback requires an explicit reconciled state restore." >&2
  exit 1
fi
install -d -m 0700 /opt/relay/config-backups
cp /etc/nginx/conf.d/relay.conf "/opt/relay/config-backups/$2.nginx.conf"
install -m 0644 "$release/deploy/relay.nginx.conf" /etc/nginx/conf.d/relay.conf
if ! nginx -t; then
  cp "/opt/relay/config-backups/$2.nginx.conf" /etc/nginx/conf.d/relay.conf
  echo 'Nginx configuration rejected; previous configuration retained.' >&2
  exit 1
fi
systemctl reload nginx
install -m 0644 "$release/deploy/relay-backup.service" /etc/systemd/system/relay-backup.service
install -m 0644 "$release/deploy/relay-backup.timer" /etc/systemd/system/relay-backup.timer
systemctl daemon-reload
systemctl enable --now relay-backup.timer
echo "Relay release $2 is healthy. Persistent state was retained."

`````

## deploy/relay-backup.service

`````text
[Unit]
Description=Create and integrity-check a private Relay database backup
After=relay.service

[Service]
Type=oneshot
User=relay
Group=relay
UMask=0077
ExecCondition=/usr/bin/test -f /var/lib/relay/bridge.db
ExecStart=/usr/bin/python3 /opt/relay/current/scripts/db-maintenance.py backup /var/lib/relay/bridge.db /var/lib/relay/backups
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/relay

`````

## deploy/relay-backup.timer

`````text
[Unit]
Description=Daily Relay database backup

[Timer]
OnCalendar=daily
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target

`````

## scripts/db-maintenance.py

`````text
"""Consistent SQLite backup, integrity check, and restore into an empty directory."""
import datetime
import json
import os
import pathlib
import sqlite3
import sys
import uuid

os.umask(0o077)
if len(sys.argv) != 4 or sys.argv[1] not in ('backup', 'restore'):
    raise SystemExit('Usage: db-maintenance.py backup DATABASE BACKUP_DIRECTORY | restore BACKUP EMPTY_DATA_DIRECTORY')
action = sys.argv[1]
source = pathlib.Path(sys.argv[2]).resolve(strict=True)
destination = pathlib.Path(sys.argv[3]).resolve()
if action == 'restore' and destination.exists() and any(destination.iterdir()):
    raise SystemExit('Restore requires an empty data directory; existing data was not modified')
destination.mkdir(mode=0o700, parents=True, exist_ok=True)
name = 'bridge.db' if action == 'restore' else 'relay-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-') + uuid.uuid4().hex + '.db'
target = destination / name
if target.exists():
    raise SystemExit('Refusing to overwrite an existing database')
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=1) as original:
    if original.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise SystemExit('Source integrity check failed')
    with sqlite3.connect(target, timeout=1) as restored:
        original.backup(restored)
        if action == 'restore':
            metadata = json.loads(restored.execute('SELECT document FROM settings WHERE id=1').fetchone()[0])
            metadata['policy']['paused'] = True
            restored.execute('UPDATE settings SET document=? WHERE id=1', (json.dumps(metadata),))
            for event_id, status, document in restored.execute("SELECT id,status,document FROM commands WHERE status IN ('queued','dispatched')").fetchall():
                signal = json.loads(document)
                signal['status'] = 'expired' if status == 'queued' else 'unknown'
                signal['detail'] = 'Restored backup: no historical replay; reconcile uncertain results in MT5.'
                restored.execute('UPDATE commands SET status=?,document=? WHERE id=?', (signal['status'], json.dumps(signal), event_id))
            entry = {'id': uuid.uuid4().hex, 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'kind': 'backup_restored', 'detail': 'Execution paused; restored queued commands expired and dispatched commands marked unknown.'}
            restored.execute('INSERT INTO audit(document) VALUES(?)', (json.dumps(entry),))
            restored.commit()
        if restored.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('Backup/restore integrity check failed')
        restored.execute('PRAGMA wal_checkpoint(TRUNCATE)')
print(json.dumps({'action': action, 'file': str(target), 'integrity': 'ok', 'executionPausedOnRestore': action == 'restore'}))

`````

## scripts/package-release.ps1

`````text
param([string]$ReleaseId = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
$ErrorActionPreference = 'Stop'
if ($ReleaseId -notmatch '\A[A-Za-z0-9][A-Za-z0-9._-]{0,99}\z') { throw 'Invalid release ID' }
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$localSdk = Join-Path (Get-Location) '.tools/dotnet/dotnet.exe'
$sdk = if (Test-Path -LiteralPath $localSdk) { $localSdk } else { 'dotnet' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_CLI_HOME = Join-Path (Get-Location) '.tools/home'
$env:APPDATA = Join-Path (Get-Location) '.tools/appdata'
$env:NUGET_PACKAGES = Join-Path (Get-Location) '.tools/nuget'
$directory = Join-Path (Get-Location) "artifacts/releases/$ReleaseId"
if (Test-Path -LiteralPath $directory) { throw 'Release directory already exists' }
$app = Join-Path $directory 'app'
New-Item -ItemType Directory -Path $app -Force | Out-Null
& $sdk restore --configfile NuGet.Config --locked-mode
if ($LASTEXITCODE -ne 0) { throw 'Restore failed' }
& $sdk publish --configuration Release --no-restore --output $app
if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
node scripts/check-publish.mjs $app
if ($LASTEXITCODE -ne 0) { throw 'Publish boundary check failed' }
Copy-Item -LiteralPath deploy -Destination $app -Recurse
New-Item -ItemType Directory -Path (Join-Path $app 'scripts') -Force | Out-Null
Copy-Item -LiteralPath scripts/db-maintenance.py -Destination (Join-Path $app 'scripts')
$metadata = @{ releaseId=$ReleaseId; storageFormat='sqlite-v1'; sourceRevision=(git rev-parse HEAD); workingTreeDirty=[bool](git status --porcelain); createdAtUtc=(Get-Date).ToUniversalTime().ToString('o') }
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $app 'release.json') -Encoding utf8NoBOM
$archive = Join-Path $directory "relay-$ReleaseId.tar.gz"
tar -czf $archive -C $app .
if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }
$sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$sha  relay-$ReleaseId.tar.gz" | Set-Content -LiteralPath "$archive.sha256" -Encoding ascii
Write-Output "Release: $ReleaseId"
Write-Output "Archive: $archive"
Write-Output "SHA256: $sha"

`````

## scripts/run.ps1

`````text
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$localDotnet = Join-Path $projectDirectory '.tools/dotnet/dotnet.exe'
$dotnetCommand = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { 'dotnet' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:DOTNET_CLI_HOME = Join-Path $projectDirectory '.tools/home'
$env:APPDATA = Join-Path $projectDirectory '.tools/appdata'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
$env:NUGET_PACKAGES = Join-Path $projectDirectory '.tools/nuget'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
if (-not (Test-Path -LiteralPath 'wwwroot/vendor/signalr.min.js')) { & "$PSScriptRoot/prepare-client.ps1" }
if (-not $NoBuild) {
    & $dotnetCommand restore --configfile NuGet.Config --locked-mode
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $dotnetCommand build --no-restore
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $dotnetCommand run --no-build --no-launch-profile
exit $LASTEXITCODE

`````

## scripts/test.ps1

`````text
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$localDotnet = Join-Path $projectDirectory '.tools/dotnet/dotnet.exe'
$env:DOTNET_EXE = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { (Get-Command dotnet).Source }
$env:DOTNET_CLI_HOME = Join-Path $projectDirectory '.tools/home'
$env:APPDATA = Join-Path $projectDirectory '.tools/appdata'
$env:NUGET_PACKAGES = Join-Path $projectDirectory '.tools/nuget'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:BRIDGE_DLL = Join-Path $projectDirectory 'artifacts/test-bin/BridgeDemo.dll'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
& $env:DOTNET_EXE restore --configfile NuGet.Config --locked-mode
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $env:DOTNET_EXE build --no-restore --warnaserror --output artifacts/test-bin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --check wwwroot/app.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test --test-reporter=spec --test-reporter=junit --test-reporter-destination=stdout --test-reporter-destination=artifacts/protocol-tests.xml tests/integration.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/validation-manifest.mjs
exit $LASTEXITCODE

`````

## scripts/check-publish.mjs

`````text
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'artifacts/publish');
const excluded = new Set(['data','.tools','artifacts','tests','.git','mt5']);
async function inspect(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(excluded.has(entry.name.toLowerCase()) || ['state.json','server.lock'].includes(entry.name.toLowerCase()) || /\.(db|sqlite)(-wal|-shm)?$/i.test(entry.name))
      throw new Error(`Local-only content leaked into publish output: ${path.relative(root,path.join(directory,entry.name))}`);
    if(entry.isDirectory()) await inspect(path.join(directory,entry.name));
  }
}
await inspect(root);
console.log('Publish boundary passed: no local state, tools, tests or terminal files.');

`````

## scripts/prepare-client.ps1

`````text
$ErrorActionPreference = 'Stop'
$vendorDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'wwwroot/vendor'
New-Item -ItemType Directory -Force -Path $vendorDirectory | Out-Null
$version = '10.0.0'
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@microsoft/signalr@$version/dist/browser/signalr.min.js" -OutFile (Join-Path $vendorDirectory 'signalr.min.js')
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/dotnet/aspnetcore/v$version/LICENSE.txt" -OutFile (Join-Path $vendorDirectory 'SIGNALR-LICENSE.txt')
Write-Output "Prepared Microsoft SignalR JavaScript client $version"

`````

## scripts/export-file-guide.py

`````text
"""Export authored source files without local tools, secrets or third-party code."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
paths = [
    'BridgeDemo.csproj', 'global.json', 'NuGet.Config', 'packages.lock.json', 'Models.cs', 'StateStore.cs', 'Program.cs', 'BridgeMaintenance.cs',
    'wwwroot/index.html', 'wwwroot/style.css', 'wwwroot/app.js', 'mt5/RelayDemoRemote.mq5',
    'deploy/relay.service', 'deploy/relay.nginx.conf', 'deploy/install-release.sh', 'deploy/relay-backup.service', 'deploy/relay-backup.timer',
    'scripts/db-maintenance.py', 'scripts/package-release.ps1',
    'scripts/run.ps1', 'scripts/test.ps1', 'scripts/check-publish.mjs', 'scripts/prepare-client.ps1', 'scripts/export-file-guide.py',
    'scripts/validation-manifest.mjs', 'tests/integration.mjs', 'tests/pentagi/offline-flow.json',
    'Dockerfile', '.dockerignore', '.gitignore', '.gitattributes',
    '.github/workflows/ci.yml', '.github/workflows/container.yml',
]
parts = ['# Authored file contents\n\nPaths are relative to the repository root. Generated data, local tools and third-party dependency code are deliberately excluded. See FILES.md and the dependency license.\n']
for name in paths:
    parts.append(f'\n## {name}\n\n`````text\n{(root / name).read_text(encoding="utf-8")}\n`````\n')
(root / 'docs' / 'FILE-CONTENTS.md').write_text(''.join(parts), encoding='utf-8', newline='\n')
print(f'Exported {len(paths)} source/config files')

`````

## scripts/validation-manifest.mjs

`````text
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const files=['BridgeDemo.csproj','packages.lock.json','global.json','NuGet.Config','Program.cs','StateStore.cs','Models.cs','BridgeMaintenance.cs','scripts/db-maintenance.py','mt5/RelayDemoRemote.mq5','deploy/relay.service','deploy/relay.nginx.conf','deploy/install-release.sh','tests/integration.mjs','tests/pentagi/offline-flow.json','.github/workflows/ci.yml'];
const hashes={};
for(const file of files) hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dotnetVersion=execFileSync(process.env.DOTNET_EXE||'dotnet',['--version'],{encoding:'utf8'}).trim();
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/validation-manifest.json',JSON.stringify({sourceRevision,nodeVersion:process.version,dotnetVersion,hashes,scope:'synthetic loopback only; no broker'},null,2));
console.log('Validation manifest saved; source hashes and runtime versions only.');

`````

## tests/integration.mjs

`````text
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,readdir} from 'node:fs/promises';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';

test('transactional alert receipts, ordered demo delivery and recovery (no broker)',{timeout:90000},async t=>{
 const root=path.resolve(process.env.BRIDGE_TEST_ARTIFACTS||'artifacts'); await mkdir(root,{recursive:true});
 let directory=await mkdtemp(path.join(root,'sqlite-test-'));
 const original=directory;
 const legacy={adminKey:'a'.repeat(32),connection:{id:'demo-mt5',terminalKey:'b'.repeat(32),webhookKey:'c'.repeat(32)},signals:[{id:'legacy-filled',action:'buy',symbol:'EURUSD',lots:0.01,status:'filled',createdAt:'2000-01-01T00:00:00Z',ticket:'old-test-deal'},{id:'legacy-queued',action:'buy',symbol:'EURUSD',lots:0.01,status:'queued',createdAt:'2000-01-01T00:00:00Z'},{id:'legacy-dispatched',action:'buy',symbol:'EURUSD',lots:0.01,status:'dispatched',createdAt:'2000-01-01T00:00:00Z'}]};
 await writeFile(path.join(directory,'state.json'),JSON.stringify(legacy));
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));assert.notEqual(port,5080);
 const base=`http://127.0.0.1:${port}`, admin=legacy.adminKey, terminal=legacy.connection.terminalKey, webhook=legacy.connection.webhookKey;
 const python=process.env.PYTHON_EXE||(process.platform==='win32'?'C:/Program Files/Python312/python.exe':'python3');
 let server,output='';
 const ingressMs=[];
 async function start(){
  output='';server=spawn(process.env.DOTNET_EXE||'dotnet',[process.env.BRIDGE_DLL||path.resolve('bin/Debug/net10.0/BridgeDemo.dll')],{env:{...process.env,BRIDGE_DATA:directory,ASPNETCORE_URLS:base,ASPNETCORE_ENVIRONMENT:'Production',DOTNET_PROCESSOR_COUNT:'1'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
  for(let i=0;i<150;i++){if(server.exitCode!==null)throw new Error('Test server exited');try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw new Error('Test server not ready');
 }
 async function stop(){if(server&&server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill();await done;}}
 t.after(stop);
 const request=(route,key,body)=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-Bridge-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const snapshot=async()=>{const r=await request('/api/admin/state',admin);assert.equal(r.status,200);return r.json();};
 const poll='/api/terminal/poll?mode=demo&account=12345&broker=Test-Demo&balance=10000&equity=9999&positions=0';
 const alert=(id,extra={})=>({id,action:'buy',symbol:'EURUSD',lots:0.01,slPoints:200,tpPoints:400,...extra});
 const send=(id,extra={})=>request('/api/webhook/demo-mt5',webhook,alert(id,extra));
 const configure=async(extra={})=>{const r=await request('/api/admin/policy',admin,{paused:false,allowedSymbols:['EURUSD'],maxLots:0.1,maxAgeSeconds:30,...extra});assert.equal(r.status,200);};
 const finish=async(id,status='filled')=>{const r=await request('/api/terminal/result',terminal,{id,status,ticket:'test-deal',detail:'Protocol fixture; no broker'});assert.equal(r.status,200);};
 const inspect=(sql)=>JSON.parse(execFileSync(python,['-c','import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute(sys.argv[2]).fetchall()))',path.join(directory,'bridge.db'),sql],{encoding:'utf8'}));
 await start();
 await t.test('legacy credentials migrate into SQLite with execution paused',async()=>{
  const state=await snapshot();assert.equal(state.policy.paused,true);assert.deepEqual(state.policy.allowedSymbols,[]);assert.equal(state.connection.terminalKey,terminal);assert.equal(state.online,false);
  assert.equal(inspect('PRAGMA integrity_check')[0][0],'ok');assert.equal(inspect('PRAGMA user_version')[0][0],1);assert.ok(!output.includes(admin));
  assert.equal(state.signals.find(s=>s.id==='legacy-filled').ticket,'old-test-deal');assert.equal(state.signals.find(s=>s.id==='legacy-queued').status,'expired');assert.equal(state.signals.find(s=>s.id==='legacy-dispatched').status,'unknown');
  assert.equal((await request('/api/admin/resolve/legacy-dispatched',admin,{})).status,200);
  assert.equal((await fetch(base+'/api/admin/state')).status,401);assert.equal((await request(poll,admin)).status,401);
 });
 await configure();
 await t.test('authenticated receipts survive offline delivery, duplicates and rejected input',async()=>{
  assert.equal((await send('offline-first')).status,202);assert.equal((await send('offline-second')).status,202);
  assert.equal((await send('offline-first')).status,200);assert.equal((await send('offline-first',{lots:0.02})).status,409);
  assert.equal((await request('/api/webhook/demo-mt5','wrong',alert('unauthorized'))).status,401);
  assert.equal((await send('invalid',{symbol:'bad\n'})).status,400);
  assert.equal((await send('blocked-symbol',{symbol:'OTHER'})).status,422);
  const body=await (await request('/api/admin/receipts',admin)).json();assert.equal(body.receipts.length,6);assert.ok(!JSON.stringify(body).includes(webhook));
  const outcomes=body.receipts.map(r=>r.disposition);assert.ok(outcomes.includes('duplicate'));assert.ok(outcomes.includes('conflict'));assert.ok(outcomes.includes('invalid'));
  const raw=await fetch(base+'/api/webhook/demo-mt5',{method:'POST',headers:{'X-Bridge-Key':webhook,'Content-Type':'application/json'},body:'{"lots":'});assert.equal(raw.status,400);
  await stop();await start();assert.equal((await send('offline-first')).status,200);
  const payload=await fetch(base+'/api/webhook/demo-mt5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(alert('json-secret',{secret:webhook}))});assert.equal(payload.status,202);
  assert.equal((await request(poll.replace('mode=demo','mode=live'),terminal)).status,400);
  const simultaneous=await Promise.all([request(poll,terminal),request(poll,terminal)]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,204]);assert.match(await simultaneous.find(r=>r.status===200).text(),/^v1\|offline-first\|/);
  assert.equal((await request(poll,terminal)).status,204);await finish('offline-first');
  assert.match(await (await request(poll,terminal)).text(),/^v1\|offline-second\|/);await finish('offline-second');
  assert.match(await (await request(poll,terminal)).text(),/^v1\|json-secret\|/);await finish('json-secret');
 });
 await t.test('paused and stale commands never dispatch, even after restart',async()=>{
  await configure({paused:true});assert.equal((await send('paused')).status,202);assert.equal((await request(poll,terminal)).status,204);
  await stop();await start();assert.equal((await snapshot()).policy.paused,true);assert.equal((await request(poll,terminal)).status,204);
  await configure();assert.match(await (await request(poll,terminal)).text(),/^v1\|paused\|/);await finish('paused');
  assert.equal((await send('stale',{sentAt:'2000-01-01T00:00:00Z'})).status,202);assert.equal((await request(poll,terminal)).status,204);assert.equal((await snapshot()).signals.find(s=>s.id==='stale').status,'expired');
  assert.equal((await send('future',{sentAt:'2099-01-01T00:00:00Z'})).status,400);
  await configure({paused:true});await send('risk-change');await configure({maxLots:0.005});assert.equal((await request(poll,terminal)).status,204);assert.equal((await snapshot()).signals.find(s=>s.id==='risk-change').status,'rejected');await configure();
  await configure({paused:true,maxAgeSeconds:5});await send('offline-expiry');await new Promise(r=>setTimeout(r,5500));await stop();await start();await configure();assert.equal((await request(poll,terminal)).status,204);assert.equal((await snapshot()).signals.find(s=>s.id==='offline-expiry').status,'expired');
 });
 await t.test('identity validation and terminal JSON round-trip remain exact',async()=>{
  for(const invalid of ['tail\n','tail\r','mid\tvalue','nul\0value']) {
   assert.equal((await send(invalid)).status,400);assert.equal((await send('invalid-symbol',{symbol:invalid})).status,400);
  }
  assert.equal((await send('x'.repeat(129))).status,400);assert.equal((await send('long-symbol',{symbol:'S'.repeat(33)})).status,400);
  const id='i'.repeat(128), symbol='S'.repeat(32);await configure({allowedSymbols:[symbol]});assert.equal((await send(id,{symbol})).status,202);
  assert.equal(await (await request(poll,terminal)).text(),`v1|${id}|buy|${symbol}|0.01|200|400`);
  const detail='quote " slash \\ tab\t line\n return\r nul\0';const result={id,status:'filled',ticket:'ticket-"\\\n',detail};
  assert.equal((await request('/api/terminal/result',terminal,result)).status,200);assert.equal((await request('/api/terminal/result',terminal,result)).status,200);
  const saved=(await snapshot()).signals.find(s=>s.id===id);assert.equal(saved.detail,detail);assert.equal(saved.ticket,result.ticket);await configure();
 });
 await t.test('dashboard and telemetry do not rewrite the database journal',async()=>{
  const wal=path.join(directory,'bridge.db-wal');const before=await readFile(wal);
  for(let i=0;i<5;i++){await snapshot();assert.equal((await request(poll.replace('balance=10000','balance=10001'),terminal)).status,204);}
  assert.deepEqual(await readFile(wal),before);assert.equal((await snapshot()).connection.balance,10001);
 });
 await t.test('dispatched commands become unknown on restart and block the FIFO queue',async()=>{
  await send('interrupted');await send('after-unknown');assert.equal((await request(poll,terminal)).status,200);await stop();await start();
  assert.equal((await snapshot()).signals.find(s=>s.id==='interrupted').status,'unknown');assert.equal((await request(poll,terminal)).status,204);
  assert.equal((await request('/api/admin/resolve/interrupted',admin,{})).status,200);assert.match(await (await request(poll,terminal)).text(),/^v1\|after-unknown\|/);await finish('after-unknown');
  assert.equal((await request(poll.replace('12345','99999'),terminal)).status,409);
 });
 await t.test('transaction failure cannot acknowledge or expose a command',async()=>{
  execFileSync(python,['-c',`import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TRIGGER test_receipt_failure BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'test failure'); END"); c.commit()`,path.join(directory,'bridge.db')]);
  try{assert.equal((await send('failed-commit')).status,503);}finally{execFileSync(python,['-c','import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("DROP TRIGGER test_receipt_failure"); c.commit()',path.join(directory,'bridge.db')]);}
  assert.ok(!(await snapshot()).signals.some(s=>s.id==='failed-commit'));assert.equal(inspect("SELECT count(*) FROM commands WHERE id='failed-commit'")[0][0],0);assert.equal((await request(poll,terminal)).status,204);
 });
 await t.test('deduplication persists beyond the recent dashboard window',async()=>{
  for(let i=0;i<205;i++){const began=performance.now();const response=await send('history-'+i,{sentAt:'2000-01-01T00:00:00Z'});assert.equal(response.status,202);await response.json();ingressMs.push(performance.now()-began);}
  assert.ok(Math.max(...ingressMs)<3000,'durable acknowledgement must finish within TradingView timeout on the tested workload');
  assert.equal((await snapshot()).signals.length,200);assert.equal((await send('offline-first')).status,200);assert.equal((await send('offline-first',{lots:0.02})).status,409);
  await stop();await start();assert.equal((await send('offline-first')).status,200);assert.equal((await request(poll,terminal)).status,204);
 });
 await t.test('consistent backup and restore preserve history without replaying queued orders',async()=>{
  await send('restore-dispatched');assert.equal((await request(poll,terminal)).status,200);await configure({paused:true});await send('restore-pending');
  const r=await request('/api/admin/backup',admin,{});assert.equal(r.status,200);const result=await r.json();assert.equal(result.integrity,'ok');
  const restored=await mkdtemp(path.join(root,'restored-'));
  execFileSync(python,['scripts/db-maintenance.py','restore',path.join(directory,'backups',result.file),restored]);
  await stop();directory=restored;await start();const state=await snapshot();assert.equal(state.policy.paused,true);assert.equal(state.connection.account,'12345');assert.equal(state.signals.find(s=>s.id==='restore-pending').status,'expired');
  assert.equal(state.signals.find(s=>s.id==='restore-dispatched').status,'unknown');await configure();assert.equal((await request(poll,terminal)).status,204);assert.equal((await send('offline-first')).status,200);
  const receipts=await (await request('/api/admin/receipts',admin)).json();assert.ok(receipts.receipts.length>0);
  await stop();directory=original;await start();
 });
 await t.test('SignalR portal handshake and receipt notifications remain available',async()=>{
  const r=await fetch(base+'/hub/portal/negotiate?negotiateVersion=1',{method:'POST',headers:{Authorization:'Bearer '+admin}});assert.equal(r.status,200);const n=await r.json();
  const ws=new WebSocket(base.replace('http:','ws:')+'/hub/portal?id='+encodeURIComponent(n.connectionToken)+'&access_token='+admin);t.after(()=>ws.close());await once(ws,'open');const messages=[];ws.addEventListener('message',e=>messages.push(e.data));ws.send(JSON.stringify({protocol:'json',version:1})+'\x1e');
  for(let i=0;i<40&&!messages.some(m=>String(m).includes('{}'));i++)await new Promise(r=>setTimeout(r,50));assert.ok(messages.some(m=>String(m).includes('{}')));
  await send('notify',{sentAt:'2000-01-01T00:00:00Z'});for(let i=0;i<50&&!messages.some(m=>String(m).includes('changed'));i++)await new Promise(r=>setTimeout(r,50));assert.ok(messages.some(m=>String(m).includes('changed')));ws.close();
 });
 ingressMs.sort((a,b)=>a-b);
 await writeFile(path.join(root,'validation-metrics.json'),JSON.stringify({scope:'synthetic loopback SQLite and protocol only; no broker',databaseIntegrity:inspect('PRAGMA integrity_check')[0][0],receiptCount:inspect('SELECT count(*) FROM receipts')[0][0],commandCount:inspect('SELECT count(*) FROM commands')[0][0],ingress:{requests:ingressMs.length,concurrency:1,p95Ms:ingressMs[Math.floor(ingressMs.length*0.95)],maxMs:Math.max(...ingressMs)}}));
});

`````

## tests/pentagi/offline-flow.json

`````text
{
  "provider": "ollama",
  "input": "Owner-authorized supervised OFFLINE validation of this original Relay demo copy only. The operator must verify a worker with only loopback networking, no external route, no Docker socket, no privileged mode, and a case-only /work mount before starting this flow. Require preinstalled Node.js 22+ and .NET 10, source /opt/target, and a prebuilt /opt/bridge-bin/BridgeDemo.dll. Do not test MT5, brokers, the host, other containers, other systems or the Internet. Do not install software or modify source. Run exactly once through terminal: cd /opt/target && DOTNET_EXE=dotnet BRIDGE_DLL=/opt/bridge-bin/BridgeDemo.dll BRIDGE_TEST_ARTIFACTS=/work/validation node --test tests/integration.mjs . This fixed suite creates fresh synthetic keys and uses its own ephemeral loopback port, never the running preview. Do not rerun it or add extra HTTP tests. Read /work/validation/validation-metrics.json using terminal with that exact absolute path. Report test exit status, actual failures and measured timings; never output fixture credentials or claim a failed read succeeded. Write /work/report.md and finish. If prerequisites are missing, stop and report the limitation. This is supervised regression verification, not independent discovery or a complete security audit.",
  "functions": {
    "disabled": [
      {"name":"search","context":["agent","adviser","coder","searcher","generator","memorist","enricher","reporter","assistant"]},
      {"name":"search_answer","context":["agent","adviser","coder","searcher","generator","memorist","enricher","reporter","assistant"]},
      {"name":"web_search","context":["agent","adviser","coder","searcher","generator","memorist","enricher","reporter","assistant"]},
      {"name":"browser","context":["agent","adviser","coder","searcher","generator","memorist","enricher","reporter","assistant"]},
      {"name":"maintenance","context":["agent","adviser","coder","searcher","generator","memorist","enricher","reporter","assistant"]}
    ]
  }
}

`````

## Dockerfile

`````text
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY . .
RUN dotnet restore --configfile NuGet.Config --locked-mode && dotnet publish --no-restore -c Release -o /out
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_URLS=http://127.0.0.1:5080
ENV BRIDGE_DATA=/data
USER $APP_UID
ENTRYPOINT ["dotnet", "BridgeDemo.dll"]

`````

## .dockerignore

`````text
.git
.tools
data
artifacts
bin
obj
mt5/*.ex5
mt5/*.log
**/*.db
**/*.db-wal
**/*.db-shm
**/*.sqlite

`````

## .gitignore

`````text
.env
data/
node_modules/
bin/
obj/
*.log
.tools/
artifacts/
mt5/*.ex5
mt5/*.log
*.db
*.db-wal
*.db-shm
*.sqlite

`````

## .gitattributes

`````text
* text=auto eol=lf
*.png binary
*.ex5 binary

`````

## .github/workflows/ci.yml

`````text
name: Build and verify
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: dotnet restore --configfile NuGet.Config --locked-mode
      - run: dotnet build --no-restore --configuration Release --warnaserror
      - run: node --check wwwroot/app.js
      - run: mkdir -p artifacts
      - run: node --test --test-reporter=spec --test-reporter=junit --test-reporter-destination=stdout --test-reporter-destination=artifacts/protocol-tests.xml tests/integration.mjs
        env:
          BRIDGE_DLL: bin/Release/net10.0/BridgeDemo.dll
      - run: node scripts/validation-manifest.mjs
        if: always()
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: relay-validation-${{ github.sha }}
          path: |
            artifacts/protocol-tests.xml
            artifacts/validation-metrics.json
            artifacts/validation-manifest.json
          if-no-files-found: warn
      - run: dotnet publish --no-restore --configuration Release --output artifacts/publish
      - run: node scripts/check-publish.mjs artifacts/publish
      - uses: actions/upload-artifact@v4
        with:
          name: relay-preview
          path: |
            artifacts/publish/
            mt5/RelayDemo.mq5
            mt5/RelayDemoRemote.mq5
            README.md
            docs/

`````

## .github/workflows/container.yml

`````text
name: Publish container (manual)
on:
  workflow_dispatch:
permissions:
  contents: read
  packages: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/leadinggene-netizen/rearepo1025:${{ github.sha }}

`````
