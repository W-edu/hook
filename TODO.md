# hook — TODO

## ~~Store URL shorthand~~ ✓
~~Allow using just the Shopify URL slug instead of the full domain.~~
~~- `hook alec-dev-4 orders_create` instead of `hook alec-dev-4.myshopify.com orders_create`~~
~~- Normalise input: if no `.` in store arg, append `.myshopify.com`~~

## ~~List registered webhooks~~ ✓
~~Query Shopify Admin API for active webhook subscriptions on the store and display them.~~

## ~~Organisations~~ ✓
~~`hook orgs list` — lists configured orgs (maps to named apps).~~

## ~~List stores in an org~~ ✓
~~`hook [org-name] list` — lists authenticated stores for an org, disambiguated from `hook <store> list` by checking if arg matches a known app name.~~

## Install automation
Move compiled binary to `~/.local/bin` after `deno compile`.
- Add a `compile` task in `deno.json` that runs `deno compile` then copies binary to `~/.local/bin/hook`
- Ensure `~/.local/bin` exists (create if not)

## Open source release plan
Prepare repo for public release.
- Add LICENSE (MIT)
- Write README: install, setup (config file + Shopify app credentials), usage examples
- Strip any hardcoded internal references
- Add CONTRIBUTING.md
- Tag a v0.1.0 release on GitHub
- Consider homebrew tap or install script for distribution
