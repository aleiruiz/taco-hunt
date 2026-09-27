# Taco Hunt

Monorepo para descubrir puestos de tacos y calificar un tipo de taco en un puesto específico de Monterrey.

La especificación funcional completa está en [docs/build-spec.md](docs/build-spec.md). La landing está en [apps/landing/index.html](apps/landing/index.html) y usa [apps/landing/taco-hunt-logo.svg](apps/landing/taco-hunt-logo.svg).

## Conexiones preparadas

- **GitHub:** repositorio público `aleiruiz/taco-hunt`, rama `main`.
- **Supabase local:** CLI fijada como dependencia de desarrollo y configuración versionada en `supabase/`. La base, Auth y Storage locales corren en Docker.
- **Supabase remoto y Google Cloud:** no se enlazaron todavía; requieren seleccionar/crear proyectos y autenticar las cuentas. No se creó infraestructura cloud ni se activó facturación.
- **Expo y mapas:** se conectarán al construir `apps/mobile`; Android Maps requiere una clave restringida. La app no usará Places ni APIs de geocodificación/rutas.

## Requisitos locales

- Node.js 20.19.4 o superior (requisito de Expo SDK 57)
- pnpm (versión fijada en `package.json`)
- Docker Desktop iniciado

## Preparar el entorno

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:start
pnpm db:status
```

`db:status` muestra la URL local de Auth y las claves para desarrollo. Copia únicamente la clave publicable a las variables `SUPABASE_PUBLISHABLE_KEY` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env`. Las claves/contraseñas privilegiadas son solo para el servidor y nunca se deben anteponer con `EXPO_PUBLIC_` ni publicar.

`pnpm db:reset` aplica las migraciones desde cero y carga puestos ficticios de desarrollo. Para detener los servicios locales usa `pnpm db:stop`.

## Ejecutar la demo

En tres terminales desde la raíz:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55422/postgres"
pnpm dev:api
```

```powershell
pnpm dev:landing
```

```powershell
$env:EXPO_PUBLIC_API_URL = "http://localhost:3001/v1"
pnpm dev:mobile
```

La landing local queda en `http://localhost:4173`; API: `http://localhost:3001/healthz`. Para emulador Android usa `http://10.0.2.2:3001/v1` como `EXPO_PUBLIC_API_URL`; en un teléfono físico, usa la IP LAN de esta computadora. En Expo Go, presiona `w` para previsualizar en el navegador.

## API desde móvil

- Simulador iOS: normalmente puede acceder al API local con `localhost`.
- Emulador Android: usa `10.0.2.2` como host de la computadora.
- Teléfono físico: usa la IP LAN de la computadora, con ambos dispositivos en la misma red. Define ese valor solo en el `.env` local; no lo escribas en el código ni lo subas a Git.

La IP depende de cada red. La API debe escuchar en `0.0.0.0`; el firewall local puede pedir permiso para conexiones privadas.

## Primer inicio

- Si `pnpm db:start` no conecta, inicia Docker Desktop y confirma que el motor esté listo.
- La configuración usa puertos 55420–55429 para evitar rangos reservados por Windows; si cambias alguno, ajusta las URLs del `.env` local.
- Para un Android sin mapa, configura `EXPO_PUBLIC_ANDROID_MAPS_API_KEY` con una clave de Google Maps SDK para Android restringida por nombre de paquete y certificado de firma. Maps puede requerir facturación de Google Cloud; no actives Places.
- Si el teléfono no llega al API, verifica que la API escuche en `0.0.0.0`, la URL LAN del `.env`, la red Wi-Fi y las reglas del firewall.
- Los mensajes de Auth del stack local se capturan en el servidor de correo de prueba; no se envían a direcciones reales.

## Más información

Consulta `docs/build-spec.md` para la arquitectura, modelo de datos, API, seguridad, importación con procedencia y receta de despliegue.
