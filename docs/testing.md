# Verification checklist

## Automated checks

- Run npm test from the api directory.
- Run node --check api/server.mjs and node --check api/peer-config.mjs.
- Review the GitHub Actions run for the current commit.

## Disposable-server integration checks

Do not run these against a production VPN without a maintenance window and backup.

1. Verify wg show wg0 and the server UDP firewall rule.
2. Create a peer with a unique test name and confirm its /32 appears in wg show wg0.
3. Import the returned config into a trusted WireGuard client and confirm a handshake.
4. Test DNS and permitted routing, including IPv6 leak behavior.
5. Delete the peer and confirm it disappears from wg show wg0 and can no longer handshake.
6. Restart the service and host; verify persisted peers remain consistent.
7. Test missing/invalid authorization, duplicate names, malformed JSON, and oversized request bodies.

The repository's unit tests do not replace these real-server tests.
