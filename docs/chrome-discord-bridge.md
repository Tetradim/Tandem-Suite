# Chrome Discord Bridge

Tandem Suite accepts local Chrome bridge traffic at:

```text
POST /api/discord/chrome-bridge/message
POST /api/discord/chrome-bridge/heartbeat
```

`message` payloads are normalized and appended to the Tandem local event bus as `signal.observed` with `contract_version: chrome.discord.message.v1`.

`heartbeat` payloads are appended as `bridge.health`. The endpoints are local-only unless `CHROME_BRIDGE_ALLOW_REMOTE=1` is set.
