# Node Admin Decoupling Tasks

## Objective

Turn `node-admin` into an API that can be reused by:
- current web admin
- KDS web client
- future mobile app

without forcing the backend to serve the frontend shell.

## Executed now

- [x] Added runtime mode support with `ADMIN_WEB_ENABLED`
- [x] Extracted static dashboard/KDS/checkout delivery from `main.ts`
- [x] Made the API able to run in `api` mode without serving `public/`
- [x] Added service metadata endpoints to clarify runtime mode
- [x] Preserved backward compatibility by keeping web delivery enabled by default
- [x] Added runtime web config (`/_config.js`) so the frontend can target an external API and KDS WebSocket
- [x] Created a dedicated `web-admin` service to serve the current admin/KDS frontend independently
- [x] Moved the canonical web assets to `apps/tenant-admin/web/public`
- [x] Made `node-admin` hybrid mode prefer `apps/tenant-admin/web/public` with legacy fallback
- [x] Started DTO-based request validation for core admin endpoints (`auth`, `orders`, `tables`, `menu`, `categories`)
- [x] Split public proxying so checkout assets come from `web-admin` while public payment API stays in `node-admin`
- [x] Switched compose/deploy defaults to treat `node-admin` as API-first and `web-admin` as the web frontend
- [x] Added versioned API aliases (`/admin/api/v1` and `/admin/api/public/v1`) without breaking legacy clients
- [x] Added stable success/error response envelopes for the versioned API surface
- [x] Published backend API contract metadata for mobile/web reuse

## Next tasks

- [x] Removed the legacy compatibility copy in `apps/tenant-admin/api/public`
- [ ] Expand DTO coverage to the remaining admin/public endpoints
- [x] Add role-based authorization for `manager`, `waiter`, `kitchen`, `bar`, `cashier`
- [x] Publish OpenAPI contract for mobile consumption
- [x] Define a stable KDS websocket event contract
- [ ] Create mobile-focused auth/session refresh strategy

## Runtime modes

- `ADMIN_WEB_ENABLED=true`: current hybrid mode, API + static admin frontend
- `ADMIN_WEB_ENABLED=false`: API-only mode for mobile/backend reuse
