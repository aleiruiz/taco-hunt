# Taco Hunt mobile

## Configure Supabase Auth

The mobile app uses only the Supabase Auth API. Set `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Expo environment, using the values from
`supabase status` for local development. Never place database passwords or a service role key in
an `EXPO_PUBLIC_*` variable.

Install the mobile-only Auth dependencies from this directory:

```sh
npm install @react-native-async-storage/async-storage@2.2.0 @supabase/supabase-js@^2.57.0
```

Then start the app from the repository root with `pnpm dev:mobile`. Registration may require
email confirmation depending on the Supabase Auth configuration. Local development can inspect
confirmation and password-reset messages in the Supabase local mail catcher.
