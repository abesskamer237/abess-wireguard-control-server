#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install -d -m 0750 /opt/luna-wireguard-api
cp "$ROOT/api/"*.mjs /opt/luna-wireguard-api/
cp "$ROOT/api/package.json" /opt/luna-wireguard-api/package.json
cat >/etc/systemd/system/luna-wireguard-api.service <<'UNIT'
[Unit]
Description=LUNA WireGuard peer provisioning API
After=network-online.target wg-quick@wg0.service
Wants=network-online.target
Requires=wg-quick@wg0.service
[Service]
Type=simple
EnvironmentFile=/etc/luna-wireguard-api.env
WorkingDirectory=/opt/luna-wireguard-api
ExecStart=/usr/bin/node /opt/luna-wireguard-api/server.mjs
Restart=on-failure
RestartSec=3
User=root
Group=root
UMask=0077
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/etc/wireguard /var/lib/luna-wireguard-api
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
install -d -m 0700 /var/lib/luna-wireguard-api
if [[ ! -f /etc/luna-wireguard-api.env ]]; then
  TOKEN="$(openssl rand -hex 32)"
  cat >/etc/luna-wireguard-api.env <<EOF
ADMIN_TOKEN=$TOKEN
SERVER_ENDPOINT=SERVER_PUBLIC_IP_OR_DNS:51820
CLIENT_DNS=1.1.1.1
CLIENT_ALLOWED_IPS=0.0.0.0/0
MONETBIL_SERVICE_KEY=
MONETBIL_SERVICE_SECRET=
PUBLIC_API_BASE_URL=https://YOUR_API_DOMAIN
EOF
  chmod 600 /etc/luna-wireguard-api.env
  echo "Created /etc/luna-wireguard-api.env; edit SERVER_ENDPOINT and Monetbil settings before use."
  echo "Admin token (shown once; save securely): $TOKEN"
fi
systemctl daemon-reload
systemctl enable --now luna-wireguard-api
systemctl status --no-pager luna-wireguard-api || true
