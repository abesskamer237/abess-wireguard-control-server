# ABESS WireGuard Control Server

Clean-room baseline for standard WireGuard over UDP with an administrative peer-provisioning API and short-lived, one-time enrollment codes. It is not compatible with Geny's proprietary WSS/camouflage/SlowDNS transport.

## Requirements

- Ubuntu/Debian server with WireGuard tools installed and a configured wg0 interface.
- Node.js 20 or newer (CI tests on Node 22).
- A valid server public key and endpoint configured in /etc/abess-wireguard-api.env.

## Install and protect the API

Review the scripts and configuration examples before running them. The API installer runs the API as root because it updates WireGuard configuration. Keep it bound to 127.0.0.1 and expose it only through a properly authenticated TLS reverse proxy. Do not expose the administrative API directly to the Internet.

The installer creates a strong ADMIN_TOKEN and prints it once. Store it securely. Never embed it in Android or commit it to Git.

## API routes

- GET /health — basic process health (no authentication).
- POST /v1/enrollment-tokens — **admin only**. JSON: {"name":"phone-01","ttlSeconds":300}. Creates a random one-time code; allowed lifetime is 60–3600 seconds. The code is returned only once; only its SHA-256 hash is stored.
- POST /v1/enroll — public client endpoint, intended to be exposed only through HTTPS. JSON: {"token":"<one-time-code>"}. Consumes the code and returns a WireGuard configuration. Replays, expired codes, and invalid codes are rejected.
- POST /v1/peers — **admin only**. JSON: {"name":"device-01"}. Creates a peer and returns its client configuration.
- DELETE /v1/peers/:name — **admin only**. Revokes a managed peer.

Admin routes require Authorization: Bearer <ADMIN_TOKEN>. The Android app must use only the short-lived enrollment code; never give the admin token to a client.

## Limitations before production

The enrollment token is single-use and time-limited, but this remains a prototype. Add per-user authentication, subscription/payment checks, device limits, rate limiting, audit logs, monitoring, and robust secret/key lifecycle management before public launch. A peer's private key is generated on the server and returned once to the enrolling client; protect responses and device storage.

## Tests

    cd api
    npm test
    node --check server.mjs
    node --check peer-config.mjs

GitHub Actions runs the test suite and syntax checks on pushes and pull requests.
