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
pnpm exec supabase db query --local --output table --query "select count(*) as fixture_spots from app_private.spots where source_type = 'fictional';"
pnpm exec supabase db query --local --output table --query "select count(*) as fixture_tacos from app_private.spot_tacos st join app_private.spots s on s.id = st.spot_id where s.source_type = 'fictional';"
pnpm exec supabase db query --local --output table --query "select has_schema_privilege('anon', 'app_private', 'USAGE') as anon_schema, has_table_privilege('taco_hunt_api', 'app_private.import_candidates', 'SELECT') as api_import_read, has_table_privilege('taco_hunt_api', 'app_private.spots', 'SELECT') as api_spot_read;"
```

El resultado esperado es 10 puestos y 20 relaciones de taco; `anon_schema` y `api_import_read` deben ser `false`, mientras `api_spot_read` debe ser `true`. Repite `pnpm db:reset` y las consultas para comprobar que las cantidades e IDs sembrados se mantienen. `provision` debe correrse después del reset para restaurar la clave local.

En el entorno de autoría, la comprobación E2E no pudo ejecutarse: `docker info --format '{{.ServerVersion}}'` devolvió `permission denied while trying to connect to the docker API at npipe:////./pipe/docker_engine`; `pnpm exec supabase --version` intentó descargar los paquetes npm y el registro respondió `EACCES`; `psql` y una instalación global de Supabase CLI tampoco estaban presentes. La alternativa verificable es ejecutar los comandos de arriba en una máquina con Docker Desktop y el lockfile instalado, y adjuntar su salida al PR. No se afirma que la comprobación haya pasado.

Para rotar la clave sin reiniciar la base (equivale a provisionar una nueva):

```powershell
.\supabase\dev-role.ps1 rotate
```

El script usa `pnpm exec supabase db query --local --file` con un archivo SQL temporal que elimina al terminar. Si el comando falla, no actualiza `.env`; vuelve a intentarlo cuando el stack local esté activo. La conexión esperada queda como `postgresql://taco_hunt_api:<secreto-local>@127.0.0.1:55422/postgres`.

## Contrato para el API

- `DATABASE_URL` debe apuntar a `taco_hunt_api` en el puerto local `55422`, no al usuario propietario `postgres`.
- `taco_hunt_api` recibe `USAGE` en `app_private` y permisos CRUD solo en sus tablas/secuencias. `anon`, `authenticated` y `service_role` no reciben acceso a ese esquema.
- Supabase Data API expone únicamente `public` y `graphql_public`; las tablas de producto están en `app_private`.
- El despliegue debe crear/provisionar un usuario runtime dedicado mediante un secreto gestionado fuera del repositorio. No se debe usar la contraseña local ni la credencial de migración en producción.

Los diez puestos y los tipos de taco son fixtures ficticios con IDs estables; `pnpm db:reset` los vuelve a sembrar de forma reproducible.
