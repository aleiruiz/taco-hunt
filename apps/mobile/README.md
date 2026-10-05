# Taco Hunt mobile

## Configure Supabase Auth

The mobile app uses only the Supabase Auth API. Set `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Expo environment, using the values from
`supabase status` for local development. Never place database passwords or a service role key in
an `EXPO_PUBLIC_*` variable.

Install workspace dependencies from the repository root with `pnpm install`, then start the app
with `pnpm dev:mobile`. Password recovery returns to the app at `tacohunt://update-password`;
allow this exact URL in the deployed Supabase Auth redirect URL settings. Use a development build
that registers the `tacohunt` scheme to test password recovery. Registration may require
email confirmation depending on the Supabase Auth configuration. Local development can inspect
confirmation and password-reset messages in the Supabase local mail catcher.

## Run on a device

The app needs a development build; Expo Go cannot load the native map keys, the
`plugins/withAndroidCxxShared` config plugin, or the patched native dependencies. Build one with
`eas build --profile development` (see `eas.json`) or locally with `npx expo run:android`, then
start Metro with `pnpm dev:mobile` from the repository root (it picks a free port and prints it).

Expo reads `.env` from this folder (`apps/mobile/`), not from the repository root. Besides the
Supabase values above, set:

- `EXPO_PUBLIC_API_URL`: the Taco Hunt API base URL. When unset, the app uses
  `http://10.0.2.2:3001/v1` on Android and `http://localhost:3001/v1` elsewhere. For a physical
  phone use the computer's LAN address, only in an uncommitted local `.env`.
- `EXPO_PUBLIC_MAPS_PROVIDER=google` to use the Google map provider.
- `ANDROID_MAPS_API_KEY` and, optionally, `IOS_MAPS_API_KEY` at build time: Maps SDK keys
  restricted to the package `com.aleiruiz.tacohunt` and its signing certificate. Never enable
  Places on these keys; the API holds the separate Places key.
