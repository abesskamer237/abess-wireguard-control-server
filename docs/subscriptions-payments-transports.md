# ABESS subscriptions and payments

## Current lifecycle

1. An administrator creates a subscription using `POST /v1/subscriptions`. It remains `pending_payment`; it cannot issue activation codes yet.
2. Payment can be confirmed manually after checking the actual transaction in the payment provider's official dashboard, using `POST /v1/subscriptions/:id/confirm-payment`.
3. For automated payments, a provider-specific adapter must verify the payment provider's webhook signature and successful final status. It then forwards a canonical event to `POST /v1/webhooks/payment` with `X-Abess-Signature`.
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

## Important: provider integration is not yet complete

The canonical signed webhook is a secure internal hand-off, not a direct adapter for Campay, Monetbil, Flutterwave, MTN Mobile Money, Orange Money, or another provider. Their API credentials, callback signature validation, transaction lookup, and payment status mapping must be implemented for the chosen provider. Never activate a subscription from a client-supplied `paid: true` flag or an unverified callback.

## Transport compatibility

This repository implements standard WireGuard over UDP. It cannot carry WireGuard packets over WebSocket/TLS merely by changing a profile field. The separate ABESS Xray control-panel repository supports standard Xray-based VLESS/VMess/Trojan/compatible Shadowsocks transports, including WebSocket over TLS, gRPC, HTTPUpgrade and XHTTP where configured. That is a separate client/data-plane architecture. SlowDNS is not implemented here, and proprietary Geny transport behavior cannot be reproduced without its protocol specification.
