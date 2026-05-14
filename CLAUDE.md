# hook

Deno/TypeScript CLI for intercepting Shopify webhooks locally via a cloudflared tunnel.

## Commands

```bash
deno task start [args]   # run from source
deno task compile        # compile → ./hook binary
```

## Architecture

| File | Role |
|------|------|
| `src/main.ts` | CLI entry point, arg parsing, command dispatch |
| `src/config.ts` | Reads/writes `~/.config/hook/config.json` — named app credentials + store→app mapping |
| `src/keychain.ts` | macOS Keychain wrapper via `security` CLI — service name `hook-shopify` |
| `src/auth.ts` | Shopify OAuth flow — opens browser, listens on port 57432 for callback |
| `src/tunnel.ts` | Opens a localtunnel (`loca.lt`) on the given port |
| `src/shopify.ts` | Admin GraphQL webhook CRUD (register, list, delete) + HMAC verify + topic resolution |
| `src/server.ts` | Deno HTTP server on port 58080 — handles `POST /webhook` and `GET /callback` |
| `src/display.ts` | Compact summary line, ring buffer (20 entries), `e` to expand, `q` to quit |

## Key details

- Store args accept shorthand: `my-store` is normalised to `my-store.myshopify.com` everywhere
- Tokens stored in macOS Keychain, account = store domain
- Webhooks registered on start, deleted on `SIGINT`/`SIGTERM` (graceful stop only)
- OAuth callback port: 57432 — webhook listener port: 58080
- Shopify API version: `2024-10`

## CLI usage

```
hook setup [app]                  Add/update a named app (default: "default")
hook setup list                   List configured apps
hook auth <store> [--app <name>]  Authenticate a store via OAuth
hook auth list                    List authenticated stores
hook auth revoke <store>          Remove stored token
hook <store> list                 List active webhook subscriptions on store
hook <store> <topic>              Listen for webhooks
hook <store> <topic> --headers-only
```

## Topic syntax

- `orders_create` → exact topic (`ORDERS_CREATE`)
- `orders_all` → all topics for that resource group
- Known groups: `orders`, `products`, `customers`, `inventory`, `fulfillments`, `checkouts`, `carts`, `draft_orders`, `collections`, `refunds`, `disputes`, `app`
