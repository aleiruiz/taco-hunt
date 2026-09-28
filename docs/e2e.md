# Local end-to-end smoke procedure

This is a manual smoke procedure for the current browse journey. It exercises the local Supabase database, API, and mobile app with fictional fixtures. It is not an automated test suite and does not require production credentials.

## Prerequisites

- Node.js 24.19.0 (the supported project range begins at 20.19.4)
- pnpm 11.25.0
- Docker Desktop running
- An iOS simulator, Android emulator, or physical phone for the mobile portion

## Start the local services

From the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm db:start
pnpm db:reset
.\supabase\dev-role.ps1 provision
```

Provisioning writes a randomly generated, server-only database URL to `.env`. Do not print it, copy it into a command transcript, or use it in an `EXPO_PUBLIC_*` variable. See [the Supabase guide](../supabase/README.md) for the role and ACL details.

## Smoke-test the API

In a new PowerShell terminal at the repository root, load the server-only database URL into the process environment without printing it and start the API:

```powershell
$databaseUrlLine = Get-Content .env | Where-Object { $_.StartsWith("DATABASE_URL=") } | Select-Object -First 1
$env:DATABASE_URL = $databaseUrlLine.Substring("DATABASE_URL=".Length)
$env:PORT = "3001"
pnpm dev:api
```

In another terminal, check that the service responds and that public browsing returns the fictional stands:

```powershell
$health = Invoke-RestMethod http://127.0.0.1:3001/healthz
$spots = Invoke-RestMethod "http://127.0.0.1:3001/v1/spots?limit=20"
$tacoTypes = Invoke-RestMethod http://127.0.0.1:3001/v1/taco-types
$health
$spots.items.Count
$tacoTypes.items.Count
```

Expected: health status `ok`, 10 spots, and 10 active taco types. The fixture names begin with `Tacos Demo`; they are synthetic development data.

## Smoke-test the mobile browse flow

In a third terminal, point Expo at the local API and start the app:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://localhost:3001/v1"
pnpm dev:mobile
```

Open the app in an iOS simulator or the Android emulator. Confirm the Explore screen shows the fictional stands, search returns matching names/neighborhoods, and opening a stand shows its approved taco types. For an Android emulator, use `http://10.0.2.2:3001/v1` instead of `localhost`. For a physical phone, use the computer's LAN address and keep it only in the local `.env`; both devices must be on the same network and the firewall must allow the API port.

The current manual smoke scope covers public browsing only. Authenticated contributions, moderation, map interactions, and device-specific permissions require their own implementation and acceptance passes; this procedure does not imply those flows are complete. CI runs lint, typecheck, and formatting checks without starting Docker or requiring Supabase credentials.
