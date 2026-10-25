# File guide

All paths below are relative to your repository checkout root (the local working folder is named `bridge-demo`).

| File | Contents |
|---|---|
| `BridgeDemo.csproj` | Package-free ASP.NET Core project targeting .NET 10 |
| `global.json` | SDK major version and feature-band roll-forward policy |
| `NuGet.Config` | Empty package source list for offline server restore |
| `Models.cs` | Connection, signal, persisted-state and HTTP request models |
| `StateStore.cs` | Exclusive state-directory lease, synchronized reads, copy-on-write flushed JSON persistence |
| `Program.cs` | Loopback/auth middleware, webhook validation, command lifecycle, terminal polling/results, SignalR hub and operator acknowledgement |
| `wwwroot/index.html` | Original portal markup: login, metrics, connection setup, trade form, journal and webhook reference |
| `wwwroot/style.css` | Original responsive dark design for desktop and mobile |
| `wwwroot/app.js` | In-memory admin login, official SignalR client, dashboard rendering and authenticated API calls |
| `wwwroot/vendor/signalr.min.js` | Unmodified Microsoft SignalR 10.0.0 browser dependency; not our application code |
| `wwwroot/vendor/SIGNALR-LICENSE.txt` | Microsoft's dependency license |
| `mt5/RelayDemo.mq5` | Independently authored demo-only EA: WebRequest transport, account checks, result journal and CTrade execution |
| `scripts/run.ps1` | Project-local tool environment, restore/build and foreground portal start |
| `scripts/test.ps1` | Build, JavaScript syntax check and loopback integration suite |
| `scripts/validation-manifest.mjs` | Credential-free source hashes and runtime versions for validation artifacts |
| `tests/pentagi/offline-flow.json` | Reusable self-hosted, offline PentAGI regression profile with research tools disabled |
| `docs/SECURITY-VALIDATION.md` | Regression command, persistence changes, CI artifacts and isolated PentAGI procedure |
| `scripts/check-publish.mjs` | Rejects accidental publication of local state, tools and test directories |
| `scripts/prepare-client.ps1` | Re-fetch the pinned official SignalR browser client/license |
| `tests/integration.mjs` | Node built-in tests for HTTP, SignalR, authentication, account binding, idempotency, expiry and restart recovery; no broker |
| `Dockerfile` | Multi-stage .NET packaging with unprivileged runtime |
| `.dockerignore` | Excludes local tools, secrets, build output and generated EA binaries from image context |
| `.github/workflows/ci.yml` | GitHub build/test/publish-artifact workflow |
| `.github/workflows/container.yml` | Manual GHCR image publishing workflow, without automatic deployment |
| `.gitignore` | Excludes credentials/state, tools, test output and compiled artifacts |
| `.gitattributes` | Consistent LF source line endings across Windows and Linux |
| `IMPLEMENTATION.md` | Independent implementation contract and component diagram |
| `README.md` | Start, MT5 setup, webhook examples, testing and supported scope |
| `docs/ARCHITECTURE.md` | Protocol, sequence diagram, delivery guarantees and trading semantics |
| `docs/DEPLOYMENT.md` | GitHub usage, packaging and production requirements |
| `docs/VERIFICATION.md` | Checks actually performed and checks still requiring your demo terminal |
| `docs/FILE-CONTENTS.md` | Consolidated listing of authored source/config files; dependency contents are linked separately |
| `scripts/export-file-guide.py` | Regenerates the consolidated source listing using Python standard library |

Generated and ignored: `.tools/` SDK/compiler; `data/state.json` keys and journal; `data/server.lock` process lease; `bin/` and `obj/` server build; `mt5/RelayDemo.ex5` and `.log` MetaEditor output; `artifacts/` test state, screenshots and published output. The EA's pending-result file is separately stored in the selected MT5 terminal's `MQL5/Files` sandbox.
