# Production deployment

This is the deployment recipe for T16. It describes the target the owner chose on 2026-10-06: the API as a container on **Google Cloud Run**, the database and Auth on **Supabase Free**, user media in a private **AWS S3** bucket, and an **Android-only** first release. Nothing in this document creates resources by itself; every account, resource, and paid step needs the owner's explicit authorization (build spec §12).

Recheck every price and free-tier limit below on the provider's pricing page before creating anything. Budget alerts are informational, **not a hard cap**.

## Target layout

| Piece                | Where                                                    | Notes                                                                                                       |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API                  | Cloud Run service `taco-hunt-api`, region `us-east1`     | `min-instances=0`, `max-instances=1`; same coast as the database and media bucket.                          |
| Container images     | Artifact Registry repository `taco-hunt`, `us-east1`     | Cleanup policy keeps the last 3 images so storage stays inside the free allowance.                          |
| Secrets              | Google Secret Manager                                    | Five secrets (below), mounted as environment variables. Never in the repo, the image, or CI.                |
| Database and Auth    | Supabase project `taco-hunt-prod`, East US (N. Virginia) | Free plan. Pauses after about a week without activity; acceptable during the closed test.                   |
| User media           | S3 bucket `taco-hunt-media-prod`, `us-east-1`            | Private, encrypted, accessed only by IAM user `taco-hunt-api-media-prod`. See `docs/media-storage.md`.      |
| Places (server side) | Google Cloud API key restricted to Places API (New)      | Separate from the Android Maps key. Daily call limit and kill switch from `docs/google-places-controls.md`. |
| Android app          | EAS `production` profile (AAB) to Google Play            | `preview` profile (APK) for testing a release build against production before store upload.                 |
| Landing page         | Free static host                                         | Also hosts the privacy policy URL that Google Play requires.                                                |

## One-time setup

Each step lists who does it. "Owner" steps need the owner's own accounts or payment method.

### 1. Google Cloud project (owner)

1. Create a project (for example `taco-hunt-prod`) and link a billing account.
2. Create a budget on the billing account (for example US$5/month) with email alerts at 50%, 90% and 100%.
3. Enable the APIs: Cloud Run Admin, Artifact Registry, Secret Manager, IAM Credentials, Security Token Service, and Places API (New).

### 2. Container registry and runtime identity

```bash
PROJECT_ID=taco-hunt-prod
REGION=us-east1

gcloud artifacts repositories create taco-hunt --project "$PROJECT_ID" \
  --location "$REGION" --repository-format docker
gcloud artifacts repositories set-cleanup-policies taco-hunt --project "$PROJECT_ID" \
  --location "$REGION" --policy infra/gcp/artifact-cleanup-policy.json

# Dedicated identity the service runs as. It can only read its own secrets.
gcloud iam service-accounts create taco-hunt-api --project "$PROJECT_ID" \
  --display-name "Taco Hunt API runtime"
```

### 3. Deploy identity for GitHub Actions (Workload Identity Federation)

The deploy workflow authenticates with short-lived tokens through Workload Identity Federation, so no service account key is ever created or stored in GitHub.

```bash
gcloud iam service-accounts create taco-hunt-deployer --project "$PROJECT_ID" \
  --display-name "Taco Hunt deploy from GitHub Actions"

for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:taco-hunt-deployer@$PROJECT_ID.iam.gserviceaccount.com" --role "$role"
done
# The deployer may deploy the service as the runtime identity, and nothing else.
gcloud iam service-accounts add-iam-policy-binding \
  "taco-hunt-api@$PROJECT_ID.iam.gserviceaccount.com" --project "$PROJECT_ID" \
  --member "serviceAccount:taco-hunt-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create github --project "$PROJECT_ID" --location global
gcloud iam workload-identity-pools providers create-oidc taco-hunt-repo --project "$PROJECT_ID" \
  --location global --workload-identity-pool github \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition "assertion.repository == 'aleiruiz/taco-hunt' && assertion.ref == 'refs/heads/main'"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding \
  "taco-hunt-deployer@$PROJECT_ID.iam.gserviceaccount.com" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/aleiruiz/taco-hunt"
```

Then add these **repository variables** (Settings → Secrets and variables → Actions → Variables). They are identifiers, not secrets:

| Variable              | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`      | `taco-hunt-prod`                                                                                                      |
| `GCP_REGION`          | `us-east1`                                                                                                            |
| `GCP_WIF_PROVIDER`    | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/taco-hunt-repo`                    |
| `GCP_DEPLOY_SA`       | `taco-hunt-deployer@taco-hunt-prod.iam.gserviceaccount.com`                                                           |
| `API_SUPABASE_URL`    | `https://<project-ref>.supabase.co`                                                                                   |
| `API_PUBLIC_BASE_URL` | The public HTTPS origin used in share links, e.g. `https://api.<domain>` (or the `run.app` URL until a domain exists) |
| `API_S3_MEDIA_BUCKET` | The media bucket name from step 5 (`taco-hunt-media-prod` unless that name was taken)                                 |

### 4. Supabase production project (owner creates, Claude scripts the rest)

1. Create the project on the Free plan in East US (N. Virginia). Store the database password in a password manager; it is the **migration/owner credential** and never goes to Cloud Run.
2. In Authentication, keep the default asymmetric JWT signing keys. The API verifies tokens through the project's JWKS endpoint; the HS256 shared-secret path is disabled when `NODE_ENV=production` (`apps/api/src/auth/jwt-verifier.service.ts`).
3. Apply the migrations from a trusted machine. `db push` does **not** run `supabase/seed.sql`, so the fictional "Tacos Demo" fixtures stay out of production. Never pass `--include-seed`.

   ```bash
   pnpm supabase link --project-ref <project-ref>
   pnpm supabase db push
   ```

4. Give the runtime role `taco_hunt_api` (created by the initial migration) a new random password, different from any local one, in the SQL editor: `alter role taco_hunt_api with login password '<generated>';`
5. Build the runtime `DATABASE_URL` from the **session pooler** connection string (Connect → Session pooler), replacing the user with `taco_hunt_api.<project-ref>`. Use the pooler, not the direct host: the direct host is IPv6-only on Free and Cloud Run egress is IPv4 by default. The API's pool is capped at 5 connections (`apps/api/src/database/database.module.ts`), which with one instance stays well inside the pooler limit.
6. Copy the project's secret API key (`sb_secret_…`) for `SUPABASE_SECRET_KEY`. It is used only by account deletion to remove the Auth user.

### 5. Production media bucket (owner runs on their PC)

```powershell
.\infra\aws\create-media-bucket.ps1 -Environment prod -GcpProject taco-hunt-prod
```

S3 bucket names are global. If `taco-hunt-media-prod` is taken, add `-Bucket <another-name>` and use that name for `API_S3_MEDIA_BUCKET`. The script needs PowerShell 7.4 or newer.

The script creates the private bucket and its least-privilege IAM user, then writes the new access key straight into Secret Manager (`s3-media-access-key-id`, `s3-media-secret-access-key`) without printing it. It needs the AWS CLI with an administrator profile and `gcloud` signed in to the project.

### 6. Secrets

Create each secret once and grant the runtime identity access. Read the value from a prompt or a file outside the repository; never put it on the command line or in shell history.

| Secret name                  | Environment variable         | Source                         |
| ---------------------------- | ---------------------------- | ------------------------------ |
| `database-url`               | `DATABASE_URL`               | Step 4.5                       |
| `supabase-secret-key`        | `SUPABASE_SECRET_KEY`        | Step 4.6                       |
| `s3-media-access-key-id`     | `S3_MEDIA_ACCESS_KEY_ID`     | Step 5 (created by the script) |
| `s3-media-secret-access-key` | `S3_MEDIA_SECRET_ACCESS_KEY` | Step 5 (created by the script) |
| `google-places-api-key`      | `GOOGLE_PLACES_API_KEY`      | Step 7                         |

```bash
# The two S3 secrets already exist (step 5); create the other two now.
gcloud secrets create database-url --project "$PROJECT_ID" --replication-policy automatic --data-file=-          # paste, then Ctrl-D
gcloud secrets create supabase-secret-key --project "$PROJECT_ID" --replication-policy automatic --data-file=-   # paste, then Ctrl-D
for secret in database-url supabase-secret-key s3-media-access-key-id s3-media-secret-access-key; do
  gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT_ID" \
    --member "serviceAccount:taco-hunt-api@$PROJECT_ID.iam.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor
done
```

`google-places-api-key` is created and bound in step 7, once the key exists.

Five secrets with one active version each stay within Secret Manager's free allowance at the time of writing. Rotating a secret means adding a new version and redeploying; disable the old version afterwards.

### 7. Google keys (owner)

- **Places (server):** create an API key restricted to _Places API (New)_ only. Cloud Run has no fixed egress IP, so the key cannot be IP-restricted; the API-level restriction, the daily call limit and the kill switch are the controls.

  Store it and grant the runtime identity access:

  ```bash
  gcloud secrets create google-places-api-key --project "$PROJECT_ID" --replication-policy automatic --data-file=-   # paste, then Ctrl-D
  gcloud secrets add-iam-policy-binding google-places-api-key --project "$PROJECT_ID" \
    --member "serviceAccount:taco-hunt-api@$PROJECT_ID.iam.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor
  ```

- **Maps SDK for Android:** a separate key restricted to _Maps SDK for Android_, package `com.aleiruiz.tacohunt`, and the SHA-1 fingerprints of both the EAS upload certificate and the Google Play app signing certificate (Play Console → App integrity). Never enable Places on this key.

## Deploying the API

Run the **Deploy API** workflow from the Actions tab (manual trigger, `main` only). It:

1. Runs lint and typecheck.
2. Builds `apps/api/Dockerfile` and pushes it to Artifact Registry tagged with the commit SHA.
3. Deploys a new Cloud Run revision with the settings below and the secrets above.

| Setting            | Value     | Why                                                                                     |
| ------------------ | --------- | --------------------------------------------------------------------------------------- |
| `min-instances`    | 0         | Request-based billing; no cost while idle. Expect a cold start of a few seconds.        |
| `max-instances`    | 1         | Keeps the in-process rate limits exact and caps cost. Raise only after reviewing bills. |
| CPU / memory       | 1 / 512Mi | Enough for image resizing with `sharp`; revisit if uploads hit memory limits.           |
| Concurrency        | 40        | Bounded by the 5-connection DB pool and image processing.                               |
| Request timeout    | 60s       | Uploads and Places calls finish well within this.                                       |
| `TRUST_PROXY_HOPS` | 1         | Cloud Run's front end appends one trusted `X-Forwarded-For` hop.                        |

The service allows unauthenticated invocations: the API is public and enforces its own auth.

After a deploy, check `GET <service-url>/healthz` returns `{"status":"ok"}` and that the app can browse stands.

### Rollback

Every deploy is a new revision. To roll back, send all traffic to the previous one:

```bash
gcloud run revisions list --service taco-hunt-api --project "$PROJECT_ID" --region "$REGION"
gcloud run services update-traffic taco-hunt-api --project "$PROJECT_ID" --region "$REGION" \
  --to-revisions <previous-revision>=100
```

A database migration is not rolled back by this; write a forward fix migration instead.

## First admin

After the owner signs up in the production app, bootstrap the admin role from a trusted machine with the migration credential (never the runtime one):

```powershell
$env:ADMIN_DATABASE_URL = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
pnpm --filter @taco-hunt/api admin:bootstrap <user-uuid>
Remove-Item Env:ADMIN_DATABASE_URL
```

## Maintenance jobs

`media:cleanup` and `places:refresh` are TypeScript scripts that are not part of the production image. Run them from a trusted machine with the production variables loaded only in that process, preview mode first. Scheduling them (Cloud Run Jobs + Cloud Scheduler) is a later step if manual runs become a chore.

## Android release builds

`apps/mobile/eas.json` has three profiles:

| Profile       | Output | Use                                                                   |
| ------------- | ------ | --------------------------------------------------------------------- |
| `development` | APK    | Dev client for local work (`environment: development`).               |
| `preview`     | APK    | Release build against production, installed directly for smoke tests. |
| `production`  | AAB    | Upload to Google Play. Version code auto-increments on EAS.           |

`preview` and `production` read the EAS environment `production`. Set these there before the first build (`eas env:create --environment production …`):

- `EXPO_PUBLIC_API_URL` = `<service-url>/v1`
- `EXPO_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the production publishable key
- `ANDROID_MAPS_API_KEY` = the restricted Maps SDK key (secret visibility)

`EXPO_PUBLIC_MAPS_PROVIDER=google` is set in the profiles themselves.

## Backups and restore

Supabase Free has no point-in-time recovery. Export the schema and data regularly (at least before each migration):

```bash
pnpm supabase db dump --linked -f backup-schema.sql
pnpm supabase db dump --linked --data-only -f backup-data.sql
```

Keep dumps outside the repository; they contain personal data. To restore into a fresh project: create it, apply `backup-schema.sql`, then `backup-data.sql`, re-provision the runtime role password, and update the `database-url` secret. S3 objects are not touched by a database restore.

## Cost watch

Expected cost at a few hundred users is about US$0/month for Cloud Run, Secret Manager, Artifact Registry and Supabase Free, plus cents for S3. Google Places is billed per request beyond its monthly free usage and is bounded by `GOOGLE_PLACES_DAILY_CALL_LIMIT`. One-time: Google Play registration US$25. Review the first real bills after one month, and move to Supabase Pro only if pauses or the review triggers in build spec §12 are hit.
