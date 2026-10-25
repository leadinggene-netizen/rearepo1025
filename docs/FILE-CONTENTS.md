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
<configuration><packageSources><clear /></packageSources></configuration>

`````

## Models.cs

`````text
namespace BridgeDemo;

public sealed class BridgeState
{
    public string AdminKey { get; set; } = Guid.NewGuid().ToString("N");
    public Connection Connection { get; set; } = new();
    public List<Signal> Signals { get; set; } = [];
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
    public DateTimeOffset? DispatchedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Status { get; set; } = "queued";
    public string? Ticket { get; set; }
    public string? Detail { get; set; }
}

public sealed record AlertRequest(string Id, string Action, string Symbol, double Lots = 0.01,
    double SlPoints = 0, double TpPoints = 0, string? Secret = null);
public sealed record ResultRequest(string Id, string Status, string Ticket, string Detail);

`````

## StateStore.cs

`````text
using System.Text.Json;

namespace BridgeDemo;

public sealed class StateStore : IDisposable
{
    readonly object gate = new();
    readonly FileStream lease;
    readonly string path;
    readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    BridgeState state;

    public StateStore(string directory)
    {
        Directory.CreateDirectory(directory);
        lease = new FileStream(Path.Combine(directory, "server.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        path = Path.Combine(directory, "state.json");
        state = File.Exists(path)
            ? JsonSerializer.Deserialize<BridgeState>(File.ReadAllText(path), json) ?? throw new InvalidDataException("Empty state")
            : new BridgeState();
        // A persisted heartbeat is not evidence that a terminal is connected after restart.
        state.Connection = DurableConnection(state.Connection);
        // Never redeliver a possibly executed command after a crash.
        foreach (var signal in state.Signals.Where(s => s.Status == "dispatched"))
        {
            signal.Status = "unknown";
            signal.Detail = "Server restarted after dispatch; inspect MT5 before submitting a new command.";
        }
        Save(state);
    }

    void Save(BridgeState value)
    {
        using (var stream = new FileStream(path + ".tmp", FileMode.Create, FileAccess.Write, FileShare.None))
        {
            JsonSerializer.Serialize(stream, new BridgeState {
                AdminKey = value.AdminKey, Connection = DurableConnection(value.Connection), Signals = value.Signals
            }, json);
            stream.Flush(true);
        }
        File.Move(path + ".tmp", path, true);
    }

    public T Read<T>(Func<BridgeState, T> read)
    {
        lock (gate) return read(state);
    }

    public T Change<T>(Func<BridgeState, T> change)
    {
        lock (gate)
        {
            // Commit to disk before exposing the changed state or delivering a command.
            var next = new BridgeState {
                AdminKey = state.AdminKey, Connection = state.Connection with { },
                Signals = state.Signals.Select(s => s with { }).ToList()
            };
            var result = change(next);
            if (next.AdminKey != state.AdminKey ||
                DurableConnection(next.Connection) != DurableConnection(state.Connection) ||
                !next.Signals.SequenceEqual(state.Signals)) Save(next);
            state = next;
            return result;
        }
    }

    static Connection DurableConnection(Connection value) => value with {
        LastSeen = null, Balance = 0, Equity = 0, Positions = 0
    };

    public void Dispose() => lease.Dispose();
}

`````

## Program.cs

`````text
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
    // This preview is deliberately a loopback service, even if a URL is accidentally changed.
    var ip = context.Connection.RemoteIpAddress;
    if (ip is null || !IPAddress.IsLoopback(ip)) { context.Response.StatusCode = 403; return; }
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    var path = context.Request.Path;
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
Console.WriteLine("Portal: http://127.0.0.1:5080");
Console.WriteLine("Admin key (paste into portal): " + store.Read(s => s.AdminKey));
app.Run();

public sealed class PortalHub : Hub { }

`````

## wwwroot/index.html

`````text
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relay / MT5 bridge</title><link rel="stylesheet" href="/style.css"></head>
<body><aside><a class="brand" href="/">↗ <strong>relay<span>Trading bridge lab</span></strong></a><div class="nav">◉ &nbsp; Workspace</div><div class="aside-note">INDEPENDENT IMPLEMENTATION<br>ASP.NET Core · SignalR · MT5</div><div class="demo-badge">DEMO ACCOUNTS ONLY</div></aside>
<main><header><div><div class="eyebrow">YOUR EXECUTION WORKSPACE</div><h1>A clear path from alert to order.</h1><p>Connect a demo terminal, send an instruction, and inspect its actual result.</p></div><span id="live" class="pill">Portal locked</span></header>
<section id="login" class="card login"><h2>Open your local workspace</h2><p>Paste the admin key printed by the server. It stays in this tab’s memory.</p><form id="login-form"><input id="admin-key" type="password" autocomplete="off" placeholder="Admin key" required><button>Connect portal →</button></form></section>
<div id="workspace" hidden><section class="stats"><div class="card"><label>Terminal</label><strong id="terminal-status">Offline</strong><small id="account-label">Awaiting MT5</small></div><div class="card"><label>Balance</label><strong id="balance">—</strong><small>Account currency</small></div><div class="card"><label>Equity</label><strong id="equity">—</strong><small>Reported by your terminal</small></div><div class="card"><label>Open positions</label><strong id="positions">—</strong><small>Whole account count</small></div></section>
<div class="columns"><section class="card"><div class="eyebrow">01 / CONNECT</div><h2>Your MT5 connection</h2><p>Attach <code>RelayDemo.mq5</code> to one chart on your demo account. Enter your account login and the terminal key below.</p><dl><dt>Bridge URL</dt><dd><code id="base-url"></code></dd><dt>Connection ID</dt><dd><code>demo-mt5</code></dd><dt>Terminal key</dt><dd><input id="terminal-key" type="password" readonly aria-label="Terminal key"><button type="button" id="show-key" class="subtle">Show / hide</button></dd></dl><p class="note">In MT5: Tools → Options → Expert Advisors → allow WebRequest for this URL. Enable Algo Trading. No DLL required.</p></section>
<section class="card"><div class="eyebrow">02 / SEND</div><h2>Send a demo instruction</h2><p>Symbols must match your broker exactly. SL/TP distances use broker points.</p><form id="signal-form"><div class="form-grid"><label>Action<select id="action"><option value="buy">Buy</option><option value="sell">Sell</option><option value="close">Close own positions</option></select></label><label>Broker symbol<input id="symbol" value="EURUSD" required maxlength="32"></label><label>Lots<input id="lots" type="number" value="0.01" min="0.01" max="1" step="0.01" required></label><label>SL distance · points<input id="sl" type="number" value="200" min="0" max="100000" required></label><label>TP distance · points<input id="tp" type="number" value="400" min="0" max="100000" required></label></div><button id="send" disabled>Send to demo MT5 →</button><small id="send-note">Connect the EA first.</small></form></section></div>
<section class="card journal"><div class="section-heading"><div><div class="eyebrow">03 / VERIFY</div><h2>Execution journal</h2></div><span class="pill">Receipt ≠ execution</span></div><div class="table-scroll"><table><thead><tr><th>Received</th><th>Request</th><th>Instruction</th><th>Status</th><th>Broker reference / detail</th></tr></thead><tbody id="signals"></tbody></table></div><p id="empty">Your first instruction will appear here. Nothing has been sent yet.</p></section>
<details class="card"><summary>Webhook integration</summary><p>A unique ID identifies each intended action. Repeating that ID with the same payload returns the existing command.</p><pre id="webhook-example"></pre><p>The webhook key is separate from the portal and terminal keys. This local preview cannot receive TradingView cloud webhooks directly. Read the deployment guide before exposing a service.</p></details></div>
<div id="message" role="status" aria-live="polite"></div><footer>Relay / independent implementation · Local preview · Verify every broker result</footer></main>
<script src="/vendor/signalr.min.js"></script><script src="/app.js"></script></body></html>

`````

## wwwroot/style.css

`````text
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#dfe9ee;background:#10191e;font-size:14px;color-scheme:dark}*{box-sizing:border-box}body{margin:0;display:flex}aside{width:230px;position:fixed;inset:0 auto 0 0;border-right:1px solid #2b393f;padding:36px 24px;background:#121f25}.brand{display:flex;gap:12px;font-size:32px;color:#81ddc1;text-decoration:none;align-items:center}.brand strong{font-size:25px;color:#ecf4f6;letter-spacing:-1px}.brand span{display:block;font-size:11px;color:#9dafb6;font-weight:400;letter-spacing:.5px;margin-top:5px}.nav{margin-top:55px;border:1px solid #3e615a;border-radius:9px;padding:14px;background:#213b36;color:#9ce9d0}.aside-note{position:absolute;bottom:100px;font-size:10px;line-height:2;letter-spacing:1px;color:#789098}.demo-badge{position:absolute;bottom:35px;font-size:10px;letter-spacing:1px;color:#e1bf87;border:1px solid #70593d;border-radius:5px;padding:9px}main{margin-left:230px;padding:48px 5%;width:calc(100% - 230px);max-width:1700px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;gap:25px}.eyebrow{font-size:10px;letter-spacing:2px;font-weight:700;color:#88b5ae;margin-bottom:15px}h1{font-size:clamp(25px,3vw,39px);line-height:1.2;letter-spacing:-1.4px;margin:0 0 15px;font-weight:500}p{color:#9bafb8;line-height:1.7;margin:12px 0 22px}h2{font-size:19px;font-weight:500;margin:0 0 12px;letter-spacing:-.3px}.card{background:#18262d;border:1px solid #30434b;border-radius:12px;padding:27px;box-shadow:0 5px 15px #0000000a}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}.stats label{display:block;color:#9bafb8;font-size:12px}.stats strong{display:block;font-size:27px;font-weight:500;margin:15px 0 9px}.stats small{color:#829aa4;font-size:11px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}.pill{font-size:11px;border:1px solid #3c535b;padding:8px 12px;border-radius:20px;color:#9eb9be;white-space:nowrap}.pill.online{color:#99e6c7;border-color:#477764}input,select{padding:12px;background:#112027;border:1px solid #3c525b;color:#dfe9ee;border-radius:6px;font:inherit;width:100%;margin-top:8px}input:focus,select:focus,button:focus-visible{outline:2px solid #84dfbf;outline-offset:2px}button{background:#98e1c6;border:0;color:#142a24;border-radius:6px;padding:13px 18px;font:inherit;font-weight:650;cursor:pointer;margin-top:18px}button:hover{background:#b5f2db}button:disabled{opacity:.4;cursor:not-allowed}.subtle{padding:7px 10px;background:transparent;color:#9cdac5;border:1px solid #3c6057;font-size:11px;margin-top:8px}dt{font-size:11px;color:#8ca1aa;margin-top:18px}dd{margin:7px 0 0}code{font-family:ui-monospace,monospace;font-size:12px;color:#bcded9}.note{border-left:2px solid #5e9e8b;padding-left:15px;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.form-grid label{font-size:11px;color:#9fb5be}#send-note{display:block;color:#8fa5ad;margin-top:12px;font-size:11px}.section-heading{display:flex;justify-content:space-between;align-items:center}.journal{margin-bottom:24px}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:680px;text-align:left;margin-top:20px}th{color:#8ea8b2;font-size:10px;letter-spacing:.8px;text-transform:uppercase;font-weight:500;padding:14px 8px;border-bottom:1px solid #3a4d55}td{padding:18px 8px;border-bottom:1px solid #2d4049;font-size:12px;vertical-align:top}td:last-child{max-width:320px;overflow-wrap:anywhere}.status{color:#d8bc7e}.status.filled,.status.closed{color:#96e0c2}.status.rejected,.status.unknown{color:#f1a49c}#empty{text-align:center;padding:30px;font-size:12px}details{margin-bottom:20px}summary{cursor:pointer;color:#b6d4d2}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#101e24;padding:18px;font-size:11px;line-height:1.8;border-radius:6px}#message{position:fixed;bottom:25px;right:25px;max-width:430px;white-space:pre-wrap;background:#244b43;color:#d7f6e9;border-radius:8px;padding:16px;display:none;box-shadow:0 5px 30px #0005}footer{font-size:10px;color:#6e8a94;letter-spacing:.6px;padding:16px 0}.login{max-width:600px}.login form{display:flex;align-items:end;gap:12px}.login input{flex:1}.login button{white-space:nowrap}[hidden]{display:none!important}@media(max-width:1050px){aside{width:180px;padding:30px 16px}main{margin-left:180px;width:calc(100% - 180px);padding:30px 24px}.columns{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){body{display:block}aside{position:static;width:100%;height:82px;padding:18px 22px;border-right:0;border-bottom:1px solid #2b393f}.brand{font-size:25px}.brand strong{font-size:21px}.brand span,.nav,.aside-note,.demo-badge{display:none}main{margin:0;width:100%;padding:27px 17px}header{align-items:start;flex-direction:column;gap:8px}.card{padding:21px}.stats{gap:10px}.stats .card{padding:18px}.stats strong{font-size:23px}.form-grid{gap:12px}.login form{display:block}.login button{width:100%}.section-heading{align-items:start;gap:12px}.section-heading .pill{font-size:9px}#message{left:15px;right:15px;bottom:15px}}

`````

## wwwroot/app.js

`````text
const $ = id => document.getElementById(id);
let adminKey = '', current, connection, noticeTimer;
function notify(text) { $('message').textContent = text; $('message').style.display = 'block'; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('message').style.display = 'none', 7000); }
async function api(path, options = {}, key = adminKey) {
  const response = await fetch(path, { ...options, headers: { 'X-Bridge-Key': key, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0,400)}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}
function cell(row, text, className) { const td = row.insertCell(); td.textContent = text; if (className) td.className = className; return td; }
async function refresh() {
  current = await api('/api/admin/state');
  const c = current.connection;
  $('terminal-status').textContent = current.online ? 'Connected' : 'Offline';
  $('account-label').textContent = c.account ? `${c.account} / ${c.broker}` : 'Awaiting MT5';
  $('balance').textContent = c.account ? c.balance.toLocaleString() : '—';
  $('equity').textContent = c.account ? c.equity.toLocaleString() : '—';
  $('positions').textContent = c.account ? c.positions : '—';
  $('terminal-key').value = c.terminalKey; $('base-url').textContent = location.origin;
  const pending = current.signals.some(s => ['queued','dispatched','unknown'].includes(s.status));
  $('send').disabled = !current.online || pending;
  $('send-note').textContent = !current.online ? 'Connect the EA first.' : pending ? 'Waiting for a result. Inspect MT5 if the outcome is unknown.' : 'This sends an actual instruction to your demo account.';
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
  $('webhook-example').textContent = `POST ${location.origin}/api/webhook/${c.id}\nX-Bridge-Key: ${c.webhookKey}\nContent-Type: application/json\n\n${JSON.stringify({id:'alert-unique-001',action:'buy',symbol:'EURUSD',lots:0.01,slPoints:200,tpPoints:400},null,2)}`;
}
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

## mt5/RelayDemo.mq5

`````text
#property strict
#property version "1.000"
#property description "Independent local alert bridge. DEMO accounts only."
#include <Trade/Trade.mqh>

input string BridgeUrl = "http://127.0.0.1:5080";
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
      "Content-Type: application/json\r\nX-Bridge-Key: " + TerminalKey + "\r\n", 1500, data, result, headers);
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
   if(BridgeUrl != "http://127.0.0.1:5080") { Print("This adapter build permits only the local demo server URL."); return INIT_PARAMETERS_INCORRECT; }
   journal = StringFormat("relay-demo-%I64d-%I64u.json", ExpectedLogin, MagicNumber);
   trade.SetExpertMagicNumber(MagicNumber); trade.SetDeviationInPoints(DeviationPoints); trade.SetAsyncMode(false);
   EventSetTimer(1);
   Print("Relay connected locally. No live accounts supported. Keep this EA on only one chart.");
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

## scripts/run.ps1

`````text
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$localDotnet = Join-Path $projectDirectory '.tools/dotnet/dotnet.exe'
$dotnetCommand = if (Test-Path -LiteralPath $localDotnet) { $localDotnet } else { 'dotnet' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_CLI_HOME = Join-Path $projectDirectory '.tools/home'
$env:APPDATA = Join-Path $projectDirectory '.tools/appdata'
New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null
$env:NUGET_PACKAGES = Join-Path $projectDirectory '.tools/nuget'
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
if (-not (Test-Path -LiteralPath 'wwwroot/vendor/signalr.min.js')) { & "$PSScriptRoot/prepare-client.ps1" }
if (-not $NoBuild) {
    & $dotnetCommand restore --configfile NuGet.Config
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
& $env:DOTNET_EXE restore --configfile NuGet.Config
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
    if(excluded.has(entry.name.toLowerCase()) || ['state.json','server.lock'].includes(entry.name.toLowerCase()))
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
    'BridgeDemo.csproj', 'global.json', 'NuGet.Config', 'Models.cs', 'StateStore.cs', 'Program.cs',
    'wwwroot/index.html', 'wwwroot/style.css', 'wwwroot/app.js', 'mt5/RelayDemo.mq5',
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

const files=['BridgeDemo.csproj','global.json','NuGet.Config','Program.cs','StateStore.cs','Models.cs','mt5/RelayDemo.mq5','tests/integration.mjs','tests/pentagi/offline-flow.json','.github/workflows/ci.yml'];
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
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, stat, utimes, rmdir } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';

test('HTTP, SignalR, durable command lifecycle and restart recovery (no broker)', {timeout:45000}, async t => {
  const artifacts=path.resolve(process.env.BRIDGE_TEST_ARTIFACTS || 'artifacts');
  await mkdir(artifacts, {recursive:true});
  const directory = await mkdtemp(path.join(artifacts,'test-'));
  const listener = net.createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  assert.notEqual(port,5080,'tests must never use the MT5-connected preview port');
  const base = `http://127.0.0.1:${port}`;
  const dotnet = process.env.DOTNET_EXE || 'dotnet';
  const dll = process.env.BRIDGE_DLL || path.resolve('bin/Debug/net10.0/BridgeDemo.dll');
  let server, output = '';
  async function start() {
    output = '';
    server = spawn(dotnet, [dll], {env:{...process.env,BRIDGE_DATA:directory,ASPNETCORE_URLS:base,DOTNET_PROCESSOR_COUNT:'1'},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b);
    server.on('error', e => { output += e.message; });
    for(let i=0;i<150;i++) {
      if(server.exitCode !== null) throw new Error(`Server exited: ${output.replace(/\b[0-9a-f]{32}\b/gi,'<TEST-KEY-REDACTED>')}`);
      try { if((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve,100));
    }
    throw new Error(`Server not ready: ${output.replace(/\b[0-9a-f]{32}\b/gi,'<TEST-KEY-REDACTED>')}`);
  }
  async function stop() { if(server && server.exitCode === null && server.signalCode === null) { const exited = once(server,'exit'); server.kill(); await exited; } }
  t.after(stop); await start();
  const statePath = path.join(directory,'state.json');
  const secrets = JSON.parse(await readFile(statePath,'utf8'));
  const admin = secrets.adminKey, terminal = secrets.connection.terminalKey, webhook = secrets.connection.webhookKey;
  function request(route,key,body) { return fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-Bridge-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}); }
  const poll = '/api/terminal/poll?mode=demo&account=12345&broker=Test-Demo&balance=10000&equity=9999&positions=0';
  const alert = {id:'first-alert',action:'buy',symbol:'EURUSD',lots:0.01,slPoints:200,tpPoints:400};
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await request('/api/admin/state','wrong')).status,401);
  assert.equal((await request('/api/admin/state',terminal)).status,401);
  assert.equal((await request('/hub/portal/negotiate?negotiateVersion=1','wrong',{})).status,401);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,alert)).status,409,'offline terminal blocks stale orders');
  assert.equal((await request(poll.replace('mode=demo','mode=live'),terminal)).status,400);
  assert.equal((await request(poll,terminal)).status,204);
  await t.test('unchanged dashboard and heartbeat do not rewrite durable state',async()=>{
    const saved=await readFile(statePath,'utf8');
    const sentinel=new Date('2000-01-01T00:00:00Z'); await utimes(statePath,sentinel,sentinel);
    const timestamp=(await stat(statePath)).mtimeMs;
    await request('/api/admin/state',admin);
    await request(poll.replace('balance=10000','balance=10001'),terminal);
    const current=await (await request('/api/admin/state',admin)).json();
    assert.equal(current.connection.balance,10001,'telemetry is updated in memory');
    assert.ok((await readFile(statePath,'utf8'))===saved,'read/telemetry must not change durable content');
    assert.equal((await stat(statePath)).mtimeMs,timestamp,'read/telemetry must not rewrite the file');
  });
  await t.test('control characters and oversized identity fields are rejected without enqueueing',async()=>{
    for(const invalid of ['valid\n','valid\r','valid\r\n','mid\ndle','tab\tvalue','nul\0value']) {
      assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:invalid})).status,400);
      assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,symbol:invalid})).status,400);
    }
    assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'a'.repeat(129)})).status,400);
    assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,symbol:'a'.repeat(33)})).status,400);
    assert.equal((await request(poll.replace('12345','12345%0A'),terminal)).status,400);
    assert.equal((await request(poll,terminal)).status,204,'invalid commands never enter the queue');
  });
  await t.test('failed durable save cannot publish a queued command',async()=>{
    await mkdir(statePath+'.tmp');
    try {
      assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'failed-save'})).status,500);
    } finally { await rmdir(statePath+'.tmp'); }
    const snapshot=await (await request('/api/admin/state',admin)).json();
    assert.equal(snapshot.signals.length,0,'failed transaction must not leak into memory');
    assert.equal((await request(poll,terminal)).status,204,'failed command must never be delivered');
  });
  assert.equal((await request(poll.replace('12345','99999'),terminal)).status,409,'account identity is bound');
  assert.equal((await request('/api/webhook/demo-mt5',terminal,alert)).status,401);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,lots:50})).status,400);

  const negotiation = await (await fetch(base+'/hub/portal/negotiate?negotiateVersion=1', {method:'POST',headers:{Authorization:`Bearer ${admin}`}})).json();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/hub/portal?id=${encodeURIComponent(negotiation.connectionToken)}&access_token=${admin}`);
  t.after(() => ws.close());
  await once(ws,'open');
  const messages=[]; ws.addEventListener('message', e => messages.push(e.data));
  ws.send(JSON.stringify({protocol:'json',version:1})+'\x1e');
  for(let i=0;i<30 && !messages.length;i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(messages.some(m=>m.includes('{}')),'SignalR handshake completed');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,alert)).status,202);
  assert.equal((await fetch(base+'/api/webhook/demo-mt5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...alert,secret:webhook})})).status,200,'TradingView-compatible JSON secret');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,alert)).status,200,'same ID is idempotent');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,lots:0.02})).status,409);
  const simultaneous = await Promise.all([request(poll,terminal),request(poll,terminal)]);
  assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,204],'only one poll receives the command');
  const wire = await simultaneous.find(x=>x.status===200).text();
  assert.equal(wire,'v1|first-alert|buy|EURUSD|0.01|200|400');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'blocked'})).status,409);
  const result = {id:alert.id,status:'filled',ticket:'test-deal-01',detail:'Protocol test only; no broker execution'};
  assert.equal((await request('/api/terminal/result',webhook,result)).status,401);
  assert.equal((await request('/api/terminal/result',terminal,result)).status,200);
  assert.equal((await request('/api/terminal/result',terminal,result)).status,200,'result retries are idempotent');
  assert.equal((await request('/api/terminal/result',terminal,{...result,status:'closed'})).status,409);
  await t.test('maximum-length identity and JSON result strings round-trip exactly',async()=>{
    const boundary={...alert,id:'a'.repeat(128),symbol:'s'.repeat(32)};
    assert.equal((await request('/api/webhook/demo-mt5',webhook,boundary)).status,202);
    const persisted=JSON.parse(await readFile(statePath,'utf8'));
    assert.equal(persisted.signals.at(-1).status,'queued','acceptance is durable');
    assert.equal(await (await request(poll,terminal)).text(),`v1|${boundary.id}|buy|${boundary.symbol}|0.01|200|400`);
    const dispatched=JSON.parse(await readFile(statePath,'utf8'));
    assert.equal(dispatched.signals.at(-1).status,'dispatched','dispatch is durable before delivery');
    const detail='quote " slash \\ controls \n\r\t\b\f\u0001 unicode €';
    assert.equal((await request('/api/terminal/result',terminal,{id:boundary.id,status:'rejected',ticket:'',detail})).status,200);
    const snapshot=await (await request('/api/admin/state',admin)).json();
    assert.equal(snapshot.signals[0].id,boundary.id);
    assert.equal(snapshot.signals[0].symbol,boundary.symbol);
    assert.equal(snapshot.signals[0].detail,detail);
  });
  const dashboard = await (await request('/api/admin/state',admin)).json();
  assert.equal(dashboard.signals.find(s=>s.id===alert.id).status,'filled'); assert.equal(dashboard.connection.equity,9999);
  for(let i=0;i<20&&!messages.some(m=>m.includes('changed'));i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(messages.some(m=>m.includes('changed')),'SignalR broadcasts actual state changes');
  ws.close();

  const second = {...alert,id:'interrupted'};
  assert.equal((await request('/api/webhook/demo-mt5',webhook,second)).status,202);
  assert.equal((await request(poll,terminal)).status,200);
  await stop(); await start();
  const recovered = await (await request('/api/admin/state',admin)).json();
  assert.equal(recovered.online,false,'restart requires a fresh heartbeat');
  assert.equal(recovered.connection.lastSeen,null,'stale persisted telemetry is discarded');
  assert.equal(recovered.signals[0].status,'unknown','restart does not redeliver an uncertain trade');
  assert.equal((await request(poll,terminal)).status,204);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'blocked-after-restart'})).status,409);
  assert.equal((await request('/api/admin/resolve/interrupted',admin,{})).status,200);
  assert.equal((await request('/api/terminal/result',terminal,{...result,id:'interrupted',status:'unknown'})).status,200,'acknowledged terminal journal can clear');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'expires'})).status,202);
  await stop();
  const saved=JSON.parse(await readFile(statePath,'utf8')); saved.signals.find(s=>s.id==='expires').createdAt='2000-01-01T00:00:00Z';
  await writeFile(statePath,JSON.stringify(saved)); await start();
  const expired=await (await request('/api/admin/state',admin)).json();
  assert.equal(expired.signals[0].status,'expired');
  const expiredOnDisk=JSON.parse(await readFile(statePath,'utf8'));
  assert.equal(expiredOnDisk.signals.find(s=>s.id==='expires').status,'expired','dashboard maintenance persists actual transitions');
  assert.equal((await request(poll,terminal)).status,204);
  await t.test('large histories retain command safety without read or heartbeat writes',async()=>{
    const measurements=[];
    for(const count of [0,1000,9999]) {
      await stop();
      const fixture=JSON.parse(await readFile(statePath,'utf8'));
      fixture.signals=Array.from({length:count},(_,i)=>({...alert,id:`fixture-${i}`,status:'rejected',createdAt:'2000-01-01T00:00:00Z'}));
      await writeFile(statePath,JSON.stringify(fixture)); await start();
      const sentinel=new Date('2000-01-01T00:00:00Z'); await utimes(statePath,sentinel,sentinel);
      const stamp=(await stat(statePath)).mtimeMs;
      const times=[];
      for(let i=0;i<5;i++) {
        const begin=performance.now();const response=await request('/api/admin/state',admin);
        assert.equal(response.status,200);const data=await response.json();
        times.push(performance.now()-begin);assert.equal(data.signals.length,Math.min(count,200));
        await new Promise(resolve=>setTimeout(resolve,350));
      }
      assert.equal((await request(poll,terminal)).status,204);
      assert.equal((await stat(statePath)).mtimeMs,stamp,'history reads and heartbeat must not rewrite the journal');
      times.sort((a,b)=>a-b);
      measurements.push({completedRecords:count,medianMs:+times[2].toFixed(2),maxMs:+times[4].toFixed(2),requests:5,concurrency:1,journalRewritten:false});
    }
    const accepted={...alert,id:'after-large-history'};
    assert.equal((await request('/api/webhook/demo-mt5',webhook,accepted)).status,202,'one free journal slot remains');
    assert.equal((await request(poll,terminal)).status,200);
    await stop();await start();
    const snapshot=await (await request('/api/admin/state',admin)).json();
    assert.equal(snapshot.signals[0].status,'unknown','large histories retain restart safety');
    await writeFile(path.join(artifacts,'validation-metrics.json'),JSON.stringify({scope:'synthetic loopback only; no broker',measurements},null,2));
  });
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
RUN dotnet restore --configfile NuGet.Config && dotnet publish --no-restore -c Release -o /out
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
      - run: dotnet restore --configfile NuGet.Config
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
