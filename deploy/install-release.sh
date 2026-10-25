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
