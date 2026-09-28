# Enlaces compartidos

El API publica una vista HTML pequeña para cada puesto aprobado en `GET /s/:spotId`. La página funciona sin la aplicación instalada e incluye el nombre, colonia y tipos de taco aprobados, además de metadatos Open Graph y un enlace `tacohunt://spot/:spotId` para abrir la aplicación.

Configura `PUBLIC_BASE_URL` con el origen HTTPS estable antes de desplegar, por ejemplo `https://tacohunt.example`. El valor solo se usa para `og:url`; no se deriva de la cabecera `Host`. En desarrollo se usa `https://taco-hunt.example` como marcador y la página sigue funcionando en el host local.

La consulta solo selecciona puestos con estado `approved` y tipos de taco aprobados. No se incluyen coordenadas del usuario, correo, notas privadas, reseñas ocultas, propuestas pendientes ni fotos privadas. Los enlaces universales de iOS y App Links de Android quedan pendientes hasta disponer de un dominio estable.
