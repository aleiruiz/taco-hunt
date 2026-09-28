# Privacidad de contribuciones y moderación

Taco Hunt usa el API como única vía de acceso a datos del producto. La aplicación móvil no recibe credenciales de base de datos ni consulta directamente las tablas privadas.

Los reportes son privados. El autor de un reporte puede recibir únicamente el identificador, destino, motivo, estado y fecha de su propia solicitud; no se publican su correo, nombre, nota interna ni identidad del moderador. La cola administrativa tampoco expone el identificador del reportante a clientes normales. Los reportes no ocultan contenido automáticamente y se aplican límites de escritura por usuario y dirección de red.

Las propuestas pendientes son visibles para su autor y para administradores. Las sugerencias de duplicado solo consultan puestos aprobados dentro de 100 metros y devuelven nombre, colonia, coordenadas públicas, distancia y una clasificación de coincidencia. Nunca se incluyen propuestas pendientes, notas privadas o datos del usuario que propuso el puesto.

No se guarda historial de ubicación del usuario. Las coordenadas de un puesto son datos del puesto y no deben confundirse con una ubicación personal. Los textos de reseñas no se envían a telemetría; la analítica debe conservar únicamente conteos agregados.
