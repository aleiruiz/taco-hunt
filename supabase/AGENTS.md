# supabase: agent notes

Local Supabase (Postgres, Auth, Storage) config, migrations, and seed. Also read the root `AGENTS.md`.

## Migrations

- Only add new migration files; never edit a migration that is already on `main`.
- Name files `YYYYMMDDHHMMSS_t##_<description>.sql` using the **current UTC time** and your task ID. Timestamps must be unique; several agents add migrations in parallel, and duplicate prefixes already exist in the history, so don't reuse a number.
- Application tables live in schema `app_private`. The API connects as `taco_hunt_api`, which only gets what migrations grant. Every new table, column, or sequence the API needs must be granted in the same migration, with the minimum privilege: SELECT for reads, INSERT/UPDATE only where the API writes, and UPDATE on any table the API row-locks (`FOR SHARE` / `FOR UPDATE`).
- Anything that stores personal data (photos, avatars, profile fields) must be covered by account deletion (T14/T15); say how in the PR.
- Apply locally with `pnpm db:reset` (it reruns all migrations and `seed.sql`).

## Seed data

`seed.sql` holds demo data only (for example, "Tacos Demo 01"). Never add real user or venue data here; real stands go through the T13 importer and moderation (see the seed rules in `docs/plan-delegacion.md`).
