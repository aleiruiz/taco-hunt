# Taco Hunt

Monorepo for discovering taco stands and rating a specific taco type at a specific stand in Monterrey.

The full functional specification is in [docs/build-spec.md](docs/build-spec.md). The landing page is at [apps/landing/index.html](apps/landing/index.html) and uses [apps/landing/taco-hunt-logo.svg](apps/landing/taco-hunt-logo.svg).

## Connections in place

- **GitHub:** public repository `aleiruiz/taco-hunt`, `main` branch.
- **Local Supabase:** CLI pinned as a dev dependency, with configuration versioned in `supabase/`. The local database, Auth, and Storage run in Docker.
- **Remote Supabase and Google Cloud:** not linked yet; they require selecting/creating projects and authenticating the accounts. No cloud infrastructure was created and no billing was activated.
- **Expo and maps:** will be connected when building `apps/mobile`; Android Maps requires a restricted key. The app will not use Places or geocoding/routing APIs.

## Local requirements

- Node.js 20.19.4 or higher (Expo SDK 57 requirement)
- pnpm (version pinned in `package.json`)
- Docker Desktop running

## Set up the environment

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:start
pnpm db:status
```

`db:status` shows the local Auth URL and the keys for development. Copy only the publishable key into the `SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables in `.env`. Privileged keys/passwords are server-only and must never be prefixed with `EXPO_PUBLIC_` or published.

`pnpm db:reset` applies migrations from scratch and loads fictional development stands. To stop local services use `pnpm db:stop`.

## Review photos

Photos are processed and stored in the private `review-photos` bucket. To enable local uploads, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env` to the local URL and the `service_role` key shown by `pnpm db:status`. These credentials are server-only; never include them in `EXPO_PUBLIC_` variables.

The API accepts an image up to 2 MB at `POST /v1/review-photos` as multipart (`file`), validates the decoded content, strips metadata, fixes orientation, and generates a WebP up to 1200 px and 300 KB. It returns a one-time-use upload ID that is sent as `photoUploadId` when creating or editing a review; using `null` on edit removes the photo. Deleting a review removes the database reference first, then attempts to delete the object.

Public responses never include a direct Storage URL. To display an image, request `GET /v1/media/:reviewId`; the endpoint only issues a signed URL if the review is still visible and the stand and taco type are approved. The URL expires in five minutes; hidden or unavailable photos respond 404.

To review and clean up old pending uploads or orphaned objects, run `pnpm --filter @taco-hunt/api media:cleanup` in preview mode. To delete the listed objects, add `-- --delete`. The default threshold is 24 hours; it can be changed with `MEDIA_ORPHAN_AGE_HOURS` (1–8760). The command needs `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` on the server side.

## Run the demo

## Quality and formatting

Run these commands from the repository root before sharing changes:

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
```

`pnpm lint` applies ESLint to the Expo app, the API, and the landing page. `pnpm typecheck` checks types for the API and the mobile app. To format compatible files use `pnpm format`; `pnpm format:check` only reports whether there are differences. The shared configuration lives in `eslint.config.js` and `.prettierrc.json`.

The manual end-to-end procedure for starting Supabase, checking the API, and opening mobile discovery is in [docs/e2e.md](docs/e2e.md). GitHub Actions runs the quality commands without starting Docker or requiring Supabase credentials.

In three terminals from the root:

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

The local landing page runs at `http://localhost:4173`; the API at `http://localhost:3001/healthz`. For the Android emulator use `http://10.0.2.2:3001/v1` as `EXPO_PUBLIC_API_URL`; on a physical phone, use this computer's LAN IP. In Expo Go, press `w` to preview in the browser.

## API from mobile

- iOS simulator: can usually reach the local API with `localhost`.
- Android emulator: use `10.0.2.2` as the computer's host.
- Physical phone: use the computer's LAN IP, with both devices on the same network. Set that value only in the local `.env`; never write it into code or commit it to Git.

The IP depends on each network. The API must listen on `0.0.0.0`; the local firewall may prompt for permission for private connections.

## First run

- If `pnpm db:start` fails to connect, start Docker Desktop and confirm the engine is ready.
- The configuration uses ports 55420–55429 to avoid ranges reserved by Windows; if you change one, adjust the local `.env` URLs.
- For Android without a map, set `EXPO_PUBLIC_ANDROID_MAPS_API_KEY` to a Google Maps SDK for Android key restricted by package name and signing certificate. Maps may require Google Cloud billing; do not enable Places.
- If the phone can't reach the API, check that the API listens on `0.0.0.0`, the LAN URL in `.env`, the Wi-Fi network, and the firewall rules.
- Auth messages from the local stack are captured by the test mail server; they are not sent to real addresses.

## More information

See `docs/build-spec.md` for architecture, data model, API, security, provenance-based import, and the deployment recipe.
