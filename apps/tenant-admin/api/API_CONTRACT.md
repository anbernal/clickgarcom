# Node Admin API Contract

## Recommended base paths

- Legacy admin API: `/admin/api`
- Versioned admin API: `/admin/api/v1`
- Legacy public API: `/admin/api/public`
- Versioned public API: `/admin/api/public/v1`

## Reuse guidance

- Existing web admin can keep consuming the legacy routes during migration.
- New mobile clients should prefer the versioned routes.
- KDS can reuse the same HTTP API contract for bootstrap/auth data, while the websocket contract remains a separate concern.

## Discovery and docs

- `GET /admin/api/health`
- `GET /admin/api/meta`
- `GET /admin/api/openapi.json`
- `GET /admin/api/v1/health`
- `GET /admin/api/v1/meta`
- `GET /admin/api/v1/openapi.json`

The raw OpenAPI document is intentionally **not** wrapped in the versioned success envelope, so tooling can ingest it directly.

## Versioned response envelope

Successful responses from `/admin/api/v1/*` and `/admin/api/public/v1/*` are wrapped as:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "api_version": "v1",
    "path": "/admin/api/v1/orders",
    "timestamp": "2026-03-21T18:30:00.000Z"
  }
}
```

Error responses from the versioned routes are wrapped as:

```json
{
  "success": false,
  "error": {
    "status_code": 401,
    "code": "unauthorized",
    "message": "Unauthorized"
  },
  "meta": {
    "api_version": "v1",
    "path": "/admin/api/v1/orders",
    "timestamp": "2026-03-21T18:30:00.000Z"
  }
}
```

## RBAC

Tenant-bound routes are now protected by JWT + role-based authorization.

Supported roles:

- `ADMIN`
- `MANAGER`
- `WAITER`
- `KITCHEN`
- `BAR`
- `CASHIER`

Accepted aliases normalized by the API:

- `GERENTE` -> `MANAGER`
- `ATENDENTE`, `SALAO`, `GARCOM`, `GARÇOM` -> `WAITER`
- `COZINHA` -> `KITCHEN`
- `CAIXA` -> `CASHIER`

Current route groups:

- full admin operations: `ADMIN`, `MANAGER`
- menu read: `ADMIN`, `MANAGER`, `WAITER`, `KITCHEN`, `BAR`, `CASHIER`
- order operations: `ADMIN`, `MANAGER`, `WAITER`, `KITCHEN`, `BAR`
- table read: `ADMIN`, `MANAGER`, `WAITER`, `CASHIER`
- settlement/wallet/reports: `ADMIN`, `MANAGER`, `WAITER`, `CASHIER` depending on endpoint

The exact role metadata is discoverable at `GET /admin/api/v1/meta`.

## Tenant scoping

- Tenant-authenticated routes derive scope from the JWT user.
- Legacy `tenant_id` query/body values sent by the web frontend are tolerated for compatibility, but they do not grant cross-tenant access.
- Reports are now strictly tenant-bound and no longer trust `tenant_id` from query string.

## KDS

- HTTP bootstrap should prefer `/admin/api/v1/orders` and `/admin/api/v1/menu`
- WebSocket contract is documented in [`docs/kds-websocket-contract.md`](../../docs/kds-websocket-contract.md)

## Notes

- The versioned paths currently alias the existing controllers. This keeps the old web frontend working while establishing a stable contract for mobile.
- The legacy routes still return the raw controller payloads. Do not use them as the long-term mobile contract.
- Public checkout continues under `/admin/api/public/v1/*` with Bearer token support and `access_token` query fallback for constrained clients.
