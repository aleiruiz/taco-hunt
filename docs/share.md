# Shared links

The API publishes a small HTML preview for each approved stand at `GET /s/:spotId`. The page works without the app installed and includes the name, neighborhood, and approved taco types, plus Open Graph metadata and a `tacohunt://spot/:spotId` link to open the app.

Set `PUBLIC_BASE_URL` to the stable HTTPS origin before deploying, e.g. `https://tacohunt.example`. The value is only used for `og:url`; it is never derived from the `Host` header. In development, `https://taco-hunt.example` is used as a placeholder and the page still works on the local host.

The query only selects stands with `approved` status and approved taco types. User coordinates, email, private notes, hidden reviews, pending proposals, and private photos are never included. iOS Universal Links and Android App Links remain pending until a stable domain is available.
