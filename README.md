# Taco Hunt

Monorepo for discovering taco stands and rating a specific taco type at a specific stand in Monterrey.

The full functional specification is in [docs/build-spec.md](docs/build-spec.md). The landing page is at [apps/landing/index.html](apps/landing/index.html) and uses [apps/landing/taco-hunt-logo.svg](apps/landing/taco-hunt-logo.svg).

## Connections in place

- **GitHub:** public repository `aleiruiz/taco-hunt`, `main` branch.
- **Local Supabase:** CLI pinned as a dev dependency, with configuration versioned in `supabase/`. The local database, Auth, and Storage run in Docker.
- **Remote Supabase and Google Cloud:** not linked yet; they require selecting/creating projects and authenticating the accounts. No cloud infrastructure was created and no billing was activated.
- **Expo and maps:** `apps/mobile` runs as an Expo development build (EAS profile `development` in `apps/mobile/eas.json`). The map uses `react-native-maps`; Android needs a restricted Maps SDK key at build time.
- **Google Places:** the mobile app never calls Google directly. The API calls Google Places (New) server-side with `GOOGLE_PLACES_API_KEY` for live viewport discovery, autocomplete, on-demand details and photos, and review-target creation. Google display data is never stored; see [docs/google-places-controls.md](docs/google-places-controls.md).

## Local requirements

- Node.js 24 (`.nvmrc` pins 24.21.0; the API requires 22 or higher and Expo SDK 57 requires 20.19.4 or higher)
- pnpm (version pinned in `package.json`)
- Docker Desktop running

## Set up the environment

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:start
pnpm db:status
pnpm db:reset
.\supabase\dev-role.ps1 provision
```

`db:status` shows the local Auth URL and the keys for development. Copy only the publishable key into `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `dev-role.ps1 provision` creates the least-privileged `taco_hunt_api` database role and writes its `DATABASE_URL` to `.env`; the API must never connect as the `postgres` owner. Privileged keys/passwords are server-only and must never be prefixed with `EXPO_PUBLIC_` or published.

Neither app reads the root `.env` on its own. The API takes its settings from the process environment (see [docs/e2e.md](docs/e2e.md) for loading `DATABASE_URL` without printing it). Expo loads `.env` from `apps/mobile/`, so put the `EXPO_PUBLIC_*` values and the native maps keys there or export them in the shell.

The pnpm workspace applies the patches in `patches/` (React Native Screens, Worklets, Reanimated, Expo Modules Core, and Gesture Handler) through `patchedDependencies` in `pnpm-workspace.yaml`. Keep a patch's version in step with the dependency it patches.

`pnpm db:reset` applies migrations from scratch and loads fictional development stands. To stop local services use `pnpm db:stop`.

## Review photos

Photos are processed and stored in the private `review-photos` bucket. To enable local uploads, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env` to the local URL and the `service_role` key shown by `pnpm db:status`. These credentials are server-only; never include them in `EXPO_PUBLIC_` variables.

The API accepts an image up to 2 MB at `POST /v1/review-photos` as multipart (`file`), validates the decoded content, strips metadata, fixes orientation, and generates a WebP up to 1200 px and 300 KB. It returns a one-time-use upload ID that is sent as `photoUploadId` when creating or editing a review; using `null` on edit removes the photo. Deleting a review removes the database reference first, then attempts to delete the object.

Public responses never include a direct Storage URL. To display an image, request `GET /v1/media/:reviewId`; the endpoint only issues a signed URL if the review is still visible and the stand and taco type are approved. The URL expires in five minutes; hidden or unavailable photos respond 404.

To review and clean up old pending uploads or orphaned objects, run `pnpm --filter @taco-hunt/api media:cleanup` in preview mode. To delete the listed objects, add `-- --delete`. The default threshold is 24 hours; it can be changed with `MEDIA_ORPHAN_AGE_HOURS` (1–8760). The command needs `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` on the server side.

## Quality and formatting

Run these commands from the repository root before sharing changes:

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
```

`pnpm lint` runs ESLint on the API, the contracts package, and the landing page; the mobile app is excluded from ESLint and checked by `pnpm typecheck`, which covers the API and the mobile app. To format compatible files use `pnpm format`; `pnpm format:check` only reports whether there are differences. The shared configuration lives in `eslint.config.mjs` and `.prettierrc.json`.

The manual end-to-end procedure for starting Supabase, checking the API, and opening mobile discovery is in [docs/e2e.md](docs/e2e.md). GitHub Actions runs `pnpm lint` and `pnpm typecheck` without starting Docker or requiring Supabase credentials; its Prettier step checks only the workflow file, not the whole repository.

## Run the demo

In three terminals from the root. Load `DATABASE_URL` from `.env` as shown in [docs/e2e.md](docs/e2e.md), then:

```powershell
pnpm dev:api
```

```powershell
pnpm dev:landing
```

```powershell
pnpm dev:mobile
```

The local landing page runs at `http://localhost:4173`; the API at `http://localhost:3001/healthz`. `pnpm dev:mobile` starts Metro on a free port and prints it. Open the app in a development build, not Expo Go: native map keys, the `withAndroidCxxShared` config plugin, and the patched native dependencies all need one. Build it with `eas build --profile development` (see `apps/mobile/eas.json`) or locally with `npx expo run:android` from `apps/mobile`.

If `EXPO_PUBLIC_API_URL` is not set, the app uses `http://10.0.2.2:3001/v1` on Android (the emulator's host) and `http://localhost:3001/v1` elsewhere.

## API from mobile

- iOS simulator: can usually reach the local API with `localhost`.
- Android emulator: use `10.0.2.2` as the computer's host.
- Physical phone: use the computer's LAN IP, with both devices on the same network. Set that value only in the local `.env`; never write it into code or commit it to Git.

The IP depends on each network. The API must listen on `0.0.0.0`; the local firewall may prompt for permission for private connections.

## First run

- If `pnpm db:start` fails to connect, start Docker Desktop and confirm the engine is ready.
- The configuration uses ports 55420–55429 to avoid ranges reserved by Windows; if you change one, adjust the local `.env` URLs.
- For Android without a map, set `ANDROID_MAPS_API_KEY` (and `IOS_MAPS_API_KEY` for Google Maps on iOS) before building the development build, and `EXPO_PUBLIC_MAPS_PROVIDER=google` to use the Google provider. Restrict the key to the Maps SDK, the package `com.aleiruiz.tacohunt`, and its signing certificate. Maps may require Google Cloud billing. Never enable Places on this key; Places uses the separate server-only `GOOGLE_PLACES_API_KEY`.
- If the phone can't reach the API, check that the API listens on `0.0.0.0`, the LAN URL in `.env`, the Wi-Fi network, and the firewall rules.
- Auth messages from the local stack are captured by the test mail server; they are not sent to real addresses.

## Admin and maintenance scripts

From the root, with the server-only variables each script needs in the environment:

- `pnpm --filter @taco-hunt/api admin:bootstrap` grants the first admin role (see [docs/authentication.md](docs/authentication.md)).
- `pnpm --filter @taco-hunt/api media:cleanup` previews old pending uploads and orphaned photo objects (described above).
- `pnpm --filter @taco-hunt/api places:refresh` re-checks approved stands linked to a Google place (see [docs/data-provenance.md](docs/data-provenance.md)).

## More information

- [docs/build-spec.md](docs/build-spec.md): architecture, data model, API, and security.
- [docs/deploy.md](docs/deploy.md): production deployment (Cloud Run, Supabase, S3, Android release builds) and rollback.
- [docs/google-places-controls.md](docs/google-places-controls.md): Google Places usage, budgets, and kill switch.
- [docs/data-provenance.md](docs/data-provenance.md), [docs/moderation.md](docs/moderation.md), [docs/privacy.md](docs/privacy.md), [docs/authentication.md](docs/authentication.md), [docs/share.md](docs/share.md).
- [docs/plan-delegacion.md](docs/plan-delegacion.md): task board and current status.
