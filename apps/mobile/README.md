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
