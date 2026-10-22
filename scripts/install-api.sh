#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install -d -m 0750 /opt/abess-wireguard-api
cp "$ROOT/api/server.mjs" /opt/abess-wireguard-api/server.mjs
cp "$ROOT/api/package.json" /opt/abess-wireguard-api/package.json
cat >/etc/systemd/system/abess-wireguard-api.service <<'UNIT'
[Unit]
Description=ABESS WireGuard peer provisioning API
After=network-online.target wg-quick@wg0.service
Wants=network-online.target
Requires=wg-quick@wg0.service
[Service]
Type=simple
EnvironmentFile=/etc/abess-wireguard-api.env
WorkingDirectory=/opt/abess-wireguard-api
ExecStart=/usr/bin/node /opt/abess-wireguard-api/server.mjs
Restart=on-failure
RestartSec=3
User=root
Group=root
UMask=0077
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/etc/wireguard /var/lib/abess-wireguard-api
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
install -d -m 0700 /var/lib/abess-wireguard-api
if [[ ! -f /etc/abess-wireguard-api.env ]]; then
  TOKEN="$(openssl rand -hex 32)"
  cat >/etc/abess-wireguard-api.env <<EOF
ADMIN_TOKEN=$TOKEN
SERVER_ENDPOINT=SERVER_PUBLIC_IP_OR_DNS:51820
CLIENT_DNS=1.1.1.1
CLIENT_ALLOWED_IPS=0.0.0.0/0
EOF
  chmod 600 /etc/abess-wireguard-api.env
  echo "Created /etc/abess-wireguard-api.env; edit SERVER_ENDPOINT before use."
  echo "Admin token (shown once; save securely): $TOKEN"
fi
systemctl daemon-reload
systemctl enable --now abess-wireguard-api
systemctl status --no-pager abess-wireguard-api || true
