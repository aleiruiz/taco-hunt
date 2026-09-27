param(
  [ValidateSet('provision', 'rotate')]
  [string] $Action = 'provision'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'No existe .env. Copia .env.example a .env antes de provisionar el rol local.'
}

# Generate a URL-safe, high-entropy password and use it only in this process and .env.
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

# Supabase CLI accepts a SQL file. Keep it in the OS temp directory and remove it
# even when the command fails; the password is never passed as a process argument.
$sqlFile = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N') + '.sql')
$sql = "alter role taco_hunt_api with login password '$password';`n"
try {
  Set-Content -LiteralPath $sqlFile -Value $sql -NoNewline
  & pnpm exec supabase db query --local --file $sqlFile --output json | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo provisionar el rol API en Supabase local; la clave no se guardó.'
  }

  $content = Get-Content -LiteralPath $envFile -Raw
  $uriPassword = [Uri]::EscapeDataString($password)
  $connectionString = "postgresql://taco_hunt_api:$uriPassword@127.0.0.1:55422/postgres"
  $pattern = '(?m)^DATABASE_URL=.*$'
  $replacement = "DATABASE_URL=$connectionString"
  if ($content -match $pattern) {
    $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement }, 1)
  } else {
    $content = $content.TrimEnd() + "`n$replacement`n"
  }
  Set-Content -LiteralPath $envFile -Value $content -NoNewline
} finally {
  Remove-Item -LiteralPath $sqlFile -Force -ErrorAction SilentlyContinue
}

# Reduce the lifetime of the plaintext value in the script's variables.
$password = $null
$sql = $null
$bytes = $null
Write-Output "Rol taco_hunt_api $Action aplicado; DATABASE_URL local actualizado en .env (secreto omitido)."
