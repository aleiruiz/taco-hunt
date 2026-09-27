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
