# Creates the private user-media bucket and its least-privilege IAM user for one environment.
# See docs/media-storage.md and docs/deploy.md. Run from the repository root in PowerShell 7.
# Requires the AWS CLI with an administrator profile. For prod, also requires gcloud signed in to
# the Google Cloud project: the access key goes straight into Secret Manager and is never printed.
# Idempotent except for creating the access key; re-running creates a second key.
param(
  [Parameter(Mandatory)]
  [ValidateSet('dev', 'prod')]
  [string] $Environment,
  [string] $Region = 'us-east-1',
  # Google Cloud project that receives the prod key in Secret Manager.
  [string] $GcpProject
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($Environment -eq 'prod' -and -not $GcpProject) {
  throw 'Prod needs -GcpProject so the access key goes to Secret Manager.'
}

$Bucket = "taco-hunt-media-$Environment"
$User = "taco-hunt-api-media-$Environment"
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $Tmp | Out-Null

try {
  $bucketExists = $true
  try { aws s3api head-bucket --bucket $Bucket 2>$null } catch { $bucketExists = $false }
  if (-not $bucketExists) {
    if ($Region -eq 'us-east-1') {
      aws s3api create-bucket --bucket $Bucket --region $Region | Out-Null
    } else {
      aws s3api create-bucket --bucket $Bucket --region $Region --create-bucket-configuration "LocationConstraint=$Region" | Out-Null
    }
  }
  aws s3api put-public-access-block --bucket $Bucket --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-encryption --bucket $Bucket --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

  @{ Version = '2012-10-17'; Statement = @(@{ Sid = 'DenyInsecureTransport'; Effect = 'Deny'; Principal = '*'; Action = 's3:*'; Resource = @("arn:aws:s3:::$Bucket", "arn:aws:s3:::$Bucket/*"); Condition = @{ Bool = @{ 'aws:SecureTransport' = 'false' } } }) } |
    ConvertTo-Json -Depth 8 | Set-Content -Encoding ascii "$Tmp/bucket-policy.json"
  aws s3api put-bucket-policy --bucket $Bucket --policy "file://$Tmp/bucket-policy.json"

  @{ Rules = @(@{ ID = 'abort-incomplete-multipart'; Status = 'Enabled'; Filter = @{ Prefix = '' }; AbortIncompleteMultipartUpload = @{ DaysAfterInitiation = 7 } }) } |
    ConvertTo-Json -Depth 8 | Set-Content -Encoding ascii "$Tmp/lifecycle.json"
  aws s3api put-bucket-lifecycle-configuration --bucket $Bucket --lifecycle-configuration "file://$Tmp/lifecycle.json"

  $userExists = $true
  try { aws iam get-user --user-name $User 2>$null | Out-Null } catch { $userExists = $false }
  if (-not $userExists) { aws iam create-user --user-name $User | Out-Null }
  @{ Version = '2012-10-17'; Statement = @(
      @{ Sid = 'MediaObjects'; Effect = 'Allow'; Action = @('s3:PutObject', 's3:GetObject', 's3:DeleteObject'); Resource = "arn:aws:s3:::$Bucket/*" },
      @{ Sid = 'MediaListingForCleanup'; Effect = 'Allow'; Action = 's3:ListBucket'; Resource = "arn:aws:s3:::$Bucket" }) } |
    ConvertTo-Json -Depth 8 | Set-Content -Encoding ascii "$Tmp/user-policy.json"
  aws iam put-user-policy --user-name $User --policy-name media-bucket-access --policy-document "file://$Tmp/user-policy.json"

  # IAM allows two keys per user. Refuse instead of failing halfway; to rotate, delete the
  # retired key after the new one is stored and deployed.
  $existingKeys = @((aws iam list-access-keys --user-name $User | ConvertFrom-Json).AccessKeyMetadata)
  if ($existingKeys.Count -ge 2) {
    throw "$User already has two access keys. Delete the one no longer in use (aws iam delete-access-key) and re-run."
  }

  $key = aws iam create-access-key --user-name $User | ConvertFrom-Json
  # Secrets whose new version was published, with the file holding the previous value (or $null).
  $published = [System.Collections.Generic.List[object]]::new()
  try {
    if ($Environment -eq 'prod') {
      foreach ($pair in @(@('s3-media-access-key-id', $key.AccessKey.AccessKeyId), @('s3-media-secret-access-key', $key.AccessKey.SecretAccessKey))) {
        $name = $pair[0]
        $secretExists = $true
        try { gcloud secrets describe $name --project $GcpProject 2>$null | Out-Null } catch { $secretExists = $false }
        $previousFile = $null
        if ($secretExists) {
          # Keep the current value so a half-finished rotation can be rolled back.
          $previousFile = Join-Path $Tmp "$name.previous"
          try {
            gcloud secrets versions access latest --secret $name --project $GcpProject "--out-file=$previousFile" 2>$null | Out-Null
          } catch { $previousFile = $null }
        } else {
          gcloud secrets create $name --project $GcpProject --replication-policy automatic | Out-Null
        }
        # The value goes through a temp file (no trailing newline), never a process argument.
        $valueFile = Join-Path $Tmp $name
        Set-Content -Encoding ascii -NoNewline -LiteralPath $valueFile -Value $pair[1]
        gcloud secrets versions add $name --project $GcpProject "--data-file=$valueFile" | Out-Null
        $published.Add(@($name, $previousFile))
      }
      Write-Host "Done: bucket $Bucket and user $User; access key stored in Secret Manager ($GcpProject)."
    } else {
      # Local, git-ignored file only.
      Add-Content -Encoding ascii apps/api/.env "`nMEDIA_STORAGE_DRIVER=s3`nS3_MEDIA_BUCKET=$Bucket`nS3_MEDIA_REGION=$Region`nS3_MEDIA_ACCESS_KEY_ID=$($key.AccessKey.AccessKeyId)`nS3_MEDIA_SECRET_ACCESS_KEY=$($key.AccessKey.SecretAccessKey)"
      Write-Host "Done: bucket $Bucket and user $User; credentials appended to apps/api/.env."
    }
  } catch {
    # Never leave a half-published pair: put back the previous value of any secret already written.
    foreach ($entry in $published) {
      if ($entry[1]) {
        try {
          gcloud secrets versions add $entry[0] --project $GcpProject "--data-file=$($entry[1])" | Out-Null
        } catch { Write-Warning "Could not restore $($entry[0]); restore its previous version by hand." }
      } else {
        Write-Warning "Secret $($entry[0]) had no previous value; its latest version now belongs to a deleted key."
      }
    }
    # Never leave an active key that was not stored completely.
    aws iam delete-access-key --user-name $User --access-key-id $key.AccessKey.AccessKeyId
    throw
  }
  if ($existingKeys.Count -gt 0) {
    Write-Host "Note: $User has an older access key. Delete it once the API runs with the new one."
  }
} finally {
  Remove-Item -Recurse -Force $Tmp
}
