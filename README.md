# Taco Hunt

Monorepo para descubrir puestos de tacos y calificar un tipo de taco en un puesto específico de Monterrey.

La especificación funcional completa está en [BUILD_SPEC.md](BUILD_SPEC.md). La landing inicial está en [index.html](index.html) y usa [taco-hunt-logo.svg](taco-hunt-logo.svg).

## Conexiones preparadas

- **GitHub:** repositorio público `aleiruiz/taco-hunt`, rama `main`.
- **Supabase local:** CLI fijada como dependencia de desarrollo y configuración versionada en `supabase/`. La base, Auth y Storage locales corren en Docker.
- **Supabase remoto y Google Cloud:** no se enlazaron todavía; requieren seleccionar/crear proyectos y autenticar las cuentas. No se creó infraestructura cloud ni se activó facturación.
- **Expo y mapas:** se conectarán al construir `apps/mobile`; Android Maps requiere una clave restringida. La app no usará Places ni APIs de geocodificación/rutas.

## Requisitos locales

- Node.js 20+
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

Al añadir migraciones, `pnpm db:reset` las aplica desde cero y carga los datos ficticios de desarrollo. Para detener los servicios locales usa `pnpm db:stop`.

## API desde móvil

- Simulador iOS: normalmente puede acceder al API local con `localhost`.
- Emulador Android: usa `10.0.2.2` como host de la computadora.
- Teléfono físico: usa la IP LAN de la computadora, con ambos dispositivos en la misma red. Define ese valor solo en el `.env` local; no lo escribas en el código ni lo subas a Git.

La IP depende de cada red. La API debe escuchar en `0.0.0.0`; el firewall local puede pedir permiso para conexiones privadas.

## Primer inicio

- Si `pnpm db:start` no conecta, inicia Docker Desktop y confirma que el motor esté listo.
- Si un puerto local está ocupado, revisa `supabase/config.toml` antes de cambiar el puerto y las URLs de entorno juntas.
- Para un Android sin mapa, configura `EXPO_PUBLIC_ANDROID_MAPS_API_KEY` con una clave de Google Maps SDK para Android restringida por nombre de paquete y certificado de firma. Maps puede requerir facturación de Google Cloud; no actives Places.
- Si el teléfono no llega al API, verifica que la API escuche en `0.0.0.0`, la URL LAN del `.env`, la red Wi-Fi y las reglas del firewall.
- Los mensajes de Auth del stack local se capturan en el servidor de correo de prueba; no se envían a direcciones reales.

## Más información

Consulta `BUILD_SPEC.md` para la arquitectura, modelo de datos, API, seguridad, importación con procedencia y receta de despliegue.

