# Moderación, reportes y duplicados

La API privada de moderación está disponible en `/v1/admin` y está protegida por el rol de perfil verificado. Un usuario no administrador recibe `403`; las colas y auditorías nunca son públicas.

Las colas están disponibles con `GET /v1/admin/queue?kind=spots|tacos|reports|photos|duplicates`. Cada mutación se ejecuta en una transacción y agrega una fila inmutable a `app_private.moderation_audit`. El historial está disponible para administradores en `GET /v1/admin/audit`.

Las acciones incluyen aprobar o rechazar propuestas, solicitar cambios, cerrar reportes, ocultar o mostrar reseñas, eliminar la referencia de una foto y fusionar un duplicado pendiente con un puesto canónico aprobado. Una fusión solo rechaza el duplicado pendiente; no sobrescribe el puesto canónico ni mueve contenido de usuarios silenciosamente.

El panel móvil de moderación está disponible desde ajustes de una cuenta autenticada. El API sigue siendo la frontera de autorización, por lo que un usuario normal no puede revelar datos de la cola.

Los reportes aceptan solo los motivos `inaccurate`, `abusive`, `spam`, `closed` y `other`, con una nota opcional de hasta 500 caracteres. Cada usuario puede mantener un solo reporte abierto por contenido. Crear un reporte valida que el destino exista, pero no revela información privada del destino ni cambia su visibilidad.

La cola administrativa se consulta con `/v1/admin/queue?kind=reports`. Las acciones de moderación requieren un perfil con rol `admin`, quedan registradas en `moderation_audit` y no deben copiar la nota del reportante a una respuesta pública.

La comprobación de duplicados usa nombre normalizado (minúsculas, sin acentos y espacios compactados) y distancia Haversine. `/v1/admin/duplicate-candidates` permite a un moderador revisar un nombre y pin antes de aprobar una propuesta. Las propuestas también ejecutan esta comprobación al crearse: una coincidencia de nombre dentro de 100 metros produce `409`; candidatos cercanos no bloquean la propuesta, pero se devuelven para revisión. No se publica ni fusiona automáticamente ningún registro.
