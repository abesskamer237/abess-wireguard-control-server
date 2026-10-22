# Android enrollment flow

This endpoint is for issuing a short-lived activation code to an Android user. The admin token must be used only from a trusted administrator shell, never from the Android app.

## 1. Create and confirm a subscription

Create a pending subscription using the admin token. This example uses a 30-day plan priced at 2,500 XAF and a two-device limit:

```bash
set -a
. /etc/abess-wireguard-api.env
set +a
curl --fail-with-body --silent --show-error \
  --request POST https://YOUR_API_DOMAIN/v1/subscriptions \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"customerId":"client-01","plan":"Mensuel","amountXaf":2500,"currency":"XAF","durationDays":30,"maxDevices":2}'
```

After verifying the actual payment with the payment provider, confirm it with the returned subscription ID:

```bash
curl --fail-with-body --silent --show-error \
  --request POST https://YOUR_API_DOMAIN/v1/subscriptions/SUBSCRIPTION_ID/confirm-payment \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"paymentReference":"provider-transaction-reference"}'
```

This is a manual confirmation path. Automated confirmation requires a provider-specific adapter; see `docs/subscriptions-payments-transports.md`.

## 2. Create a one-time activation code

Use the active subscription ID and load the admin token from the protected environment file without printing it:

```bash
curl --fail-with-body --silent --show-error \
  --request POST https://YOUR_API_DOMAIN/v1/enrollment-tokens \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"name":"phone-01","subscriptionId":"SUBSCRIPTION_ID","ttlSeconds":300}'
```

Replace `YOUR_API_DOMAIN` with the real HTTPS API hostname and `SUBSCRIPTION_ID` with the ID returned when the subscription was created. The response includes a one-time `token`; send that code to the intended user through a trusted channel. Do not paste it into GitHub, logs, or a public chat. The code expires after five minutes by default.

Supported `ttlSeconds` values are 60 to 3600. The API rejects pending/expired subscriptions and enforces the subscription's device limit. Each peer name can only be enrolled once at a time.

## 3. Enroll from Android

In ABESS VPN, enter the HTTPS API base URL (without `/v1/enroll`) and the one-time code, then tap **Obtenir une configuration**. The app submits the code to `POST /v1/enroll`. A successful response supplies a WireGuard profile which is parsed locally before the user taps **Se connecter**.

The code is consumed before peer provisioning. A failed provisioning attempt may therefore require an administrator to issue a new code. A code cannot be reused after successful or attempted enrollment.

## 4. Verify the tunnel

After connecting, check the server with:

```bash
sudo wg show wg0
```

Confirm a recent handshake and increasing transfer counters. Also test DNS, IPv4/IPv6 routing, reconnect, and peer revocation. The Android status “Tunnel actif” means the local backend accepted the tunnel configuration; it does not by itself prove Internet traffic is reaching its destination.
