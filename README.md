# LUNA WireGuard Control Server

Clean-room baseline for standard WireGuard over UDP with an administrative peer-provisioning API and short-lived, one-time enrollment codes. It is not compatible with non-WireGuard proprietary transports.

## Requirements

- Ubuntu/Debian server with WireGuard tools installed and a configured wg0 interface.
- Node.js 20 or newer (CI tests on Node 22).
- A valid server public key and endpoint configured in /etc/luna-wireguard-api.env.

## Install and protect the API

Review the scripts and configuration examples before running them. The API installer runs the API as root because it updates WireGuard configuration. Keep it bound to 127.0.0.1 and expose it only through a properly authenticated TLS reverse proxy. Do not expose the administrative API directly to the Internet.

Set a random ADMIN_TOKEN of at least 32 characters in the protected service environment. Store it securely. Never embed it in Android or commit it to Git. If you deploy through your own install script, ensure it generates this secret and restricts the environment file to root.

## API routes

- GET /health — basic process health (no authentication).
- POST /v1/subscriptions — **admin only**. JSON: {"customerId":"client-01","plan":"Mensuel","amountXaf":2500,"currency":"XAF","durationDays":30,"maxDevices":2}. Creates a pending-payment subscription.
- GET /v1/subscriptions — **admin only**. Lists subscriptions; payment references are masked.
- POST /v1/subscriptions/:id/confirm-payment — **admin only**, for manual confirmation after checking the actual payment in the provider dashboard. JSON: {"paymentReference":"provider-reference"}.
- POST /v1/payments/monetbil/checkout — public checkout creation for a pending subscription. JSON: {"subscriptionId":"sub_...","phone":"2376XXXXXXXX"}; returns a Monetbil payment URL. Requires MONETBIL_SERVICE_KEY and HTTPS PUBLIC_API_BASE_URL.
- GET/POST /v1/webhooks/monetbil — verifies Monetbil's signed notification using MONETBIL_SERVICE_SECRET, checks service, status, amount, XAF currency and order reference, then activates the subscription. Configure the same notification URL in Monetbil.
- POST /v1/webhooks/payment — internal canonical HMAC-SHA256 webhook fallback; requires PAYMENT_WEBHOOK_SECRET and X-Abess-Signature.
- POST /v1/enrollment-tokens — **admin only**. JSON: {"name":"phone-01","subscriptionId":"sub_...","ttlSeconds":300}. A paid, active, unexpired subscription is required; device-limit checks happen before issuing the code. Allowed code lifetime is 60–3600 seconds. The code is returned only once; only its SHA-256 hash is stored.
- POST /v1/enroll — public client endpoint, intended to be exposed only through HTTPS. JSON: {"token":"<one-time-code>"}. Consumes the code and returns a WireGuard configuration. Replays, expired codes, and invalid codes are rejected.
- POST /v1/peers — **admin only**. JSON: {"name":"device-01"}. Creates a peer and returns its client configuration.
- DELETE /v1/peers/:name — **admin only**. Revokes a managed peer.

Admin routes require Authorization: Bearer <ADMIN_TOKEN>. The Android app must use only the short-lived enrollment code; never give the admin token to a client.

## Monetbil configuration

Set these in the protected `/etc/luna-wireguard-api.env` file (never commit credentials):

- `MONETBIL_SERVICE_KEY` — service key from the Monetbil dashboard.
- `MONETBIL_SERVICE_SECRET` — service secret used to verify Monetbil notification signatures.
- `PUBLIC_API_BASE_URL` — public HTTPS API origin, for example `https://api.example.com`.

The checkout uses Monetbil Widget API v2.1 for Cameroon/XAF. Monetbil's signed callback activates a subscription only if the service key, signature, success status, order reference, amount and currency match. Test with Monetbil sandbox credentials first. The Android client still needs a customer-facing plan/account flow; checkout currently requires a pending subscription ID created through the admin API.

## Limitations before production

The enrollment token is single-use and time-limited, but this remains a prototype. Before public launch, connect and test a provider-specific payment adapter, add rate limiting, audit logs, monitoring, per-customer authentication, and robust secret/key lifecycle management. A peer's private key is generated on the server and returned once to the enrolling client; protect responses and device storage.

## Tests

    cd api
    npm test
    node --check server.mjs
    node --check peer-config.mjs
    node --check enrollment-token.mjs
    node --check access-control.mjs
    node --check payment-webhook.mjs
    node --check monetbil.mjs

GitHub Actions runs the test suite and syntax checks on pushes and pull requests.
