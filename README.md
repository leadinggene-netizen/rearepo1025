# Relay — independent MT5 bridge demo

An original ASP.NET Core 10 / SignalR portal and MQL5 Expert Advisor that turns authenticated instructions into **real requests on an explicitly selected MT5 demo account**. No PineConnector binaries, recovered source, branding, constants, or private protocol are used.

## Start the portal on this computer

```powershell
cd path\to\rearepo1025
powershell -ExecutionPolicy Bypass -File .\scripts\run.ps1
```

Open **http://127.0.0.1:5080**. Paste the admin key printed in the terminal. Keep that terminal running; Ctrl+C stops the service. A project-local .NET SDK is already installed under `.tools/dotnet` on this machine. Fresh clones need the .NET 10 SDK. The pinned Microsoft SignalR browser client is included, so normal startup needs no download. `scripts/prepare-client.ps1` can restore that dependency from its official distribution.

The portal opens before MT5 is connected. It displays **Offline** and disables sending until the adapter heartbeats. This is an honest empty state, not a simulated account.

## Use the deployed HTTPS portal

Open **https://relay.tradingviewtometatraders.com**. The server runs on the Ubuntu VPS; MT5 remains on Windows. It uses fresh credentials. See [docs/VPS.md](docs/VPS.md) for retrieving the admin key, switching to `mt5/RelayDemoRemote.mq5`, server paths, updates and rollback. Keep only one Relay EA attached when migrating from localhost.

## Connect your MT5 demo account

1. Sign in to your intended **demo** account in your broker's Windows MT5 terminal. Note the account login number. Do not enter the broker password in this project.
2. In MT5 select **File → Open Data Folder → MQL5 → Experts**. Copy `mt5/RelayDemo.mq5` there. You can also use the locally compiled `mt5/RelayDemo.ex5` produced during verification; generated binaries are intentionally not committed.
3. Open the source in MetaEditor and press **F7** to compile. Refresh MT5 Navigator. EA compilation passed with zero errors and warnings. You previously verified localhost demo-account execution; the new HTTPS adapter still needs its separate acceptance test.
4. Under **Tools → Options → Expert Advisors**, enable WebRequest for `http://127.0.0.1:5080`. Enable Algo Trading on the toolbar and the EA's algorithmic-trading permission. DLL imports are not needed.
5. Attach **one** copy of RelayDemo to one chart. Set `ExpectedLogin` to the exact demo login, and `TerminalKey` to the key shown in the authenticated portal. Keep the default URL. Choose a unique nonzero `MagicNumber` and your own `MaxLots` cap (default 0.10).
6. Confirm the portal shows **Connected**, the correct account and broker. The first heartbeat binds this connection to that account/broker pair. Switching accounts is intentionally not a portal shortcut in this demo.
7. Choose the broker's exact symbol (including suffix). Review lot size and stop distances, then send one instruction. Confirm both the journal result **and the actual MT5 positions/history** before another action.

**Stop distances are broker quoting points, not pips.** On a five-decimal symbol, 200 points is normally 0.00200 of price. The EA aligns target prices to tick size; the broker still validates stop distance, sessions, filling mode and volume. Zero SL/TP requests no corresponding target. An example size is not a recommendation.

### Supported execution behavior

- `buy` / `sell`: market requests only; server maximum 1 lot, EA default maximum 0.10. An existing position on that symbol blocks another entry. There is no implicit reversal or pyramiding.
- `close`: closes positions matching the selected symbol and this EA's magic **on hedging accounts**. It does not cancel pending orders. Automatic closure on netting accounts is rejected because position ownership cannot be isolated reliably by magic alone; close those manually.
- The EA rechecks demo mode and the configured account login before processing. A live or contest account is refused. A result is `filled` only for a confirmed `TRADE_RETCODE_DONE`; uncertain or partial outcomes are shown as `unknown`.
- Use a dedicated demo setup. Other EAs or manual activity can change positions concurrently; the bridge is not an account-wide trading lock.

## Webhook contract

Retrieve the webhook key by expanding **Webhook integration** in the authenticated portal. HTTP clients may send it in `X-Bridge-Key`. For alert producers that cannot set headers, use the `secret` JSON field:

```json
{
  "secret": "YOUR_WEBHOOK_KEY",
  "id": "strategy-a-EURUSD-unique-event-001",
  "action": "buy",
  "symbol": "EURUSD",
  "lots": 0.01,
  "slPoints": 200,
  "tpPoints": 400
}
```

POST to `http://127.0.0.1:5080/api/webhook/demo-mt5`. This example is executable only after you deliberately connect a demo terminal. The browser form uses the same endpoint; there is no special browser-only trading path.

`id` is the producer's idempotency key: resend the same ID and identical trade fields for a transport retry. Never generate a new ID merely because a result is delayed. Distinct intended actions need distinct IDs. Valid IDs contain letters, digits, underscore, hyphen, dot, colon, up to 128 characters. Do not use one ID for both entry and exit.

**TradingView cloud cannot reach localhost.** The deployed webhook is `https://relay.tradingviewtometatraders.com/api/webhook/demo-mt5`; use its fresh webhook key and connect the remote demo EA first. The backend retains its loopback boundary behind Nginx. The local preview remains local. Read [docs/VPS.md](docs/VPS.md) before switching endpoints.

## What happens to an instruction

`queued → dispatched → filled / closed / rejected / unknown`

Queued commands expire after 30 seconds. Dispatch is persisted before a terminal receives a command. A dispatched command is never automatically delivered again. A server restart or a missing result leaves an unknown outcome. The EA writes a local result journal before touching the broker and retries reporting that journal, rather than placing the trade again. This favors avoiding duplicate trades over guaranteed delivery; it does not claim exactly-once execution across the broker and local disks.

An `unknown` result blocks new commands. Inspect MT5 positions/history first, then use **Acknowledge after checking MT5**. Acknowledgement does not send, close, reverse or prove a trade. The full details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Verify

Requires Node.js 22+ for dependency-free HTTP/WebSocket integration tests:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1
```

On Linux/macOS with .NET 10 and Node 22:

```sh
dotnet restore --configfile NuGet.Config
dotnet build --no-restore --warnaserror
node --check wwwroot/app.js
node --test tests/integration.mjs
dotnet run --no-build
```

Tests use separate temporary state directories and a fake terminal protocol client. They do **not** launch MT5, simulate a broker fill as a real observation, or submit orders. Actual EA compilation is a separate check. See [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Files and GitHub

- [docs/FILES.md](docs/FILES.md): every authored file, its location and contents/purpose.
- [docs/FILE-CONTENTS.md](docs/FILE-CONTENTS.md): a consolidated source listing.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): GitHub version control, CI, packaging and production gaps.
- Remote: https://github.com/leadinggene-netizen/rearepo1025

Keep `.tools`, `data`, `artifacts`, `bin`, `obj`, EA logs/binaries and all secrets out of Git. State and generated credentials live in `data/state.json`. Preserve this directory across restarts; deleting it loses request history, keys and account binding. Back it up with access restricted to the operator. Run one server process against a data directory; an exclusive lock prevents accidental concurrent writers.

## Scope

Implemented: one local connection, authenticated alert ingress, live SignalR portal, persistent command journal, terminal heartbeats and equity/balance, real demo-only MQL5 execution adapter, finite result recovery, CI and container packaging.

Not implemented: MT4, multi-user login/tenancy, multiple connections, scheduled closures, symbol mapping UI, subscription billing, email/Telegram notifications, trade-history analytics or automatic EA updates. These are separate features, not hidden behind demo controls. The project is a working foundation rather than a replacement for every module in the reference screenshots.
