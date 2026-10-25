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
