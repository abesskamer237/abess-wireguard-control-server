# LUNA subscriptions and Monetbil payments

## Current lifecycle

1. An administrator creates a subscription using `POST /v1/subscriptions`. It remains `pending_payment`; it cannot issue activation codes yet.
2. Payment can be confirmed manually after checking the actual transaction in the payment provider's official dashboard, using `POST /v1/subscriptions/:id/confirm-payment`.
3. For automated payments, create a Monetbil checkout with `POST /v1/payments/monetbil/checkout`. The API submits the order to Monetbil Widget v2.1 and returns `paymentUrl`. Monetbil sends a signed GET/POST notification to `POST /v1/webhooks/monetbil`.
4. The canonical signature is HMAC-SHA256 using `PAYMENT_WEBHOOK_SECRET` over this exact UTF-8 string:

   `subscriptionId.status.amountXaf.currency.paymentReference`

   `status` is lower-case and `currency` is upper-case in the signed payload. The amount must exactly match the pending subscription in XAF. Use a secret of at least 32 characters. Do not expose this secret to the Android app.
5. After payment is verified, an administrator issues a short-lived activation code tied to the active subscription. The Android client exchanges it for a WireGuard profile.
6. The API rejects expired or pending subscriptions, limits each subscription to its configured number of peers, and periodically removes peers when the subscription expires.

## Example: create a pending subscription

Use the admin token from the protected server environment. Do not commit it or paste it into a public chat.

```bash
curl --fail-with-body --silent --show-error \
  --request POST https://YOUR_API_DOMAIN/v1/subscriptions \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"customerId":"client-01","plan":"Mensuel","amountXaf":2500,"currency":"XAF","durationDays":30,"maxDevices":2}'
```

Copy the returned subscription ID. It remains pending until a verified payment is recorded.

## Monetbil setup

Configure `MONETBIL_SERVICE_KEY`, `MONETBIL_SERVICE_SECRET`, and `PUBLIC_API_BASE_URL` in the protected service environment. Register `https://YOUR_API_DOMAIN/v1/webhooks/monetbil` as the notification URL in Monetbil. Start checkout with:

```bash
curl --fail-with-body --silent --show-error \\
  --request POST https://YOUR_API_DOMAIN/v1/payments/monetbil/checkout \\
  --header 'Content-Type: application/json' \\
  --data '{"subscriptionId":"SUBSCRIPTION_ID","phone":"2376XXXXXXXX"}'
```

Open the returned `paymentUrl` for the customer. The server verifies Monetbil's `sign` field with the service secret and checks the service key, `status=success`, `payment_ref`/`item_ref`, exact XAF amount and transaction ID before activation. The provider callback does not rely on the Android client to declare a payment successful.

## Important: rollout still required

The Monetbil integration uses the documented Widget v2.1 checkout and signed notification contract. Test against Monetbil sandbox and confirm the exact signature behavior with your service credentials before going live. Never activate a subscription from a client-supplied `paid: true` flag or an unverified callback.

## Transport compatibility

This repository implements standard WireGuard over UDP. It cannot carry WireGuard packets over WebSocket/TLS merely by changing a profile field. The separate Xray control-panel repository supports standard Xray-based VLESS/VMess/Trojan/compatible Shadowsocks transports, including WebSocket over TLS, gRPC, HTTPUpgrade and XHTTP where configured. That is a separate client/data-plane architecture. SlowDNS is not implemented here, and proprietary Geny transport behavior cannot be reproduced without its protocol specification.
