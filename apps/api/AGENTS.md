# apps/api: agent notes

NestJS on Fastify, Postgres via `pg` (runtime role `taco_hunt_api`), Supabase for auth and storage, request/response shapes from `@taco-hunt/contracts` (zod). Also read the root `AGENTS.md` and `supabase/AGENTS.md`.

## Conventions

- One module per feature under `src/` (`spots`, `reviews`, `proposals`, `media`, `places`, `admin`, `account`, …). Put new endpoints in the module that owns the data; don't create cross-cutting helpers without a reason.
- Every request and response body is validated with the zod schemas in `packages/contracts`. Changing a schema is a shared-file change (see `packages/contracts/AGENTS.md`); get the orchestrator's decision first.
- Errors go through `src/common/api-exception.filter.ts`; return the shared error shape, never stack traces or SQL messages.
- Public reads return approved or visible data only. Never expose an email, a user ID where a display name will do, or anything from a pending/rejected record to someone other than its author or an admin.
- Admin actions write to `moderation_audit`.

## Database access

- The runtime role `taco_hunt_api` has **only the grants listed in the migrations**. Before writing a query, check that the role has the privilege it needs. Row locks (`FOR SHARE` / `FOR UPDATE`) need UPDATE privilege on every locked table; locking `taco_types`, which is SELECT-only, broke every review post (T31).
- New tables or columns need explicit grants in the same migration (see `supabase/AGENTS.md`).
- Use parameterized queries only; no string-built SQL.

## External services

- Google Places goes through `PlacesService`, which enforces the daily call budget and the kill switch (`GOOGLE_PLACES_DAILY_CALL_LIMIT`, `GOOGLE_PLACES_KILL_SWITCH`). Never call Google directly from another module.
- Uploaded images go through the media pipeline (decode, strip EXIF, resize) before storage; reuse it for new photo types (for example, stand and profile photos).
- Any new external provider (for example, T40's automated image review) needs an orchestrator decision logged before it is added.

## Checks

- `pnpm --filter @taco-hunt/api typecheck` (it builds contracts first), plus the root `pnpm lint` and `pnpm format` on changed files.
- Run locally with `pnpm db:start` then `pnpm dev:api`.
