# Security regression validation

Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test.ps1
```

The script builds into `artifacts/test-bin` so an already-running preview does not lock its output. Tests use a fresh state directory and an ephemeral loopback port, explicitly excluding port 5080. There are no broker connections, terminal launches, real keys, or cloud calls. The local preview must be restarted separately when the operator is ready to adopt updated server code; recompile/reload the updated EA separately. Do not automatically replay previously uncertain trades.

The existing integration suite covers malformed/control-character identity rejection, maximum identity lengths, JSON string round-trips, idempotency, single delivery, persistence before dispatch, failed-save rollback, overdue/restart recovery, transient heartbeats, and unchanged reads at 0/1000/9999 completed records. Dashboard timings are observational rather than flaky machine-dependent pass thresholds; no-write and command-safety assertions enforce the behavior.

Outputs are `artifacts/validation-metrics.json` and `artifacts/validation-manifest.json`. The manifest records source revision, actual source hashes and runtime versions; a local dirty tree is identified by its file hashes. GitHub CI additionally stores JUnit results. Only those explicit result files are uploaded, including on failure; fixture state directories and server logs are excluded. The publish boundary check continues to reject local state/tool artifacts. The changed MQL5 helper was compiled with zero errors/warnings; no live terminal execution was performed for this change.

## Reusing PentAGI offline

`tests/pentagi/offline-flow.json` is a versioned REST create-flow payload for the verified PentAGI 2.2 tool/context contract. Select the actual self-hosted Ollama provider name if your installation differs. It does not contain endpoints, keys, database configuration or Docker credentials, and is not launched automatically by CI.

Prepare a disposable source-only worker with Node.js 22+, .NET 10, source at `/opt/target` and a prebuilt assembly at `/opt/bridge-bin/BridgeDemo.dll`. Download/build dependencies during a separate setup phase. Before starting any flow, verify the actual worker has only loopback, no external route, no Docker socket, no privileged mode, case-only mounts and finite memory/CPU/process limits. The controller's Docker administration authority is separate; scope it to a dedicated disposable environment. A prompt alone does not enforce these boundaries.

This profile disables search, search-answer, web-search, browser and maintenance tools in every documented context. It directs one execution of the existing suite, uses exact absolute artifact paths, requires truthful error reporting and prohibits additional HTTP probes. Its generated artifacts go under `/work/validation` through `BRIDGE_TEST_ARTIFACTS`. Missing prerequisites must stop the run. Export only sanitized result/tool records, preserve source/image identifiers, and stop the cloud sandbox after collection. This is supervised regression verification; it does not replace an independent security audit.

The existing Docker Cloud sandbox remains paused; this development change does not resume or modify it.
