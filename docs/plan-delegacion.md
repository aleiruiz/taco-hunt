# Plan de delegación de Taco Hunt

Este tablero sigue la especificación de docs/build-spec.md y el estado actual del repositorio. La landing, el esquema inicial, las lecturas básicas del API y las pantallas móviles de lista y detalle ya existen. El túnel ngrok es una vista temporal de la landing, no un despliegue de producción.

## Regla de bloqueo

- Una tarea queda **libre** cuando todas sus dependencias están cerradas y su contrato de entrada está acordado.
- Los agentes trabajan en ramas o worktrees separados. Cada uno modifica su área; la coordinación integra package.json compartidos, pnpm-lock.yaml, rutas raíz y migraciones que afectan a varios módulos.
- T00 fija una base versionada y el contrato actual de lectura. Después pueden trabajar tres agentes en paralelo: T01, T02 y T03. La coordinación puede avanzar T04.
- **Cierre final:** T14 y T15 permanecen bloqueadas hasta que T01–T13 estén cerradas. T16 requiere además las entradas externas de lanzamiento. Que una tarea esté libre significa que puede comenzar; para abrir el cierre final debe estar terminada.

## P0: quitar los bloqueos que impiden delegar

| ID | Tarea y resultado esperado | Bloqueada por | Área principal | Estado |
| --- | --- | --- | --- | --- |
| T00 | Revisar y versionar la base actual; fijar las formas de respuesta y errores del API; asignar propietarios de archivos y preparar ramas de trabajo. | Ninguna | Coordinación, raíz del repositorio | Cerrada |
| T01 | Consolidar Supabase local: migraciones, permisos del rol de API, restricciones y diez puestos ficticios reproducibles. | T00 | supabase/ | Libre |
| T02 | Adaptar el API a NestJS con Fastify, crear paquetes de contratos y OpenAPI, y fijar validación y errores comunes. La especificación exige esa arquitectura; el API actual usa Fastify directo. | T00 | apps/api/ y packages/contracts/ | Libre |

## P1: primera tanda paralela de producto

| ID | Tarea y resultado esperado | Bloqueada por | Área principal | Estado |
| --- | --- | --- | --- | --- |
| T03 | Completar exploración móvil: búsqueda, filtro por taco, mapa/lista, ubicación solo al pedirla, selección manual de zona, detalle y estados sin conexión. Puede usar adaptadores de datos mientras T05 termina. | T00 | apps/mobile/app/ y src/features/discovery/ | Libre |
| T04 | Añadir comandos de lint y tipos, CI reproducible, y documentar el primer arranque. La coordinación integra los cambios compartidos; la creación o ejecución de pruebas queda pendiente de petición expresa. | T00 | .github/, raíz y docs/ | Libre |
| T05 | Completar lecturas públicas: paginación estable, límites de zona, filtros, reseñas visibles y datos de fiabilidad; solo devolver puestos aprobados. | T01 y T02 | apps/api/src/spots/ y reviews/lecturas | Bloqueada |
| T06 | Implementar identidad del servidor: JWT verificado, perfiles, rol de administrador, bloqueos, límites de solicitudes y separación de claves. | T01 y T02 | apps/api/src/auth/ y profiles/ | Bloqueada |
| T07 | Implementar registro, acceso, recuperación, sesión y ajustes en móvil con Supabase Auth. | T03 y T06 | apps/mobile/src/auth/ y rutas de acceso | Bloqueada |

T05 y T06 pueden correr en paralelo una vez cerradas T01 y T02; sus módulos y rutas tienen propietarios distintos. T07 comienza al cerrar T06, para integrar la sesión móvil contra la verificación del servidor.

## P2: contribuciones y funciones complementarias

| ID | Tarea y resultado esperado | Bloqueada por | Área principal | Estado |
| --- | --- | --- | --- | --- |
| T08 | API de reseñas y favoritos: puntuaciones, edición/borrado propio, unicidad, historial y operaciones idempotentes. | T05 y T06 | apps/api/src/reviews/ y favorites/ | Bloqueada |
| T09 | Propuestas, reportes y moderación: duplicados cercanos, cola privada, acciones de administrador y auditoría. | T05 y T06 | apps/api/src/proposals/, reports/ y admin/ | Bloqueada |
| T10 | Pantallas móviles para calificar, guardar, proponer, reportar y consultar Mis tacos. Usar los contratos fijados y datos simulados hasta integrar T08 y T09. | T02, T03 y T07 | apps/mobile/src/features/contributions/ y rutas nuevas | Bloqueada |
| T11 | Foto por reseña: validación, eliminación de metadatos, compresión, almacenamiento privado, asociación única y limpieza de cargas huérfanas. | T06 y T08 | apps/api/src/media/ y Storage | Bloqueada |
| T12 | Página HTTPS para compartir un puesto, enlaces hacia la app y documentos de privacidad y moderación. Mantener la landing actual y preparar metadatos finales para un dominio estable. | T03 y T05 | apps/api/src/share/ y docs/ | Bloqueada |
| T13 | Importación CSV a candidatos privados, detección de duplicados, revisión y documentación de procedencia; ninguna publicación automática. | T01 y T09 | db/scripts/ o supabase/scripts/ | Bloqueada |

T08, T09 y T10 pueden avanzar en paralelo con contratos congelados. T11, T12 y T13 forman otra tanda paralela cuando se liberen sus dependencias.

## P3: cierre deliberadamente bloqueado hasta el final

| ID | Tarea y resultado esperado | Bloqueada por | Estado |
| --- | --- | --- | --- |
| T14 | Cerrar el ciclo de la cuenta: borrado seguro y reintentable, limpieza de fotos y datos privados, telemetría agregada y documentación final de privacidad. | **Todas T01–T13 cerradas** | Bloqueada final |
| T15 | Integración y aceptación completas: migraciones limpias y existentes, flujos de dos usuarios y administrador, privacidad de fotos, accesibilidad, dispositivos, CI, contenedor y guía reproducible. | **Todas T01–T14 cerradas** y E01/E02 para las pruebas físicas correspondientes | Bloqueada final |
| T16 | Despliegue y publicación reales, con dominio y datos autorizados. | **T15 cerrada** y E03/E04; requiere autorización del propietario para activar recursos o gastar | Bloqueada final |

## Entradas externas: no bloquean el código independiente

| ID | Entrada | Bloquea |
| --- | --- | --- |
| E01 | Iniciar sesión en Expo CLI y Expo Go del iPhone con la misma cuenta. | Pase físico iOS de T15 |
| E02 | Clave restringida de Google Maps SDK para Android y dispositivo de prueba. | Pase de mapa Android de T15 |
| E03 | Cuentas y configuración de Supabase remoto, Google Cloud, secretos, dominio y aprobación de costos. | T16 |
| E04 | Nombre público validado, puestos y fotos con derechos confirmados, cuentas de las tiendas. | T16 |

## Orden de liberación

1. Coordinación cierra T00.
2. Primera ola: agentes en T01, T02 y T03; coordinación en T04.
3. Segunda ola: T05 y T06; después T07. Se liberan T08–T10 según sus dependencias.
4. T11–T13 avanzan en paralelo cuando sus módulos de entrada estén cerrados.
5. Se abre T14 solo con T01–T13 cerradas, luego T15 y finalmente T16.
