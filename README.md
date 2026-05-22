# hook

A CLI for intercepting Shopify webhooks locally. Opens a secure [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) tunnel, registers webhooks on your store, and streams payloads to your terminal in real time. Webhooks are automatically cleaned up when you quit.

```
[14:23:01] ✓ ORDERS_CREATE         my-store.myshopify.com   (2.4kb)
[14:23:04] ✓ CUSTOMERS_UPDATE      my-store.myshopify.com   (1.1kb)
[14:23:09] ✗ HMAC ORDERS_CREATE    my-store.myshopify.com   (2.4kb)
```

---

## Requirements

- macOS (Linux and Windows support coming)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) — installed by the install script, or manually via `brew install cloudflared`
- A [Shopify Partner app](https://partners.shopify.com) with a client ID and client secret

---

## Install

```bash
/bin/sh -c "$(curl -fsSL https://raw.githubusercontent.com/W-edu/hook/main/install.sh)"
```

The script will:
1. Ask whether to install `cloudflared` via Homebrew
2. Download the correct binary for your Mac (arm64 or x86_64)
3. Install it to `/usr/local/bin/hook`

> **Note:** The x86_64 (Intel Mac) binary is cross-compiled and has not been tested on real hardware. If you encounter issues, please [open an issue](https://github.com/W-edu/hook/issues) or build from source.

### Build from source

Requires [Deno](https://deno.com).

```bash
git clone https://github.com/W-edu/hook.git
cd hook
deno task start <args>   # run without compiling
deno task release        # compile and install to /usr/local/bin
```

---

## Setup

### 1. Configure your Shopify app

You need a Shopify Partner app. In the [Partner Dashboard](https://partners.shopify.com), go to your app → **Client credentials** and copy the client ID and secret.

```bash
hook setup
```

To configure multiple apps (e.g. one per organisation):

```bash
hook setup acme-org
```

### 2. Authenticate a store

```bash
hook auth my-store
```

This opens a browser OAuth flow. The token is stored in your macOS Keychain. On first auth, hook automatically discovers and saves the organisation name associated with the app.

To authenticate a store against a named app:

```bash
hook auth my-store --app acme-org
```

---

## Usage

### Listen for webhooks

```bash
hook my-store orders_create
hook my-store orders_all          # all orders topics
hook my-store customers_all --headers-only
```

While listening:

| Key | Action |
|-----|--------|
| `e` | Expand last payload (full headers + body) |
| `s` | List active subscriptions and tunnel URL |
| `q` | Quit and clean up webhooks |

Press `Ctrl+C` to quit.

### Topic syntax

Topics use snake_case. Use `_all` to subscribe to all topics for a resource:

| Input | Resolves to |
|-------|-------------|
| `orders_create` | `ORDERS_CREATE` |
| `orders_all` | All `ORDERS_*` topics |
| `customers_all` | All `CUSTOMERS_*` topics |
| `products_all` | All `PRODUCTS_*` topics |

Available topics are fetched live from the store's GraphQL schema, so plan-restricted topics (e.g. Shopify Plus-only) are handled automatically.

### Other commands

```bash
hook my-store list              # list active webhook subscriptions
hook my-store prune             # delete stale tunnel webhooks from crashed sessions
hook auth list                  # list authenticated stores
hook auth revoke my-store       # remove stored token
hook orgs list                  # list configured apps/orgs
hook acme-org list              # list stores authenticated under an org
hook reset                      # wipe all tokens and config
```

---

## Multiple organisations

hook supports multiple named apps, useful for agencies managing several client organisations.

```bash
hook setup acme-org             # configure credentials for acme-org
hook auth client-store --app acme-org
hook acme-org list              # list all stores under acme-org
hook client-store orders_all
```

---

## How it works

1. `hook auth` runs an OAuth flow and stores the access token in your macOS Keychain
2. On `hook <store> <topic>`, a cloudflared tunnel is opened to `localhost:58080`
3. Webhooks are registered on the store pointing to the tunnel URL
4. Incoming requests are HMAC-verified and displayed in the terminal
5. On quit, all registered webhooks are deleted from the store

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
