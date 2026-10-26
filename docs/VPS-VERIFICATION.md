# VPS deployment verification — 2026-10-25

## Current SQLite release

### Operator acceptance — 2026-10-25

The user confirmed that a TradingView alert resulted in successful trade execution on the MT5 demo account through the deployed Relay bridge. This completes the manual TradingView-originated execution acceptance step for this release. Evidence is the user's test report; no specific alert ID, broker ticket, symbol, execution latency or additional failure scenarios were independently inspected in this update. No agent-submitted trade was involved.

Active release: `20261025-sqlite-01`, built from commit `cafd0ffc3d9e8aad5887b07605b27064c6a2864c`. Archive SHA-256: `1dc0eb0b0b62f063dca7f26e17a8f92cac4b9ab23b517b4d5265e36bc4a3bd36`.

- GitHub Linux CI passed: [Build and verify](https://github.com/leadinggene-netizen/rearepo1025/actions/runs/40245662537). The isolated Windows suite passed 11 reported tests with no broker connection. 205 sequential durable ingress requests measured p95 approximately 21 ms and maximum 28 ms; this is a local synthetic workload, not a production capacity guarantee.
- The installer stopped the service briefly, retained `/var/backups/relay/pre-20261025-sqlite-01/state`, and passed migration/integrity checks on a separate copy before migrating active state.
- Active database integrity check returned `ok`. The two existing completed commands and credential/account binding preservation fingerprints match before/after. No queued, dispatched or unknown commands were present during migration.
- The existing remote EA reconnected and the HTTPS dashboard reported Online. Deployment initialized execution PAUSED with an empty symbol allowlist for deliberate operator configuration. No EA reload was required and no order was submitted by deployment checks. Subsequent operator acceptance is recorded above; this document does not assert the current pause setting.
- HTTPS health, authenticated dashboard/receipt reads, credential-role rejection, unexpected-origin rejection, body-size rejection and authenticated SignalR WebSocket handshake passed after migration.
- `relay-backup.timer` is enabled. Both the authenticated backup API and scheduled backup service passed. Database file mode is 0600, owner relay; backup directory is 0700.
- A 40960-byte database backup was transferred into memory, checksum-checked, encrypted to a 41572-byte AES-GCM CMS file on the Windows computer, and fully decrypted/authenticated back to identical bytes. It is under `.tools/vps-backups/relay-database/` with a verification manifest, using the existing separately protected recovery key. No plaintext database copy was saved locally and nothing was uploaded to Google Drive. This database verification does not verify the older full-disk image.
- SSH, Nginx and NoMachine were verified active after deployment, and x-ui disabled. TradingView-originated execution was subsequently confirmed by the user as recorded above. [TRADINGVIEW.md](TRADINGVIEW.md) retains the setup and acceptance procedure for future configurations.

## Earlier HTTPS deployment baseline

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
