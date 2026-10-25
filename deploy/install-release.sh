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
install -m 0644 "$release/deploy/relay.service" /etc/systemd/system/relay.service
previous=$(readlink -f /opt/relay/current || true)
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
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -s "$previous" /opt/relay/current.rollback
    mv -Tf /opt/relay/current.rollback /opt/relay/current
    systemctl start relay.service
  fi
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
echo "Relay release $2 is healthy. Persistent state was retained."
