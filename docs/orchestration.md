# Orquestación de Taco Hunt

El orquestador vive en la tarea principal de Codex. `docs/plan-delegacion.md` fija prioridades y dependencias; `docs/orchestration-state.json` registra las asignaciones y el estado de integración. Los trabajadores son tareas de Codex en worktrees separados del mismo repositorio. El límite es de **tres trabajadores simultáneos**; el orquestador coordina desde esta tarea y no consume uno de esos tres puestos.

## Ciclo de un puesto

1. Elegir la tarea libre de mayor prioridad cuyas dependencias estén integradas en `main`. Preferir tareas con áreas distintas y contratos estables.
2. Crear una tarea de Codex en worktree desde `main` actualizado, con ID, alcance, archivos propios, criterios de aceptación y formato de check-in. Registrar su `threadId` y rama.
3. Consultar el progreso al menos cada 30 minutos mientras la tarea esté activa. Ante silencio prolongado, pedir estado una vez y registrar el bloqueo si persiste; no crear una segunda tarea para el mismo ID.
4. Cuando el autor entregue PR, cambiar su puesto a revisión. Asignar el PR a otro de los tres trabajadores que esté libre o que haya terminado su implementación. Nunca pedir una revisión al autor.
5. El revisor comprueba el diff contra la especificación, contratos, seguridad, migraciones y compatibilidad con las otras ramas. Registra hallazgos accionables; el autor corrige en su rama. El orquestador comprueba CI y que los hallazgos estén resueltos.
6. Integrar el PR solo después de la revisión y las comprobaciones. Actualizar `main`, el estado JSON y las dependencias. Reponer el puesto con la siguiente tarea libre. Si un merge modifica un contrato común, avisar a los trabajadores afectados antes de que sigan.

La revisión tiene prioridad sobre arrancar una implementación nueva cuando hay un PR listo. Si los tres puestos están ocupados, el siguiente trabajador que termina su implementación se convierte en revisor; su propia entrega espera revisión de otro trabajador o del orquestador si no hay ningún trabajador independiente disponible. No abrir más de tres tareas de trabajo activas para forzar una revisión.

## Estados y check-ins

Estados de tarea: `blocked`, `ready`, `active`, `review`, `changes_requested`, `merged`, `external_blocked`. Solo `merged` desbloquea dependientes. Un agente comunica: `ID · estado · qué cambió · siguiente paso · bloqueo/decisión · PR (si existe)`. El orquestador contrasta el mensaje con Git, PR y CI; un check-in no cierra la tarea.

La coordinación programada revisa mensajes y PR cada 30 minutos. Si nada cambió y no hay una acción posible, permanece en silencio. Notifica al usuario cuando haga falta una decisión, exista un bloqueo externo, se integre un conjunto relevante o termine una fase.

## Puertas de integración

- Rama originada en la base integrada más reciente, o sincronizada antes de merge si la base avanzó.
- Alcance limitado a un ID; cambios a archivos compartidos coordinados.
- Revisión independiente terminada, hallazgos importantes corregidos y comprobaciones de CI satisfactorias. Si CI aún no existe, revisión del diff y comprobaciones acordadas en el PR.
- Sin secretos ni datos privados publicados. Las migraciones conservan un camino reproducible.
- El orquestador integra por orden de dependencias y actualiza el tablero después de cada merge.

No se integra T14 hasta que T01–T13 estén integradas. T15 espera a T14; T16 espera a T15 y a E03/E04. E01/E02 se requieren para los pases físicos de T15.

## Contrato de arranque para la primera ola

La API actual es Fastify directo y será adaptada en T02. Hasta que T02 integre los contratos, el móvil consume estas formas existentes mediante un adaptador propio:

- `GET /healthz` → `{status:"ok"}` o 503 `{status:"unavailable"}`.
- `GET /v1/taco-types` → `{items:[{id,slug,nameEs}]}`.
- `GET /v1/spots` admite `north,south,east,west,q,tacoType,limit,cursor` y devuelve `{items, nextCursor}`. Cada item tiene `id,name,neighborhood,latitude,longitude,lastVerifiedAt,reviewCount,bestTaco`.
- `GET /v1/spots/:id` devuelve `id,name,neighborhood,latitude,longitude,lastVerifiedAt,tacos`.
- Errores HTTP conocidos: `{error:{code,message}}`, con `VALIDATION_ERROR`, `NOT_FOUND` y `SERVICE_UNAVAILABLE`.

T02 publica el contrato compartido y comunica cualquier cambio a T03. T05 corrige la paginación y filtros sin exigir que T03 se detenga mientras usa el adaptador.
