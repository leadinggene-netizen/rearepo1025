# TradingView -> database -> MT5

The HTTPS endpoint is `https://relay.tradingviewtometatraders.com/api/webhook/demo-mt5`. MT5 continues using the existing remote EA and terminal key. No EA reload is required for the database update.

## Enable your first automated demo alert

1. Refresh the portal and sign in with the same admin key. Review the saved account/broker and MT5 positions/history.
2. Under Execution controls, enter the broker's exact symbols, such as `btcusd` if that is its actual name. Choose a maximum lot size no greater than your EA's cap, and a command lifetime. The initial migration is paused and has no allowed symbols.
3. Save the policy while paused. Confirm the EA is Connected. Expand TradingView webhook integration to obtain the current URL and JSON message with your existing webhook secret.
4. In TradingView's alert editor, enable the webhook URL and paste the JSON message. For a standard alert, an example is:

   ```json
   {
     "secret": "YOUR_EXISTING_WEBHOOK_KEY",
     "id": "strategy1-{{time}}-{{interval}}-buy",
     "sentAt": "{{timenow}}",
     "action": "buy",
     "symbol": "EXACT_MT5_SYMBOL",
     "lots": 0.01,
     "slPoints": 200,
     "tpPoints": 400
   }
   ```

5. Replace the symbol, strategy prefix and execution fields deliberately. This ID template permits one buy per strategy/timeframe/bar. Give different strategies and actions different prefixes/suffixes. Multiple intended events within one bar need strategy-generated unique IDs. An `alert()` call in Pine must build its own JSON values rather than assume every editor placeholder is substituted inside script-generated messages.
6. Trigger one alert while execution remains paused. Check Alert receipts and the queued/expired command. This validates delivery without requesting execution. Let that command expire before enabling execution if it was only an ingress test.
7. When ready, clear Pause execution and save. The confirmation explicitly warns that unexpired queued commands can execute. Trigger one deliberate demo alert, then verify its receipt, dispatched command, terminal result and actual MT5 deal/history.

TradingView requires webhook responses within three seconds. Relay acknowledges a successful SQLite transaction without waiting for MT5 or SignalR. TradingView may resend certain 5xx failures; reuse the same ID and fields for a retry. See the official [webhook requirements](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/), [resubmission rules](https://www.tradingview.com/support/solutions/43000735201-webhook-resubmission/), and [placeholder reference](https://www.tradingview.com/support/solutions/43000531021-how-to-use-a-variable-value-in-alert/).

## Receipt and execution rules

- Each authenticated attempt is recorded with receipt ID, time, event ID, disposition and a normalized payload. The `secret` field, authentication headers and arbitrary extra fields are excluded. Authenticated malformed JSON is recorded when a valid header key identifies it; an unauthenticated body cannot establish receipt identity.
- A valid, policy-compliant new event commits its receipt and command together and returns202. It can queue while paused, offline or behind an unresolved command.202 means stored, not traded.
- A matching accepted ID returns200 and a duplicate receipt. Different fields for that ID return409. The database retains ID uniqueness beyond the dashboard's recent200 commands; restarting does not reset it.
- Invalid input returns400; wrong connection404; symbol/lot policy rejection422; full pending queue409. These authenticated receipts remain recorded without executable commands. Storage failure/busy returns503, with no successful acknowledgement. Do not assume every non-2xx response causes TradingView to retry.
- FIFO dispatch allows one command at a time. The EA polls approximately once per second. An unknown outcome blocks subsequent dispatch until a terminal result or deliberate operator reconciliation resolves it.
- Queued commands expire at a fixed deadline: receipt time plus the saved lifetime, capped by `sentAt` plus that lifetime when supplied. Future timestamps over five seconds are rejected. Offline periods, restarts, retries and pausing do not extend the deadline. Changing lifetime applies to new commands; symbol and lot restrictions are rechecked at dispatch.
- The pending queue is bounded at1000 commands. Completed history remains in SQLite; the dashboard shows200 commands and100 receipts/events. Disk capacity and backup retention require ordinary maintenance.
- Pausing stops new dispatch. It does not cancel already-dispatched work, close broker positions or prevent alerts being recorded. Alerts outside the policy are recorded as rejected and are not held for automatic execution after a policy change.

The portal provides persisted activity/warnings, offline/paused/unknown state and queue depth. Email, SMS and Telegram notifications are not configured. Rejected/expired events remain visible for investigation; automated redelivery of uncertain trades is deliberately absent.

## Database and operations

`BRIDGE_DATA/bridge.db` is SQLite schema version1, with `settings`, `commands`, `receipts` and `audit` tables. The Microsoft provider and native SQLite dependencies are version-locked in `packages.lock.json`. WAL mode, FULL synchronization and parameterized statements are used. One exclusive server lease owns the data directory. Heartbeat telemetry remains transient and does not rewrite the journal; only recent/pending commands are cached in memory.

Legacy `state.json` is imported once with the same credentials, account binding and history. Legacy queued commands expire on migration; dispatched commands become unknown. Existing JSON is retained as a pre-migration artifact and is no longer the active state source. The database update starts paused and with an empty symbol allowlist. Missing database settings do not silently reset credentials.

Storage I/O/corruption/full-disk failures stop delivery from potentially stale memory until diagnosis and restart. Check service logs and disk space before restarting; do not delete state to recover availability.

The authenticated API adds GET `/api/admin/receipts`, POST `/api/admin/policy`, and POST `/api/admin/backup`. These are the same interfaces the portal uses. All require the admin key. Backup creation returns a private server filename and integrity result, not an unauthenticated download link.

## Backup and restore

The portal backup button uses SQLite's backup API, followed by `PRAGMA integrity_check`. Daily `relay-backup.timer` runs the same consistent-copy approach through Python. Files remain private under `/var/lib/relay/backups`; no Google Drive upload is performed. Same-server backups do not protect against loss of the VPS disk. Keep database files, WAL files and backup directories out of Git.

Manual backup in the VPS root shell:

```sh
sudo -u relay python3 /opt/relay/current/scripts/db-maintenance.py backup /var/lib/relay/bridge.db /var/lib/relay/backups
```

For a restore rehearsal, use an EMPTY separate data directory:

```sh
python3 /opt/relay/current/scripts/db-maintenance.py restore /PATH/TO/BACKUP.db /PATH/TO/EMPTY-RESTORE-DIRECTORY
```

Restore verifies integrity, preserves credentials/history, pauses execution, expires restored queued commands and marks restored dispatched commands unknown. It refuses a nonempty target. Never replace a broker-connected server's state with an old backup without reconciling subsequent trades first; restoration cannot undo broker executions. Database restoration was tested against synthetic state, separately from the unverified full-disk image.

The release installer stops Relay briefly, copies the complete data directory into a root-private pre-deployment folder, and runs migration/integrity checks against a copy before touching active data. A legacy JSON release cannot safely roll back an already migrated SQLite directory. Failed migration does not trigger historical replay or automatic restoration of stale state.
