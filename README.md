# ABESS WireGuard Control Server

Clean-room baseline for standard WireGuard over UDP with an administrative peer-provisioning API. It is not compatible with Geny's proprietary WSS/camouflage/SlowDNS transport.

## Requirements

- Ubuntu/Debian server with WireGuard tools installed and a configured wg0 interface.
- Node.js 20 or newer (CI tests on Node 22).
- A valid server public key and endpoint configured in /etc/abess-wireguard-api.env.

## Install

Review the scripts and configuration examples before running them. The API installer runs the API as root because it updates WireGuard configuration; keep the API bound to 127.0.0.1 and expose it only through a properly authenticated TLS reverse proxy. Do not expose this admin API directly to the Internet.

The installer creates a strong admin token and prints it once. Store it in a password manager. Never embed it in Android or commit it to Git.

## API

- GET /health — basic process health (no authentication).
- POST /v1/peers — create a peer; requires Authorization: Bearer ADMIN_TOKEN and JSON body with a name. Returns the client configuration, including its private key, once.
- DELETE /v1/peers/:name — revoke a managed peer; requires the same admin authentication.

This is an administrative prototype, not a public user enrollment API. Before production, add user/device identity, short-lived enrollment tokens, rate limits, audit logs, hardened secret storage, and integration tests on a disposable WireGuard host.

## Tests

    cd api
    npm test
    node --check server.mjs

GitHub Actions runs the test suite and syntax checks on pushes and pull requests.
