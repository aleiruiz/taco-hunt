# Local Supabase: API role

The API connects to `app_private` with the dedicated `taco_hunt_api` role. This role's credentials are server-only; never put them in `EXPO_PUBLIC_*`, in migrations, or in Git.

## First local use

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
pnpm db:start
pnpm db:reset
.\supabase\dev-role.ps1 provision
```

The script generates a random local password, applies it to the role that the migration prepares, and updates only `DATABASE_URL` in `.env`. It does not print or persist the password in the migration history. `supabase db reset` recreates the database; after a reset, run `provision` again to set a new secret and update `.env`.

## T01 E2E verification

With Docker Desktop running and dependencies installed, run from the root in PowerShell:

```powershell
pnpm db:start
pnpm db:reset
.\supabase\dev-role.ps1 provision
.\node_modules\.bin\supabase.cmd db query --local "select count(*) as fixture_spots from app_private.spots where source_type = 'fictional';" --output table
.\node_modules\.bin\supabase.cmd db query --local "select count(*) as fixture_tacos from app_private.spot_tacos st join app_private.spots s on s.id = st.spot_id where s.source_type = 'fictional';" --output table
.\node_modules\.bin\supabase.cmd db query --local "select has_schema_privilege('anon', 'app_private', 'USAGE') as anon_schema, has_table_privilege('taco_hunt_api', 'app_private.import_candidates', 'SELECT') as api_import_read, has_table_privilege('taco_hunt_api', 'app_private.spots', 'SELECT') as api_spot_read;" --output table
.\node_modules\.bin\supabase.cmd db query --local "select has_table_privilege('taco_hunt_api', 'app_private.moderation_audit', 'SELECT') as audit_select, has_table_privilege('taco_hunt_api', 'app_private.moderation_audit', 'INSERT') as audit_insert, has_table_privilege('taco_hunt_api', 'app_private.moderation_audit', 'UPDATE') as audit_update, has_table_privilege('taco_hunt_api', 'app_private.moderation_audit', 'DELETE') as audit_delete;" --output table
.\node_modules\.bin\supabase.cmd db query --local "select md5(string_agg(id::text, ',' order by id)) as spot_id_fingerprint from app_private.spots where source_type = 'fictional';" --output table
.\node_modules\.bin\supabase.cmd db query --local "select md5(string_agg(st.id::text, ',' order by st.id)) as spot_taco_id_fingerprint from app_private.spot_tacos st join app_private.spots s on s.id = st.spot_id where s.source_type = 'fictional';" --output table
```

Expected results: 10 stands and 20 relations; `anon_schema`, `api_import_read`, `audit_update`, and `audit_delete` are `false`; `api_spot_read`, `audit_select`, and `audit_insert` are `true`. With Supabase CLI 2.118.0 and Docker 29.8.0, two consecutive resets gave the same counts and fingerprints (`spots`: `cf48a3622d0b7db51a7048ce604af04e`; `spot_tacos`: `9c34ee5c39c0871b5df8a0c0c5e8bd8d`). Those two runs confirmed the general permissions and ID reproducibility. After the adjustment to `moderation_audit`, an additional reset confirmed the expected ACLs for the API and `anon`: `false`, `false`, `true`, `true`, `true`, `false`, `false` in the order shown by the query.

To repeat the full comparison, run the block from `pnpm db:start` through the two fingerprint queries, then run `pnpm db:reset`, `provision`, and every query in the block again. Counts, ACLs, and fingerprints must match. No keys or passwords are included in the queries or their output.

To rotate the credential without resetting the database (equivalent to provisioning a new one):

```powershell
.\supabase\dev-role.ps1 rotate
```

The script uses the local CLI installed in `node_modules/.bin` and `supabase db query --local --file` with a temporary SQL file that is deleted when it finishes. If the command fails, it does not update `.env`; retry once the local stack is running. The expected connection is `postgresql://taco_hunt_api:<local-secret>@127.0.0.1:55422/postgres`.

## Contract for the API

- `DATABASE_URL` must point to `taco_hunt_api` on the local port `55422`, not to the owner user `postgres`.
- `taco_hunt_api` gets explicit permissions on runtime tables and only `SELECT`/`INSERT` on `moderation_audit`, to keep the log immutable. `import_candidates` and future tables are excluded; `anon`, `authenticated`, and `service_role` get no access to the schema.
- The Supabase Data API only exposes `public` and `graphql_public`; product tables live in `app_private`.
- Deployment must create/provision a dedicated runtime user through a secret managed outside the repository. The local password or the migration credential must never be used in production.

The ten stands and the taco types are fictional fixtures with stable IDs; `pnpm db:reset` reseeds them reproducibly.
