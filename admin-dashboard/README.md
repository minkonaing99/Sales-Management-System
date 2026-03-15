# admin.digimium.new

Rewritten admin panel foundation that preserves current frontend pages, UI/UX, and JavaScript endpoint contracts.

## What changed

- Centralized app bootstrap in `app/bootstrap.php`.
- Centralized configuration via `.env` (`app/core/Config.php`).
- Centralized PDO connection (`app/core/Database.php`).
- Shared HTTP helpers (`app/core/Http.php`).
- Hardened storefront JSON integration (`app/core/ServiceCatalogStore.php`).
- `api_json/*` now enforces authenticated admin/owner access and uses atomic JSON writes.

## Setup

1. Copy `.env.example` to `.env`.
2. Set database credentials in `.env`.
3. Optionally set `DIGIMIUM_STOREFRONT_PATH` if storefront is not at sibling `../storefront`.
4. Serve this directory via Apache/PHP as before.

## Compatibility

- Existing pages (`index.php`, `sales_overview.php`, etc.) remain unchanged.
- Existing JavaScript files and endpoint URLs remain unchanged.
- Existing API contracts are preserved, with better auth and config handling.

## Deployment

- AWS EC2 + RDS + Apache2 guide: [DEPLOY_EC2_RDS_APACHE.md](./DEPLOY_EC2_RDS_APACHE.md)
