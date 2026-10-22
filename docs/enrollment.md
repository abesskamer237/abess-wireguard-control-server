# Android enrollment flow

This endpoint is for issuing a short-lived activation code to an Android user. The admin token must be used only from a trusted administrator shell, never from the Android app.

## 1. Create a one-time code

On the server, after configuring `SERVER_ENDPOINT` and starting the API, load the admin token from the protected environment file without printing it:

```bash
set -a
. /etc/abess-wireguard-api.env
set +a
curl --fail-with-body --silent --show-error \
  --request POST https://YOUR_API_DOMAIN/v1/enrollment-tokens \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"name":"phone-01","ttlSeconds":300}'
```

Replace `YOUR_API_DOMAIN` with the real HTTPS API hostname. The response includes a one-time `token`; send that code to the intended user through a trusted channel. Do not paste it into GitHub, logs, or a public chat. The code expires after five minutes by default.

Supported `ttlSeconds` values are 60 to 3600. Each pending or existing peer name can have only one enrollment at a time.

## 2. Enroll from Android

In ABESS VPN, enter the HTTPS API base URL (without `/v1/enroll`) and the one-time code, then tap **Obtenir une configuration**. The app submits the code to `POST /v1/enroll`. A successful response supplies a WireGuard profile which is parsed locally before the user taps **Se connecter**.

The code is consumed before peer provisioning. A failed provisioning attempt may therefore require an administrator to issue a new code. A code cannot be reused after successful or attempted enrollment.

## 3. Verify the tunnel

After connecting, check the server with:

```bash
sudo wg show wg0
```

Confirm a recent handshake and increasing transfer counters. Also test DNS, IPv4/IPv6 routing, reconnect, and peer revocation. The Android status “Tunnel actif” means the local backend accepted the tunnel configuration; it does not by itself prove Internet traffic is reaching its destination.
