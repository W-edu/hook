# hook — Roadmap

Post-MVP phases in rough priority order.

---

## Phase 1 — Cross-platform support

Extend the Mac-only MVP to Linux and Windows.

- **Linux** — replace macOS Keychain (`security` CLI) with `libsecret` (GNOME Keyring) or a fallback to encrypted file storage; adjust binary paths and shell detection
- **Windows** — replace Keychain with Windows Credential Manager via `cmdkey`/PowerShell; ensure cloudflared install path works; test terminal raw mode behaviour
- Unified install script that detects OS and installs the correct binary + cloudflared
- CI matrix builds for darwin/linux/windows

---

## Phase 2 — Payload capture and replay

Capture real webhook payloads as JSON files to use as test fixtures during development, and replay them against a local endpoint without needing to trigger real Shopify events. Useful for building and testing apps that handle webhooks — capture once from a real store, iterate against the saved payload indefinitely.

- `w` key during a live session — saves the last received payload to a file (`orders_create_<timestamp>.json`)
- `hook <store> log <id> --save <file.json>` — save a specific payload from SQLite
- `hook <store> log <topic> --save-all <dir>` — save all matching payloads as individual files into a directory
- `hook <store> replay <id>` — POST a stored payload to a target URL with original headers
- `hook <store> replay <topic> --last` — replay the most recent payload for a topic
- `hook <store> replay <topic> --all` — replay all stored payloads for a topic in order
- `hook replay <file.json> <url>` — replay a saved JSON file directly, no SQLite required
- Replay re-signs `x-shopify-hmac-sha256` so the target app's HMAC check still passes
- `--dry-run` flag to preview what would be sent without firing

---

## Phase 3 — Local web UI

A browser-based companion to the terminal view. Useful for inspecting large payloads, sharing webhook data with teammates, and visualising patterns.

- `hook ui` — starts a local web server and opens the browser
- Real-time webhook feed via SSE or WebSocket
- Payload inspector with syntax-highlighted JSON
- Filter and search across SQLite history
- Replay trigger from the UI

---

## Phase 4 — Multi-store listening

Listen across multiple stores in a single session. Relevant for agency workflows where you're debugging across client stores simultaneously.

- `hook <store1> <store2> <topic>` — single tunnel, webhooks tagged by shop domain
- Unified display with per-store colour coding
- All stores must be authenticated under the same app

---

## Phase 5 — Distribution & lifecycle

- **Homebrew core** — submit to `homebrew/homebrew-core` once stable (requires formula + audit)
- **Auto-update notifications** — check GitHub releases on startup, notify if a newer version exists; `hook update` to install it
- **Version pinning** — `hook --version`; binary embeds build date and git SHA

---

## Phase 6 — Advanced debugging

- **Field-level filtering** — `hook <store> orders_create --where 'financial_status=pending'` — only show payloads matching a JSONPath/field condition
- **Export** — `hook <store> log --export webhooks.csv` CSV export alongside JSON
- **Diff view** — for update events, show a diff between the previous and current payload for the same resource ID
- **ngrok support** — alternative tunnel provider for users who prefer it or need a stable subdomain; configurable via `hook setup`
- **Webhook latency tracking** — compare `x-shopify-triggered-at` header against `received_at` to surface delivery lag
