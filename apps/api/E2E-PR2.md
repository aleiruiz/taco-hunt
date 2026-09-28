# T02 API local E2E record

## Successful local API route pass

Environment: Node 24.19.0, pnpm 11.25.0, Docker 29.8.0, T01 Supabase local stack already running on ports 55421/55422. The stack was not restarted or reset for this pass. T01's `supabase/dev-role.ps1 provision` helper provisioned a random local runtime secret and wrote `DATABASE_URL` to the ignored `.env`; the secret is intentionally omitted here.

Port 3001 was already occupied and its existing `/healthz` returned 503, so the T02 API was run on port 3102. TypeScript checks and emitted JS were performed with the installed local compiler binaries (pnpm's install lifecycle exited early due the workspace's pending build-script approval; details below):

```powershell
& .\apps\api\node_modules\.bin\tsc.cmd --noEmit -p apps/api/tsconfig.json
& .\packages\contracts\node_modules\.bin\tsc.cmd -p packages/contracts/tsconfig.json
& .\apps\api\node_modules\.bin\tsc.cmd -p apps/api/tsconfig.json
```

Then, in PowerShell, load the local environment variables without printing them and start the API:

```powershell
$env:PATH = 'C:\Users\<user>\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
foreach ($line in [System.IO.File]::ReadAllLines((Join-Path (Get-Location) '.env'))) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $parts = $line.Split('=', 2)
  [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
}
$env:PORT = '3102'
node apps/api/dist/main.js
```

In another terminal, run:

```powershell
$base = 'http://127.0.0.1:3102'
$health = Invoke-RestMethod "$base/healthz"
$types = Invoke-RestMethod "$base/v1/taco-types"
$spots = Invoke-RestMethod "$base/v1/spots?north=26.1&south=25.4&east=-99.8&west=-100.9&limit=20"
$first = $spots.items | Select-Object -First 1
$detail = Invoke-RestMethod "$base/v1/spots/$($first.id)"
```

Observed: health `ok`, 10 taco types, 10 approved fictional spots, `nextCursor = null`, and the first detail returned 2 tacos. Invalid bounds (`north=24`) and an invalid spot UUID both returned HTTP 400 with `error.code = VALIDATION_ERROR` and a non-empty `requestId`.

## Container build result

The first Docker build exposed that the Dockerfile's Node 20 image cannot run the pinned pnpm 11.25.0 (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; pnpm requires Node >=22.13). The API Dockerfile was updated to Node 24. Rebuilding then reached `pnpm install` but stopped with:

```text
ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild@0.28.2, unrs-resolver@1.12.2
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

The repository's shared `pnpm-workspace.yaml` still contains placeholder `allowBuilds` values. Approval requires a coordinated root workspace configuration change. The container image therefore has not yet been built or exercised; no successful Docker E2E is claimed.
