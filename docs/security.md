# Security checklist

- Keep ADMIN_TOKEN on the server only; never put it in Android.
- Bind the API to loopback and proxy it through TLS with access controls.
- The public enrollment endpoint accepts one-time, short-lived codes only; protect it with TLS, rate limits, abuse monitoring, and request-size limits.
- Enrollment codes are random, single-use, and stored as SHA-256 hashes; they are consumed before peer provisioning to prevent replay.
- Add per-user identity, subscription authorization, device limits, payment validation, and audit logs before public release.
- Never log authorization headers, enrollment codes, or generated client configs.
- Protect WireGuard keys, configs, environment files and client profiles with restrictive permissions.
- Test enrollment replay, expiry, revocation, restart persistence, DNS, and routing on a disposable WireGuard host.
- The sample installer runs the API as root because it modifies the WireGuard config. Before production, consider a narrowly scoped privileged helper and a dedicated service account.
- This sample is a starting point, not a security audit.
