# Repository Migration Plan

## Objective

Reorganize the repository to the following target structure without increasing runtime risk during maintenance:

```text
apps/
  tenant-admin/
    api/
    web/
  super-admin/
    web/
platform/
  core-backend/
infra/
```

The migration must preserve:

- current service names in Docker Compose
- current ports
- current public/internal URLs
- current environment variable names
- current queue, database, and webhook behavior

## Current status

- [x] Phase 0: baseline and validation gates
- [x] Phase 1: path insulation
- [x] Phase 2: tenant admin web moved to `apps/tenant-admin/web`
- [x] Phase 3: tenant admin API moved to `apps/tenant-admin/api`
- [x] Phase 4: super admin web moved to `apps/super-admin/web`
- [x] Phase 5: core backend moved to `platform/core-backend`
- [x] Phase 6: cleanup

## Current to target mapping

- `services/node-admin` -> `apps/tenant-admin/api`
- `services/web-admin` -> `apps/tenant-admin/web`
- `services/super-admin` -> `apps/super-admin/web`
- `services/go-core` -> `platform/core-backend`
- `infra` -> `infra`
- `services/docs` -> `docs`

## Migration principles

1. Do not mix folder moves with business logic changes.
2. Move lower-risk runtimes first and leave `core-backend` for last.
3. Keep runtime contracts stable while physical paths change.
4. Complete one migration phase per PR or deploy window.
5. Remove compatibility fallbacks only after smoke validation succeeds.

## Safety rules

- Do not rename compose services in this migration.
- Do not change ports in this migration.
- Do not rename environment variables in this migration.
- Do not change database schema because of folder moves.
- Do not split KDS into a dedicated app in this migration.
- Do not rename `core-backend` to a narrower concept such as `rules-engine` while it still hosts API, workers, websocket, and infrastructure concerns.

## Execution order

### Phase 0: Baseline and validation gates

Goal:
- establish one documented checklist before any move

Deliverables:
- validation commands for compose, tenant API, tenant web, and core backend
- explicit current-to-target mapping
- rollback guidance

Exit criteria:
- baseline validation passes in the current layout

### Phase 1: Path insulation

Goal:
- stop hardcoding `services/...` in operational scripts and compose where avoidable

Deliverables:
- directory variables with safe defaults
- compose paths driven by variables with current defaults
- build contexts aligned to the owning app directory

Exit criteria:
- current layout still boots with no functional change

### Phase 2: Move tenant admin web

Goal:
- move the lowest-risk runtime first

Deliverables:
- `apps/tenant-admin/web`
- compose and deploy scripts updated to the new path

Validation:
- `/_config.js`
- login page
- admin shell
- KDS page
- checkout page

### Phase 3: Move tenant admin API

Goal:
- move the Nest backend after the tenant web is already stable

Deliverables:
- `apps/tenant-admin/api`
- compose, Makefile, and docs updated

Validation:
- `/admin/api/health`
- `/admin/api/v1/health`
- auth
- tables
- orders
- public checkout endpoints

### Phase 4: Move super admin web

Goal:
- move static global admin after tenant admin is stable

Deliverables:
- `apps/super-admin/web`

Validation:
- static assets load
- login page loads

### Phase 5: Move core backend

Goal:
- move the highest-risk runtime last

Deliverables:
- `platform/core-backend`
- compose, Makefile, build, and deploy paths updated

Validation:
- `go-api` health
- websocket endpoint
- worker startup
- outbox startup
- migrations
- payment flows
- webhook flows

### Phase 6: Cleanup

Goal:
- remove temporary compatibility and stale references

Deliverables:
- old `services/...` references removed
- docs consolidated
- onboarding updated

## Rollback strategy

- If a phase fails, revert only that phase.
- Do not partially move two runtimes in the same change window.
- Do not delete old paths until the moved runtime has been rebuilt and smoke-validated.

## Baseline validation checklist

Run before and after each phase:

```bash
make validate-migration-baseline
```

Expected coverage:

- repository layout paths exist
- `docker compose config` resolves
- tenant admin API builds
- tenant admin web entrypoint parses
- core backend tests run
- super admin web files are present

## Risk profile

- `tenant-admin/web`: low
- `super-admin/web`: low
- `tenant-admin/api`: medium
- `core-backend`: high

## Deferred items

- mobile session strategy
