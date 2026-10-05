# Street Taco Discovery App Build Specification

Version 1.2 — 2 October 2026
Owner: Alei Ruiz  
Initial market: Monterrey metropolitan area, Mexico  
Audience: implementation agent building an open source portfolio project

## 1. Mission and definition of done

Build a Spanish-first React Native application for finding street taco stands and rating **a taco type at a specific stand**. The app should look and behave like a credible consumer product and expose a substantive, separately deployed backend. The initial release is a portfolio flagship and a community experiment for a few hundred users. Advertising is an option after usage is demonstrated; no ads in version 1.

The delivery is complete when another developer can clone the repository, run the database and API locally, launch the mobile app, browse test locations without signing in, sign in to post a review, exercise the moderation flow, and open a local static landing page. The repository must include documented environment variables, migrations, a development-only fixture set, an OpenAPI contract, tests, and a deployment recipe. Production accounts, store publication, real taquería data, trademark clearance, and paid cloud resources are not prerequisites for completing the code.

**Working product name:** Taco Hunt. This name and the visual assets below are provisional pending a trademark and app-store naming check before public release. Use this name throughout the prototype; do not block implementation on final clearance.

## 2. Binding implementation decisions

| Concern                | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile                 | Expo-managed React Native, TypeScript, Expo Router; support Android and iOS.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| API                    | Separate Node.js TypeScript service, NestJS with Fastify adapter, REST JSON under `/v1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Database               | PostgreSQL hosted by Supabase in deployment; run the Supabase CLI local stack in Docker for Postgres, Auth and Storage development. Use migrations tracked in git.                                                                                                                                                                                                                                                                                                                                                                        |
| Authentication         | Supabase Auth email/password for v1. Mobile talks to Supabase only for registration, sign-in, reset and token refresh; all product data goes through the API.                                                                                                                                                                                                                                                                                                                                                                             |
| Images                 | Supabase Storage for deployed media; API receives, validates, strips metadata, resizes, and stores one image per review. Local filesystem or a mock storage adapter in development.                                                                                                                                                                                                                                                                                                                                                       |
| Hosting                | Containerized API on Google Cloud Run with request-based billing and minimum instances zero; Supabase free tier for DB/Auth/Storage while viable.                                                                                                                                                                                                                                                                                                                                                                                         |
| Mapping                | `react-native-maps` with Apple Maps on iOS and Google Maps SDK on Android; the mobile app must not invoke Google Places, geocoding, route, tile, or web map APIs directly. The API may call Google Places server-side, with a restricted key, for explicit viewport searches for `tacos`, autocomplete, on-demand place details/photos, review-target creation, and periodic re-verification of Google-linked spots. Google display payloads remain transient, include required attribution, and are never copied into Taco Hunt records. |
| Location               | Foreground only, on explicit user action; no stored location history or background permission.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Data rights            | Original, permissioned, or properly licensed Taco Hunt location data and photos only. A Google Places photo may be proxied transiently as a fallback for a linked place, with attribution, but is never persisted, imported, or presented as a Taco Hunt-owned photo. No imported reviews or ratings from Google Maps or other apps.                                                                                                                                                                                                      |
| Main architecture goal | Readable, tested product logic across mobile, API, persistence, moderation, and deployment. Avoid artificial microservices.                                                                                                                                                                                                                                                                                                                                                                                                               |

Do not replace the API with direct Supabase table access or Edge Functions. Keep server-only database and Storage credentials off the mobile app. The app may include Supabase's publishable client key exclusively for Auth.

## 3. User journeys

### 3.1 Browse without an account

Launch into a map of approved stands in Monterrey, with a toggle to a list. The app initially uses a preset city center; show a clear **Use my location** action. When permission is denied, list/map/search continue to work with manual area selection. Users can search by name and neighborhood, filter by taco type, toggle map/list, open a stand detail, save a favorite only after sign-in, and open directions in an installed map application.

Each stand detail displays its name, neighborhood, map pin, optional photo, last verified date, taco types known to be sold, rating count, and taco-specific rating summaries. For the map card, use the first approved Taco Hunt photo; if none exists and the stand has a linked Google place, use the first Google Places photo transiently; otherwise use the Taco Hunt fallback artwork. Unknown hours say **Horario no confirmado**; unknown prices say **Precio no confirmado**. Do not invent opening status, menu, or photos.

### 3.2 Rate a taco

The user chooses a stand and an existing taco type offered there. If a map result from Google Places is not yet in Taco Hunt, **Calificar tacos** asks the signed-in user to choose a taco type and creates or recovers the Taco Hunt stand and taco target automatically as part of starting the review; it is not a proposal and does not send the user to Google Maps. If there are no verified taco types on an existing Taco Hunt stand, the user may propose one; that proposal is pending moderation. Posting requires sign-in. Rate tortilla, filling, salsa, and value with an integer 1–5 each. Optional fields: price paid in MXN, up to 500 characters of text, and one photo. A user can edit or delete their own review. Only one active review per `(user, stand, taco type)` is allowed. An automatic retry must not create another review.

### 3.3 Favorites and passport

Favorite a stand from list or detail. Show saved stands and a **Mis tacos** list derived from the user's own reviews. A review counts as a visit; do not claim GPS verification. A review's public display name is optional; email and location are never public.

### 3.4 Propose a stand and report content

Authenticated users propose a stand pin-first: either pick a Google place (sent as its place ID) or drop a pin on the map with an optional name and note. Pending stands are private to the submitter and moderators. If the chosen Google place is already linked to a Taco Hunt stand, the API returns a conflict with a redirect, and the app sends the user to the existing stand instead of creating a duplicate. Users can report a stand or review for a bounded set of reasons. Reports enter a private queue; one report does not automatically hide content. An administrator can approve/reject proposals and hide/unhide reviews.

### 3.5 Share

Share a normal HTTPS URL for a stand. The API serves a small HTML preview with the stand name, limited public information, Open Graph metadata, and a button to open the app with a custom URL scheme. The HTTPS page still works without the app. Universal Links and Android App Links are deferred until a stable custom domain is available. Never put email, user coordinates, private status, or unapproved content in a share page.

## 4. Scope boundaries

Version 1 includes browsing, list/map, name and neighborhood search, taco-specific ratings, favorites, personal history, one review photo, user proposals, admin review, reporting, sharing, and basic privacy-safe telemetry. It excludes ads, payment, messaging, bulk or automatic venue import (a user's rating action may register a single Google-linked stand, see §3.2), GPS check-in verification, gamified leaderboards, AI-generated content, continuous tracking, push notifications, vendor accounts, and multi-city rollout.

Use a cohesive visual system with typography, colors, spacing, empty states, loading states, permission states and a few tasteful taco-specific details. Avoid a generic CRUD appearance, but do not let animations delay the core flow. Design for small phones, dynamic text size, screen readers, and Spanish labels.

## 5. Repository structure

```text
apps/
  api/
    src/
      auth/             # JWT verification and role guard
      account/          # profile, avatars, progress, account deletion
      admin/            # moderation queues and actions
      spots/            # public queries, map pins, search suggestions
      places/           # server-side Google Places: viewport, details, photo, autocomplete, review target
      proposals/        # place, spot and taco proposals
      reviews/          # ratings, aggregates, edit/delete
      favorites/
      reports/
      media/            # review photos, stand photos, signed media URLs
      share/            # /s/:id HTML preview
      health/
      database/
      common/           # errors, logging, validation, pagination
    scripts/            # admin bootstrap, media cleanup, Places refresh
    Dockerfile
  mobile/
    app/                # Expo Router screens
    src/components/     # shared UI components
    src/data/           # API data adapters
    src/features/
    src/auth/
    src/lib/
    src/theme.ts        # design tokens
    plugins/            # Expo config plugins
    eas.json            # EAS build profiles
  landing/              # static promotional page, no runtime backend
    index.html
    taco-hunt-logo.svg
packages/
  contracts/            # shared Zod schemas, DTOs, typed API errors, openapi.yaml
supabase/
  config.toml           # local Auth/DB/Storage configuration
  migrations/
  seed.sql              # clearly fictional development data only
  scripts/              # staging import tool (import-candidates.mjs)
patches/                # pnpm patches for native dependencies
docs/
  data-provenance.md
  google-places-controls.md
  moderation.md
  privacy.md
.env.example
README.md
```

Use a single package manager and lockfile across the workspace. Pin compatible versions when scaffolding. Run the local Supabase CLI stack so `auth.users`, Postgres, Auth and Storage behave together; do not start a second unrelated Postgres container. Mock external Google services, not the core local data flow. The API should start with `PORT` from the environment, bind to `0.0.0.0`, expose `/healthz`, and shut down gracefully. No undocumented manual database edits should be required.

The README must give runnable commands (adjust exact script names to the scaffold): `supabase start`, `supabase db reset`, `pnpm install`, `pnpm dev:api`, `pnpm dev:mobile`, `pnpm typecheck`, and `pnpm lint` (there is no `pnpm test` script yet; tests are added only when the owner asks). Document how a simulator and a physical phone reach the local API (localhost is different on each), and how to obtain the local Auth URL and publishable key from `supabase status`. Use environment-specific config instead of hard-coded LAN addresses. Include a first-run troubleshooting section for Docker, Android map keys and an unavailable local API.

## 6. Database schema

Use UUID primary keys, `timestamptz` in UTC, foreign keys, check constraints, and indexed query paths. Name columns consistently in snake case. A migration must create the following logical entities; the agent can adjust minor SQL syntax, but not their invariants.

| Table               | Essential columns and constraints                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`          | `id uuid` referencing Supabase Auth user; `display_name text null`; `role text` restricted to `user` or `admin`, default `user`; `status text` restricted to `active` or `blocked`; `avatar_preset` (one of the app's preset avatars); optional `avatar_photo_key` and `avatar_photo_status` pending/approved/rejected; timestamps. API cannot accept role/status changes from a normal user.                                                                       |
| `spots`             | `id uuid`; `name`; `normalized_name`; `neighborhood`; `latitude numeric`; `longitude numeric`; optional `hours_json`; `status` pending/changes_requested/approved/rejected; `created_by uuid null`; `source_type`; `source_ref null`; `google_place_id null`, unique when present (a Taco Hunt-owned link to a Google place; no Google display fields are copied); `last_verified_at null`; timestamps. Approved rows require non-empty name and valid coordinates. |
| `taco_types`        | `id uuid`; unique `slug`; `name_es`; `active boolean`. Seed common types while preserving regional distinctions, e.g. pastor and trompo as separate labels.                                                                                                                                                                                                                                                                                                         |
| `spot_tacos`        | `id uuid`; `spot_id`; `taco_type_id`; `display_name null`; `price_hint_mxn null`; `status` pending/approved/rejected; unique `(spot_id,taco_type_id)` in v1. Only approved rows are public.                                                                                                                                                                                                                                                                         |
| `reviews`           | `id uuid`; `user_id`; `spot_taco_id`; integer `tortilla`, `filling`, `salsa`, `value` each 1–5; `price_paid_mxn null`; `body varchar(500) null`; `photo_key null`; `status` visible/hidden; timestamps; unique `(user_id,spot_taco_id)`.                                                                                                                                                                                                                            |
| `spot_photos`       | `id uuid`; `spot_id`; `uploader_id`; `object_key`; `kind` tacos/puesto/menu; `status` pending/approved/rejected, pre-moderated; optional `rejection_reason`; `created_at`. Only approved photos are public.                                                                                                                                                                                                                                                         |
| `favorites`         | `(user_id,spot_id)` primary key; `created_at`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reports`           | `id uuid`; `reporter_id`; `target_type` spot/review; `target_id`; `reason` inaccurate/abusive/spam/closed/other; optional bounded note; status open/closed; timestamps. Resolve target existence in application code.                                                                                                                                                                                                                                               |
| `media_uploads`     | `id uuid`; `owner_id`; `object_key`; `state` pending/claimed/deleted; `created_at`; `claimed_review_id null`. One-use binding between processed uploads and a later review.                                                                                                                                                                                                                                                                                         |
| `moderation_audit`  | `id uuid`; `moderator_id`; `target_type`; `target_id`; `action`; `created_at`; optional internal reason. Only admin can read.                                                                                                                                                                                                                                                                                                                                       |
| `import_candidates` | `id uuid`; original row payload; normalized name; pin; source and license reference; matched spot IDs; state pending/approved/rejected; review notes; import batch ID. Never exposed as a public endpoint.                                                                                                                                                                                                                                                          |

Indexes: `spots(status, normalized_name)`, `spots(status, neighborhood)`, `spot_tacos(spot_id,status)`, `reviews(spot_taco_id,status,created_at DESC)`, `reviews(user_id)`, `reports(status,created_at)`. For a few hundred spots, bounding-box filtering using indexed coordinates and a Haversine calculation is acceptable. If PostGIS is available, use `geography(Point,4326)` and a GIST index; choose one implementation during phase 1 and document it. Validate latitude/longitude within Mexico, with a tighter Monterrey-area contribution boundary; store no user's GPS position.

Rating = average of the four component scores for a single visible review. Taco score = mean of those review ratings, rounded to one decimal for display. Include `review_count`. If zero reviews, return `score: null`, never zero. The stand page highlights its best reviewed taco but does not fabricate a global stand score. Sort default by distance, then explicitly disclose limited samples such as **Solo 1 reseña**. Aggregation must ignore hidden reviews and pending taco types.

Use one transaction for review create/update/delete and related database state. Photo deletion is an external side effect: delete the DB reference first, attempt media cleanup, and provide a documented retry/manual orphan cleanup path. Do not assume the database and object storage can participate in one transaction.

## 7. Authentication and authorization

The mobile app implements email/password registration, sign-in, password reset, sign-out and session refresh with Supabase Auth. Social login and magic-link deep linking are deferred. Public read routes accept no token. Authenticated calls send `Authorization: Bearer <access_token>` to the API. Use a supported signing configuration and verify access tokens against Supabase's public keys or documented verification method; validate signature, issuer, audience, expiry and subject. Do not decode a JWT without verification. The API maps `sub` to `profiles.id`; `user_id` is never accepted from a write request body. Reject blocked profiles. For new users, create a default profile idempotently on first authenticated request if the signup hook did not do so. Local development may use Supabase's local mail testing; public signups require a deliberate email delivery setup and testing rather than assuming the default SMTP capacity is sufficient.

**Chosen authorization boundary:** the deployed API is the sole data access path. Put app tables in a private schema inaccessible through Supabase's Data API, or revoke `anon` and `authenticated` table grants, and test that direct PostgREST calls from a mobile publishable key fail. Use a dedicated database runtime role with only the SQL grants required by the API. The API enforces row ownership and admin roles; SQL constraints enforce uniqueness and valid ranges. Keep database migration/owner credentials separate from runtime credentials. If a chosen Supabase configuration cannot support the dedicated role cleanly on Free, document a server-only fallback and prove in tests that no client can reach the privileged credentials. Do not claim RLS protects operations executed with a bypass-RLS service key. Choose either private-schema/API authorization or per-user RLS with verified user context; do not leave both half-configured.

Keep authentication logic separate from business logic. Bootstrap the first admin through a local/production operator command using an explicitly supplied user UUID after signup; there is no public admin registration or role update endpoint. Non-admin requests to admin routes return 403; unauthenticated writes return 401; other users' private resources return 404 or 403 consistently, without leaking their contents. Protect public routes against abusive request volume; apply stricter per-user limits to posting, proposals and reports. Rate limits can start in-process for a single instance, but document that they become approximate if max instances grows; database uniqueness remains authoritative. Never log tokens, passwordless links or private text.

## 8. HTTP API contract

Base URL `/v1`. JSON uses camelCase at the API boundary; storage uses snake_case. Version contracts in `packages/contracts`. Return ISO timestamps, UUID strings and prices in MXN. Validate and clamp all paging and bounds inputs.

### 8.1 Public reads

| Route                             | Query or response behavior                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/spots`                   | Query `north,south,east,west` optionally, `q`, `tacoType`, `cursor`, `limit` default 20 max 50. Return approved spots only. Limit bounding-box area to avoid full-table scraping; default Monterrey area. Return `{items:[SpotSummary],nextCursor:string                       | null}`. |
| `GET /v1/spots/map`               | Return compact approved pins and server-side clusters for the requested viewport. The mobile map merges results by stable ID as the camera moves; it does not unload pins already seen.                                                                                        |
| `GET /v1/spots/:id`               | Return approved stand, approved taco types, aggregate counts, limited visible reviews, source verification date. 404 for pending/rejected.                                                                                                                                     |
| `GET /v1/spots/:id/photos`        | Approved stand photos for the gallery, without uploader or moderation fields.                                                                                                                                                                                                  |
| `GET /v1/search/suggest`          | Suggest stands and neighborhoods already in Taco Hunt; no Google calls.                                                                                                                                                                                                        |
| `GET /v1/spots/:id/reviews`       | `tacoType`, `cursor`, `limit` max 30; return visible reviews only.                                                                                                                                                                                                             |
| `GET /v1/taco-types`              | Return active types and localized display names.                                                                                                                                                                                                                               |
| `GET /v1/places/viewport`         | Explicitly search the visible map rectangle for `tacos`. Return transient Google place IDs, names, coordinates, attribution, and the first photo resource name when available, plus Taco Hunt local records. The mobile app does not call this route on every camera movement. |
| `GET /v1/places/:placeId/details` | On-demand transient details for a Google place, including its first photo resource name when available. No Google display payload is persisted.                                                                                                                                |
| `GET /v1/places/photo?name=...`   | Proxy a validated Google photo resource with the API key kept server-side. The image is transient and must not be stored in Taco Hunt.                                                                                                                                         |
| `GET /v1/media/:reviewId`         | Short-lived signed URL for a visible review photo; 404 otherwise.                                                                                                                                                                                                              |
| `GET /s/:spotId`                  | Safe HTML preview for an approved stand; 404 otherwise. This path is outside `/v1`.                                                                                                                                                                                            |
| `GET /healthz`                    | 200 when the process can serve requests; do not expose secrets or user information.                                                                                                                                                                                            |

`SpotSummary` includes `id,name,neighborhood,latitude,longitude,photoUrl|null,bestTaco|null,reviewCount,lastVerifiedAt|null`. A taco summary includes `id,tacoTypeId,score|null,reviewCount`. Price and hours are optional; never infer an open state from missing hours.

### 8.2 Authenticated routes

| Route                                                            | Request and behavior                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/place-proposals`                                       | Pin-first proposal used by the app: `{source:"google",placeId}` or `{source:"local",latitude,longitude,name?,note?}`. A Google place already linked to a stand returns 409 `already_registered` with a redirect to `/spot/:id`; otherwise 201 with a pending ID.                                      |
| `POST /v1/spot-proposals`                                        | Earlier API-only form `{name,neighborhood,latitude,longitude,note?}`. Check duplicates within 100 m, return 409 with candidate IDs when strong match; otherwise return 201 with pending ID.                                                                                                           |
| `POST /v1/places/review-target`                                  | Authenticated `{placeId,tacoTypeId}`. Create or recover an approved Taco Hunt spot linked by `google_place_id` and its approved taco target, then return IDs for the normal Taco Hunt review form. This operation is idempotent and is used only when a user starts rating a Google-discovered place. |
| `GET /v1/places/autocomplete`, `GET /v1/places/:placeId/resolve` | Server-side Google autocomplete and place resolution for the proposal flow; rate-limited per user.                                                                                                                                                                                                    |
| `POST /v1/taco-proposals`                                        | `{spotId,tacoTypeId,displayName?}`; return pending record for moderator.                                                                                                                                                                                                                              |
| `POST /v1/reviews`                                               | `{spotTacoId,tortilla,filling,salsa,value,pricePaidMxn?,body?,photoUploadId?}`. Return 201 on create or 409 with existing review ID; never silently replace an earlier review. Unique DB constraint handles races.                                                                                    |
| `PATCH /v1/reviews/:id`                                          | Partial edits to author-owned scores/body/price/photo only. Reject `userId`, `status`, `role` and foreign identifiers.                                                                                                                                                                                |
| `DELETE /v1/reviews/:id`                                         | Author deletes; return 204. Deleting twice returns 204 without leaking previous content.                                                                                                                                                                                                              |
| `POST /v1/review-photos`                                         | Multipart image max 2 MB input; API decodes, strips EXIF, resizes to <=1200 px and targets <=300 KB, stores temporary private object; returns a one-use upload ID bound to current user. Clean unclaimed uploads.                                                                                     |
| `GET /v1/me/favorites`                                           | Paginated favorites. `PUT /v1/me/favorites/:spotId` is idempotent and returns 204; `DELETE` returns 204.                                                                                                                                                                                              |
| `GET /v1/me/reviews`                                             | Current user's review history, including own hidden reviews with status clearly marked.                                                                                                                                                                                                               |
| `GET /v1/me`, `PATCH /v1/me`                                     | Read and edit the caller's profile: display name, avatar preset, optional avatar photo (shown at once, then automatically reviewed).                                                                                                                                                                  |
| `GET /v1/me/progress`                                            | The caller's progress and badges for the Retos screen.                                                                                                                                                                                                                                                |
| `GET /v1/me/proposals`                                           | The caller's own proposals and their status.                                                                                                                                                                                                                                                          |
| `POST /v1/spots/:id/photos`                                      | Upload a stand photo; pending until a moderator approves it.                                                                                                                                                                                                                                          |
| `POST /v1/reports`                                               | `{targetType,targetId,reason,note?}`. One open report per user/target; return 201 or 409.                                                                                                                                                                                                             |
| `DELETE /v1/me`                                                  | Delete user's reviews, favorites, profile, and owned photos; anonymize retained moderation audit/report references; delete Auth account through a privileged server action. Return 204 when complete. Make retries safe after partial failure.                                                        |

Moderation routes under `/v1/admin`: `GET /queue?kind=spots|tacos|reports|photos|duplicates|spot-photos`, `GET /audit`, `GET /duplicate-candidates`, `GET /import-candidates`, `POST /import-candidates/:id/approve|reject|merge`, `POST /spot-proposals/:id/approve|reject|request-changes`, `POST /duplicates/:id/merge`, `POST /taco-proposals/:id/approve|reject`, `POST /reviews/:id/hide|unhide|hide-photo`, `POST /spot-photos/:id/approve|reject`, `POST /reports/:id/close`. All require server-verified admin role; record moderator ID and action timestamp in an audit table. A pending stand becomes a public spot on approval without losing its stable ID. Rejections preserve an internal reason.

Errors use `{error:{code:string,message:string,requestId:string,details?:object}}`. Define stable codes `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`. Return 400/401/403/404/409/429/503 accordingly. Do not return stack traces. Retry transient reads from mobile with backoff; do not automatically repeat writes except idempotent `PUT`/`DELETE`.

## 9. Photo and media rules

Use one private Storage bucket for user-submitted photos and a public or private bucket for owner-approved stand images; choose private throughout if simplifying permissions. The API accepts an image, checks decoded content rather than extension, rejects corrupt or oversized files, strips EXIF location and other metadata, resizes and compresses it, generates a random key, and links it only to the authenticated uploader's review. A temporary `media_uploads` record is owned by the user and can be claimed exactly once by a review in an API transaction. Provide a local CLI command to list and delete old unclaimed objects; do not rely on an unstated background worker. Public review responses can include short-lived signed read URLs for **visible** images; never return pending or hidden photo URLs. Signed URLs can remain valid until expiry after moderation, so keep TTL short (e.g. five minutes). A hidden review is removed from public API immediately; media object cleanup is documented.

Use placeholder artwork or owner-created photos for seeded stands. The map card prefers the first approved `spot_photos` image owned by Taco Hunt. If that gallery is empty and the stand has a durable `google_place_id`, the API may proxy the first Google Places photo transiently with the required attribution; do not persist its resource name, bytes, or URL as Taco Hunt data. Do not fetch Google ratings or reviews. Image egress, more than database rows, is the likely first free-tier constraint.

## 10. Seed ingestion and provenance

Implement an **offline CLI staging import**, not a live API dependency. Expected CSV columns: `name,latitude,longitude,neighborhood,source_type,source_ref,license,last_verified_at,notes`. The script validates encoding, coordinates, name length and duplicate keys, normalizes names without destroying originals, identifies existing stands within 100 m, and writes only to `import_candidates`. Print a review report with proposed matches. A moderator approves candidates into `spots`; there is no automatic public import.

Include 10 explicitly fictional development fixtures (names such as `Tacos Demo 01`) and never migrate them to production. The owner or community supplies real initial stands. A practical target is 30–50 verified stands in a small Monterrey area before expanding toward 100. Keep source attribution and license on each imported record. OpenStreetMap can supply candidates if its ODbL attribution and database obligations are met; keep it in a distinct provenance set until reviewed. Do not bulk copy listings, reviews or photos from Google Maps or a competitor. Do not invent reviews, opening hours, menu items or prices. A user proposal uses `source_type=user` and remains private until approved.

## 11. Mobile screen inventory

1. **Explore:** map-first home (see `docs/design-map-first.md`) with a list mode, minimized search header with suggestions, filter chips, location action, map/list toggle, loading/empty/error states, visible review counts.
2. **Map:** clustered pins or bounded pin count; selected-pin bottom sheet; manual-area fallback; do not fetch on every camera animation frame.
3. **Stand detail:** header, information reliability labels, taco types, score counts, reviews, directions, favorite, share, report.
4. **Taco detail and rating:** score breakdown, review list, structured form, input validation, optional photo, edit state.
5. **My tacos:** review history and favorites; sign-in prompt if needed.
6. **Propose:** pick a Google place or drop a pin; redirect to an existing linked stand; pending confirmation.
7. **Sign-in and settings:** Supabase Auth flow, privacy links, account deletion, app version and attribution.
8. **Retos and profile:** progress and badges, display name, preset avatars and optional avatar photo.
9. **Admin:** a simple protected API-backed web or mobile screen for the owner, or documented API/OpenAPI tooling for the initial pilot; the moderation operations must exist and be exercised.

Each screen must have clear text at large font sizes, accessible control labels, tap targets of at least 44 points, and skeleton or progress states. Cache last successful public results for temporary offline viewing. Disable mutations offline and preserve unsent review form data locally until the user explicitly discards it. Deep links must handle unknown, pending or deleted IDs gracefully.

## 12. Deployment and near-zero-cost constraints

Cloud Run: request-based billing, `min-instances=0`, initial `max-instances=1`, start with modest CPU/memory and a bounded per-instance DB pool. Set timeout and concurrency consciously, and test cold starts. Bind to `$PORT`. Deploy from CI only after tests pass; keep a rollback instruction. Use a dedicated service identity, secrets in Google Secret Manager or another managed secret mechanism after checking its cost, and never commit secrets. Cloud Run free allowance depends on region, usage and networking; budget alerts are informational, **not a hard cap**. Artifact storage, build minutes, logs and network egress can be chargeable. Review actual bills after first deployment.

Supabase Free currently lists 500 MB database, 1 GB object storage and 50,000 monthly active users. A free project may pause after low activity; this is acceptable for internal testing but may be unacceptable after a public launch. Export schema and content regularly; write down the restore procedure. Start image compression before upload. Set an internal review trigger at 350 MB DB, 700 MB storage, recurring project pauses, or more than two hours weekly moderation.

Android Google Maps SDK needs a Cloud billing account and a key restricted to the app package/signing certificate and the Maps SDK. Do not enable Places on that key; Places uses a separate server-only key held by the API (see `docs/google-places-controls.md`). Publishing costs are outside recurring infrastructure: Google Play currently has a US$25 one-time registration fee and a new personal account may require a closed test with 12 opted-in testers for 14 days; Apple Developer Program is US$99 yearly. Do not buy accounts or deploy services as part of code implementation without owner authorization.

## 13. Testing and quality gates

| Level            | Required checks                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit      | Average and rounding, score bounds, empty aggregates, hiding/editing review effects, normalized names, duplicates near 100 m, pagination token validation.                                                                                  |
| API integration  | Public reads expose only approved/visible data; unauthenticated writes 401; foreign edit/delete denied; blocked user denied; admin endpoints 403 for normal user; duplicate review and report conflicts; file validation; account deletion. |
| Database         | Migrations apply to clean and existing test DB; unique and check constraints fail correctly; missing foreign keys fail; staging import is repeatable without duplicate approved records.                                                    |
| Mobile component | Sign-in at write time, form errors, permission denied, loading/offline, no reviews, unknown hours, image failure, hidden review state.                                                                                                      |
| Device           | Android and iOS real-device pass for location, maps, camera/library, share, app return, large text, screen reader, low connectivity.                                                                                                        |
| Security         | Direct database table endpoints inaccessible to mobile key; no privileged key in mobile bundle or logs; admin role cannot be chosen from user input; image EXIF removed; user A cannot edit user B.                                         |
| Release          | CI lint, TypeScript typecheck, unit and integration tests, build container, run migrations, smoke-test `/healthz` and public browse.                                                                                                        |

Use test factories and realistic synthetic data only in tests. CI must run without live Supabase or cloud credentials. Tests that genuinely require a deployed service are a separate manual smoke checklist. An agent must report which checks actually ran and why any check was skipped.

## 14. Implementation order for the build agent

**Phase 1 — runnable skeleton.** Scaffold monorepo, Expo app, NestJS API, local Postgres, migration runner, health route, contracts package, lint/typecheck/test scripts and CI. Supply README commands for setup, migrate, seed and start. Acceptance: a phone/emulator loads API-backed fictional stands from local server.

**Phase 2 — discovery.** Implement list/detail/review reads, bounds/search/filter pagination, native map, foreground location and manual area. Acceptance: browsing works with location denied; 100 seeded development rows render smoothly; pending rows are not returned.

**Phase 3 — accounts and contributions.** Supabase Auth integration, verified API JWTs, reviews/favorites, photos, proposals, reports, admin actions and ownership tests. Acceptance: end-to-end write flow works locally using test identities; another account cannot mutate it; moderation hides content immediately.

**Phase 4 — release quality.** HTTPS share preview, branded static landing page, accessible polish, offline fallback, deployment files, privacy and moderation docs, cost guardrails, API docs, account deletion and device verification. Acceptance: an unfamiliar developer can follow README and reproduce the demo and local landing page; CI passes; no fictional seed data enters the production import path.

At each phase, commit working code and a short note of decisions and known limitations. Do not skip to hosting, ad integration or scraping to make the demo look populated. If an external key, account or real seed list is unavailable, use a local adapter and development fixtures, finish all independent work, and document the exact missing input.

For the first eight weeks after a small launch, record privacy-safe counts of weekly active users, completed reviews, reviewed stands, 30-day return rate, and shares. A useful experiment gate is 50 real testers, 25 stands with at least one authentic review, and 20% of testers returning within 30 days. These are product learning goals, not a revenue forecast. Instrument event names and schema in `docs/architecture.md`; aggregate events on the server without storing raw location or review text in analytics.

## 15. Open owner inputs

The implementation can start with Taco Hunt as the working name and the supplied visuals. The owner should later confirm trademark and app-store availability, choose a final public name if needed, and decide initial neighborhood coverage, first 30–50 real taquerías and photo rights, sign-in UX/provider configuration, cloud accounts, and whether an Android-first test cohort is preferable. These inputs must not prevent phases 1–2. Do not populate real production data from search results without review.

## 16. Brand and landing page implementation

### 16.1 Working visual identity

![Taco Hunt logo: taco inside a location marker, with a wordmark](Taco_Hunt_Logo.svg)

**Provided assets:** [Editable SVG logo](Taco_Hunt_Logo.svg) and [responsive HTML landing page](Taco_Hunt_Landing.html). Keep both beside this Markdown file while reading it. When implementing, copy the landing HTML to `apps/landing/index.html`, the SVG to `apps/landing/taco-hunt-logo.svg`, and use the same emblem and colors in the mobile app. The HTML refers to `Taco_Hunt_Logo.svg`, so update its two image paths after copying. The SVG contains a location marker framing a taco, plus a text wordmark. Export the emblem alone as the mobile app icon, using the same colors and sufficient interior padding; do not use the full wordmark as a small icon. If a final logo is commissioned, replace the SVG in one place and re-export the mobile assets.

| Token          | Value     | Role                                                                       |
| -------------- | --------- | -------------------------------------------------------------------------- |
| Tortilla cream | `#FBF3E6` | Main background.                                                           |
| Paper          | `#FFFAF1` | Elevated surfaces.                                                         |
| Salsa red      | `#E95032` | Brand accent and selected states.                                          |
| Cilantro green | `#276C4F` | Secondary accent and status.                                               |
| Tortilla gold  | `#F4BE65` | Illustration and emphasis.                                                 |
| Charcoal       | `#302723` | Primary text and high-contrast controls.                                   |
| Muted text     | `#6C5D53` | Supporting copy on light backgrounds; validate contrast in implementation. |

Primary tagline: **Encuentra tu próximo taco favorito.** Landing headline: **Hay tacos buenos. Y tacos que hay que encontrar.** The in-app UI is Spanish for Mexico and uses natural labels such as **Explorar**, **Guardados**, **Mis tacos**, and **Califica este taco**. Use the English name as a brand, not as permission to mix English interface labels into Spanish flows. Voice: curious and playful, specific about what is known; do not make unverifiable claims about being the best or most complete guide.

### 16.2 Landing page behavior and scope

The supplied HTML is a runnable design reference. It has a hero, a clearly labeled conceptual app preview, three product benefit cards, a taco rating explainer, and a closing section. Its internal links point to real anchors and it has no forms, remote fonts, JavaScript, trackers, or external dependencies. The mocked stand explicitly says **Puesto de ejemplo** and **Sin reseñas todavía**. Do not replace those with fabricated ratings, user counts, real-business details, or an email field without a functioning consent and storage path.

For v1, a static HTML page is sufficient and can be served from any free static host. It does not need the API or Supabase. Before launch, set the canonical domain and Open Graph image if available, add live app-store links only after stores are published, and add actual privacy/contact links once those pages exist. Keep the placeholder navigation functional in local preview. Sharing `/s/:spotId` remains the API behavior described above and is a separate per-stand page from this promotional landing page.

Acceptance: the page loads when `index.html` and the SVG are in the same directory; logo remains legible at phone and desktop widths; no horizontal overflow at 390 px; internal links reach their sections; keyboard focus is visible; reduced-motion preferences are respected; title, description, and language are present; every illustrated rating is clearly an example. The supplied HTML uses native links and semantic sections. Run a browser pass at mobile and desktop widths during implementation, check color contrast and screen reader output, and adjust before deployment.

### 16.3 Brand handoff and file mapping

| Supplied file            | Place in repository                                       | Use                                                                         |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Taco_Hunt_Logo.svg`     | `apps/landing/taco-hunt-logo.svg` and mobile asset source | Wordmark on web; emblem-only derivative for app icon.                       |
| `Taco_Hunt_Landing.html` | `apps/landing/index.html`                                 | Static page design and initial implementation; fix logo path after copying. |
| This specification       | `docs/build-spec.md`                                      | Binding product and engineering scope for the implementation agent.         |

The trademark search is a pre-release owner action through Mexico's IMPI MARCia tool; this document does not assert that Taco Hunt is registrable or exclusive. If the public name changes, update the logo wordmark, HTML title/meta/copy, app display name, share previews, documentation, and store listing together.

## 17. Sources and recheck points

Checked on 27 September 2026. Recheck all pricing and policy details before deployment or store publication.

- Expo map integration: https://docs.expo.dev/versions/latest/sdk/map-view/
- NestJS Fastify: https://docs.nestjs.com/http/performance
- Supabase Auth JWT verification: https://supabase.com/docs/guides/auth/jwts
- Supabase database connection methods: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase pricing and free-project pausing: https://supabase.com/pricing and https://supabase.com/docs/guides/platform/free-project-pausing
- Cloud Run pricing and scaling: https://cloud.google.com/run/pricing and https://docs.cloud.google.com/run/docs/configuring/min-instances
- Google Maps mobile SDK pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- Google Places storage restrictions: https://developers.google.com/maps/documentation/places/web-service/policies
- OpenStreetMap licensing: https://wiki.openstreetmap.org/wiki/License/Use_Cases
- Apple Developer Program: https://developer.apple.com/programs/enroll/
- Google Play registration and testing: https://support.google.com/googleplay/android-developer/answer/6112435 and https://support.google.com/googleplay/android-developer/answer/14151465
- Mexico IMPI MARCia trademark search: https://www.gob.mx/impi/acciones-y-programas/marcia-265449
