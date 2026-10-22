# Security checklist

- Keep ADMIN_TOKEN on the server only; never put it in Android.
- Bind API to loopback and proxy through TLS with authentication.
- Add per-user identity, device limits, short-lived enrollment tokens and audit logs before public release.
- Never log authorization headers or generated client configs.
- Protect WireGuard keys, configs, environment files and client profiles with restrictive permissions.
- Test revocation and restart persistence before production.
- This sample is a starting point, not a security audit.
