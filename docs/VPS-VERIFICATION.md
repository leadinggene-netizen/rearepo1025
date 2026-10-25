# VPS deployment verification — 2026-10-25

Deployed endpoint: https://relay.tradingviewtometatraders.com

Active release: `20261025-https-02`, under `/opt/relay/releases/20261025-https-02`. Release archive SHA-256: `5e291321816751d6cf416db66c5577c46578650daf4d0db57da56106d90599d3`. The package records source revision and a dirty working tree; deployment does not imply these changes have been committed or pushed to GitHub.

## Observed results

- .NET build: zero warnings/errors; six isolated protocol tests passed. Tests used temporary state and no broker connection. Production startup credential suppression failed before the change and passed afterward.
- Publish boundary: passed; no local state, credentials, tools, tests, terminal binaries or backup files in the application publish output.
- `RelayDemoRemote.mq5`: compiled with the existing MetaEditor, zero errors and zero warnings. Compilation did not attach it to a chart or execute trades.
- Public HTTPS health and portal: HTTP 200 with normal certificate validation; HTTP redirects to canonical HTTPS. Login view opened in the in-app browser.
- Missing admin, terminal and SignalR credentials: HTTP 401. An admin credential cannot authenticate a terminal poll. An authenticated dashboard read returned an offline terminal and zero journal records.
- HTTPS SignalR negotiation and WebSocket JSON handshake: passed using the actual reverse proxy and existing admin credential; secrets were held in process memory and omitted from test output.
- Unexpected browser origin: HTTP 403. Oversized webhook body: HTTP 413. No webhook order was submitted.
- Bounded burst to the deployment's health endpoint: 34 HTTP 200 and 30 HTTP 429 responses, confirming proxy limiting. This is a bounded smoke check, not a load-capacity benchmark.
- Backend TCP5080: not externally reachable. Server listener is `127.0.0.1:5080`; Nginx owns public80/443.
- State directory and file permissions: relay-owned0700 and0600. Service runs as user relay, with protected filesystem access and a768MiB memory cap.
- Relay and Nginx: active and enabled at startup. Certbot timer: enabled; certificate renewal dry run succeeded. Issued certificate expires2027-01-23; renewal is configured.
- Existing SSH and NoMachine services: active. x-ui: inactive and disabled, as requested. No new reboot was required.

The current source/configuration was inspected in the main thread. No independent reviewer or external model reviewed this deployment; no new security assessment or complete penetration test is claimed. The smoke checks tested only this project endpoint. The authenticated MT5-to-VPS order lifecycle still requires the user's remote EA acceptance test; the previously successful localhost broker test is separate evidence.

Local protocol and deployment result artifacts are under `artifacts/`, ignored by Git. Credentials remain on the VPS in `/var/lib/relay/state.json` and are not included in this report.

## Retained boundaries

One operator and one explicitly selected demo account; no live-account support or multi-tenant isolation. Existing idempotency, durable dispatch and unknown-result reconciliation behavior remains unchanged. The pre-deployment encrypted disk image is local-only and unverified at the user's request. Neither restoration nor backup upload was performed.
