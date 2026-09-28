# Supabase local: rol del API

El API se conecta a `app_private` con el rol dedicado `taco_hunt_api`. Las claves de este rol son solo de servidor; nunca las pongas en `EXPO_PUBLIC_*`, en migraciones ni en Git.

## Primer uso local

Desde la raíz del repositorio en PowerShell:

```powershell
Copy-Item .env.example .env
pnpm db:start
pnpm db:reset
.\supabase\dev-role.ps1 provision
```

El script genera una contraseña aleatoria local, la aplica al rol que prepara la migración y actualiza solo `DATABASE_URL` en `.env`. No imprime ni persiste la contraseña en el historial de migraciones. `supabase db reset` recrea la base; después de un reset vuelve a correr `provision` para establecer una nueva clave y actualizar `.env`.

## Verificación E2E de T01

Con Docker Desktop iniciado y las dependencias instaladas, corre desde la raíz en PowerShell:

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

Resultados esperados: 10 puestos y 20 relaciones; `anon_schema`, `api_import_read`, `audit_update` y `audit_delete` en `false`; `api_spot_read`, `audit_select` y `audit_insert` en `true`. Con Supabase CLI 2.118.0 y Docker 29.8.0, dos resets consecutivos dieron los mismos conteos y huellas (`spots`: `cf48a3622d0b7db51a7048ce604af04e`; `spot_tacos`: `9c34ee5c39c0871b5df8a0c0c5e8bd8d`). Esas dos ejecuciones confirmaron los permisos generales y la reproducibilidad de IDs. Después del ajuste a `moderation_audit`, un reset adicional confirmó los ACL esperados para el API y `anon`: `false`, `false`, `true`, `true`, `true`, `false`, `false` en el orden mostrado por la consulta.

Para repetir la comparación completa, ejecuta el bloque desde `pnpm db:start` hasta las dos consultas de huellas, vuelve a ejecutar `pnpm db:reset`, `provision` y todas las consultas del bloque. Los conteos, ACLs y huellas deben coincidir. No se incluyen claves ni contraseñas en las consultas o su salida.

Para rotar la clave sin reiniciar la base (equivale a provisionar una nueva):

```powershell
.\supabase\dev-role.ps1 rotate
```

El script usa la CLI local instalada en `node_modules/.bin` y `supabase db query --local --file` con un archivo SQL temporal que elimina al terminar. Si el comando falla, no actualiza `.env`; vuelve a intentarlo cuando el stack local esté activo. La conexión esperada queda como `postgresql://taco_hunt_api:<secreto-local>@127.0.0.1:55422/postgres`.

## Contrato para el API

- `DATABASE_URL` debe apuntar a `taco_hunt_api` en el puerto local `55422`, no al usuario propietario `postgres`.
- `taco_hunt_api` recibe permisos explícitos en tablas de runtime y solo `SELECT`/`INSERT` en `moderation_audit`, para mantener inmutable la bitácora. `import_candidates` y futuras tablas quedan fuera; `anon`, `authenticated` y `service_role` no reciben acceso al esquema.
- Supabase Data API expone únicamente `public` y `graphql_public`; las tablas de producto están en `app_private`.
- El despliegue debe crear/provisionar un usuario runtime dedicado mediante un secreto gestionado fuera del repositorio. No se debe usar la contraseña local ni la credencial de migración en producción.

Los diez puestos y los tipos de taco son fixtures ficticios con IDs estables; `pnpm db:reset` los vuelve a sembrar de forma reproducible.
