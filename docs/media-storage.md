# User media storage

User-uploaded photos (review photos, avatar photos and stand photos) live in private object storage. The API is the only component that talks to storage. The mobile app uploads through the API and reads photos through short-lived signed URLs (5 minutes). No object is ever public.

`MEDIA_STORAGE_DRIVER` selects the backend:

| Driver               | Use                                                          | Configuration                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase` (default) | Local development with the Supabase stack                    | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `REVIEW_PHOTOS_BUCKET`                                                                            |
| `s3`                 | Deployed environments (AWS S3), or any S3-compatible service | `S3_MEDIA_BUCKET`, `S3_MEDIA_REGION`, `S3_MEDIA_ACCESS_KEY_ID`, `S3_MEDIA_SECRET_ACCESS_KEY`, plus `S3_MEDIA_ENDPOINT` / `S3_MEDIA_FORCE_PATH_STYLE` for non-AWS services |

The S3 driver only uses the `S3_MEDIA_*` credentials passed to it. It never uses the default AWS credential chain (`~/.aws`, instance roles, `AWS_*` variables), so a developer's personal or administrator AWS profile can't end up powering the API.

The orphan-photo cleanup job (`pnpm --filter @taco-hunt/api media:cleanup`) uses the same driver selection.

## AWS bucket requirements

One bucket per environment, e.g. `taco-hunt-media-dev` and later `taco-hunt-media-prod`: `infra/aws/create-media-bucket.ps1 -Environment dev|prod` creates either one with the settings below (see `docs/deploy.md` for prod).

- **Block Public Access:** all four settings enabled.
- **Object Ownership:** `BucketOwnerEnforced` (ACLs disabled).
- **Default encryption:** SSE-S3 (`AES256`). The driver also requests `AES256` on every upload.
- **Bucket policy:** deny any request that is not over TLS.

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "DenyInsecureTransport",
        "Effect": "Deny",
        "Principal": "*",
        "Action": "s3:*",
        "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
        "Condition": { "Bool": { "aws:SecureTransport": "false" } }
      }
    ]
  }
  ```

- **Lifecycle:** abort incomplete multipart uploads after 7 days. Orphaned objects are removed by the cleanup job, not by lifecycle expiry, because claimed photos must persist.
- **No CORS:** browsers and the app never talk to the bucket directly, except to `GET` a presigned URL, which needs no CORS for image loading.

## IAM identity for the API

Create a dedicated IAM user per environment, e.g. `taco-hunt-api-media-dev`, with only this inline policy. The driver requires static access keys and does not support instance or task roles:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MediaObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET/*"
    },
    {
      "Sid": "MediaListingForCleanup",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::BUCKET"
    }
  ]
}
```

- Store its access key only in the API's server-side environment (`S3_MEDIA_ACCESS_KEY_ID` / `S3_MEDIA_SECRET_ACCESS_KEY`). Never put it in an `EXPO_PUBLIC_*` variable, the repository, logs, or a PR.
- Rotate the key if it is exposed.
- Never use root account keys for the API or for day-to-day administration.

## Local S3-compatible testing

The local Supabase stack also exposes an S3-compatible endpoint (`<SUPABASE_URL>/storage/v1/s3`). `pnpm db:status` prints its access keys. To exercise the S3 driver without AWS:

```text
MEDIA_STORAGE_DRIVER=s3
S3_MEDIA_BUCKET=review-photos
S3_MEDIA_REGION=local
S3_MEDIA_ENDPOINT=http://127.0.0.1:55421/storage/v1/s3
S3_MEDIA_FORCE_PATH_STYLE=true
S3_MEDIA_ACCESS_KEY_ID=<local S3 access key>
S3_MEDIA_SECRET_ACCESS_KEY=<local S3 secret key>
```

## Moving existing photos

Object keys are the same in both drivers (`<ownerId>/<uuid>.webp`) and the database stores only keys, so moving storage is a copy, not a data migration:

1. Copy every object from the Supabase bucket to the S3 bucket with the same key.
2. Switch the API environment to `MEDIA_STORAGE_DRIVER=s3`.
3. Keep the Supabase bucket read-only until the S3 copy has been verified, then remove it.

As of this change, only local fictional test photos exist, so no copy is required.
