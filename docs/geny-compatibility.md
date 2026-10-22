# Geny compatibility assessment

The supplied APK contains a custom native engine and string-level evidence for transport selector `wss`, `camouflage`, or `slowdns`, plus Geny-specific headers. This does not disclose enough framing, cryptographic handshake, relay state machine, authentication proof calculation, or server behavior to recreate a compatible endpoint.

This server implements standard WireGuard over UDP only. It is deliberately not presented as Geny-compatible. Obtain an authorized protocol specification or build a new independently designed transport/client-server pair. Wrapping UDP in WebSocket does not by itself make it compatible with the proprietary server.
