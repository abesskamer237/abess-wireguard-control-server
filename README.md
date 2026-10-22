# ABESS WireGuard Control Server

Clean-room baseline for standard WireGuard over UDP with an administrative peer provisioning API. It is **not compatible with Geny's proprietary WSS/camouflage/SlowDNS transport**.

Keep the API bound to 127.0.0.1 and behind TLS/auth. Never embed ADMIN_TOKEN in Android. See docs/security.md.
