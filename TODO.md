# hook — TODO

## Store URL shorthand
Allow using just the Shopify URL slug instead of the full domain.
- `hook alec-dev-4 orders_create` instead of `hook alec-dev-4.myshopify.com orders_create`
- Normalise input: if no `.` in store arg, append `.myshopify.com`

## List registered webhooks
```
hook alec-dev-4 list
```
Query Shopify Admin API for active webhook subscriptions on the store and display them.

## Organisations
```
hook orgs list
```
List configured organisations (currently these map to named apps, e.g. "default", "acme-org").
May need a concept of an org with a display name distinct from the app name.

## List stores in an org
```
hook [org-name] list
```
List all stores authenticated under a given org/app.
Needs disambiguation from `hook <store> list` — likely resolved by checking whether the first arg matches a known org name vs a known store domain.
