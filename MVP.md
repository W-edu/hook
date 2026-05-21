# hook — MVP

The MVP target is a Mac-only release that a Shopify developer can install in one command and be intercepting webhooks within minutes, with no manual dependency management.

## Distribution

- **Homebrew tap** — `brew install yourname/tap/hook` installs the binary and cloudflared in one step
- **Install script fallback** — `curl | sh` for users who don't use Homebrew; downloads the compiled binary and checks for/installs cloudflared
- Compiled binary is self-contained (Deno runtime bundled); only external dependency is cloudflared

## Core CLI (complete)

- `hook setup [app]` — configure a named Shopify app with client ID, client secret, and optional display name
- `hook setup list` / `hook orgs list` — list configured apps/orgs, including discovered org name and display name
- `hook auth <store> [--app]` — OAuth flow; auto-discovers org name from Shopify on first install
- `hook auth list` / `hook auth revoke` — manage stored tokens
- `hook <store> list` — list active webhook subscriptions on a store
- `hook <store> prune` — delete stale tunnel webhooks left by crashed sessions
- `hook <store> <topic>` — open tunnel, register webhooks, listen; auto-prunes stale webhooks on start
- `hook reset` — wipe all tokens and config with confirmation
- `hook <org> list` — list authenticated stores for an org
- Graceful teardown on Ctrl+C, `q`, SIGINT, SIGTERM
- HMAC verification status (✓/✗) on every received webhook
- Dynamic topic resolution via GraphQL introspection (respects store plan)
- Interactive keys: `e` expand last payload · `s` list active subscriptions · `q` quit

## SQLite webhook storage

Temporarily store received webhook payloads in a local SQLite database for post-session analysis and debugging.

- DB stored at `~/.local/share/hook/webhooks.db`
- Schema: `id`, `store`, `topic`, `received_at`, `hmac_valid`, `headers` (JSON), `body` (JSON)
- Configurable retention — default 7 days, auto-purge on startup
- New commands:
  - `hook <store> log` — view recent webhook history in the terminal
  - `hook <store> log <topic>` — filter by topic
  - `hook <store> log --since 1h` — filter by time window
  - `hook <store> log --export <file.json>` — export to JSON

## Agentic integration (MCP server)

Expose hook as an MCP server so Claude and other agents can use it as a debugging tool without needing the terminal UI.

- `hook mcp` — start hook as an MCP server over stdio
- Exposes tools:
  - `listen` — open a tunnel and register webhooks for a store/topic
  - `stop` — tear down the active session
  - `get_recent` — fetch recent payloads from SQLite (count, topic filter, time window)
  - `get_payload` — fetch a specific payload by ID with full headers and body
  - `list_subscriptions` — list active webhook subscriptions on a store
  - `list_stores` — list authenticated stores

## Open source release

- LICENSE (MIT)
- README: install, Shopify app setup, usage examples, topic syntax reference
- CONTRIBUTING.md
- Strip any hardcoded internal references
- v0.1.0 GitHub release with compiled binary attached
