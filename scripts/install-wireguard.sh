#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard wireguard-tools iptables curl openssl
umask 077
mkdir -p /etc/wireguard
if [[ ! -f /etc/wireguard/server_private.key ]]; then
  wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
fi
echo "Server public key:"
cat /etc/wireguard/server_public.key
if [[ ! -f /etc/wireguard/wg0.conf ]]; then
  cp "$(dirname "$0")/../deploy/wg0.conf.example" /etc/wireguard/wg0.conf
  sed -i "s|REPLACE_WITH_SERVER_PRIVATE_KEY|$(cat /etc/wireguard/server_private.key)|" /etc/wireguard/wg0.conf
  chmod 600 /etc/wireguard/wg0.conf
fi
echo "Review /etc/wireguard/wg0.conf, correct the outbound interface, and open UDP/51820 before starting wg-quick@wg0."
