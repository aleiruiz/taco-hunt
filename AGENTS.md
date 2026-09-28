# Taco Hunt: trabajo con agentes

Lee `docs/build-spec.md`, `docs/plan-delegacion.md` y `docs/orchestration.md` antes de modificar el proyecto.

## Agentes de implementación

- Trabaja solo en el ID de tarea asignado y en tu propio worktree/rama `codex/<id>-<descripcion>`.
- Respeta el área principal de la tarea. Antes de tocar un archivo compartido (`package.json` raíz, `pnpm-lock.yaml`, configuración raíz, contratos compartidos o migraciones de otra tarea), comunica el cambio al orquestador y espera su decisión.
- No modifiques `main` ni incorpores cambios de otra rama por tu cuenta. Si dependes de otra tarea, explica el bloqueo al orquestador.
- Envía un check-in al comenzar, al encontrar un bloqueo, al tener una decisión de contrato y al quedar listo para revisión. Indica estado, avance concreto, siguiente paso y bloqueo.
- Al terminar, entrega un resumen de cambios, archivos afectados, comprobaciones realizadas y riesgos. Si GitHub está disponible, abre un PR pequeño hacia `main` con el ID de tarea. No mezcles tareas distintas en el mismo PR.
- No incluyas claves, contraseñas, tokens ni datos reales de usuarios o locales en el repositorio, logs o PR.
- Mantén el código legible: ejecuta `pnpm lint` y `pnpm typecheck` antes de entregar cambios, y aplica `pnpm format` a los archivos que modifiques. Si el entorno impide ejecutar alguno, informa el comando y el error concreto en el check-in/PR.
- No añadas ni ejecutes pruebas salvo solicitud expresa del usuario. Si una tarea incluye pruebas como trabajo futuro, indícalo en la entrega sin ejecutarlas.

## Revisión asistida por IA

- CodeRabbit es el revisor de código independiente para todos los pull requests. Configura la GitHub App de CodeRabbit para este repositorio y conserva la configuración en `.coderabbit.yaml`.
- El autor no necesita una revisión por pares de otro agente. No asignes a un trabajador la revisión del código de otro PR.
- Antes de integrar, confirma que la revisión completada de CodeRabbit cubre el SHA exacto del head actual del PR. Una revisión anterior al push más reciente no cuenta. Después, evalúa cada hallazgo y confirma que los hallazgos importantes se resolvieron o que el autor documentó por qué no aplican; comprueba también CI.
- Si CodeRabbit no está instalado o no revisó el SHA actual del PR, no trates el PR como revisado: instala/rehabilita la app o solicita una nueva revisión y reporta el bloqueo al usuario si hace falta.
- CodeRabbit aporta análisis y comentarios; no concede aprobación automática ni autorización para integrar. La integración sigue las puertas de este documento y la decisión del propietario.

## Orquestador

- Mantén como máximo tres agentes trabajadores activos. Consulta `docs/orchestration-state.json` y el estado real de las tareas/PR antes de asignar trabajo.
- Aplica las dependencias del plan. T14 espera a T01–T13; T15 espera a T14; T16 espera a T15 y a los requisitos externos.
- No marques una tarea como terminada por el resumen del agente: exige PR integrado en `main`, o un cambio local integrado cuando GitHub no esté disponible. La finalización de revisión requiere una revisión de CodeRabbit del SHA actual del PR y que el orquestador haya verificado los hallazgos y CI; no requiere un revisor par.
- Tras cada integración, actualiza el estado y asigna la siguiente tarea libre por prioridad. No reserves un puesto de trabajo para revisar PRs; úsalo para la siguiente tarea elegible.
