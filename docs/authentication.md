# API authentication and profile security

The API accepts public requests without a bearer token. When a token is supplied, it verifies the JWT before using its subject. It checks the signature, configured issuer, `authenticated` audience, expiry, optional not-before time, and UUID subject. It does not trust role claims from the token. The profile row in `app_private.profiles` is the source of role and account status.

The asymmetric verification endpoint and signing-key guidance follow [Supabase's JWT documentation](https://supabase.com/docs/guides/auth/jwts).

## Supabase token verification

Set `SUPABASE_URL` and `SUPABASE_JWT_ISSUER` in the API environment. For asymmetric Supabase signing keys, the API fetches the project's `/auth/v1/.well-known/jwks.json`, caches the public keys, and verifies RS256 or ES256 tokens. Unknown key IDs cause one JWKS refresh; a missing key ID is accepted only when exactly one eligible key exists.

The local Supabase stack may issue legacy HS256 tokens. In that case, set `SUPABASE_JWT_SECRET` from the local Supabase status output in the API's server-only environment. This compatibility path accepts HS256 only when the Supabase URL is loopback and `NODE_ENV` is not `production`. Keep the value out of `EXPO_PUBLIC_*`, mobile builds, logs, and source control. Prefer asymmetric signing keys in deployed environments; never configure the legacy shared secret in a mobile app. Supabase exposes public keys only for asymmetric signing and recommends short JWKS cache intervals; the API honors the response cache age but caps its local cache at ten minutes.

If the token is invalid, the API returns 401. If the JWKS service is unavailable and no unexpired cached key can verify the token, the API returns 503 so an identity-service outage is not treated as a bad user credential. Requests without a token remain available for public reads.

## Profiles and authorization

On the first verified request, the API creates a profile using only the verified `sub` as `profiles.id`. The database supplies the default `user` role and `active` status. A blocked profile receives 403. Authenticated endpoints should use `AuthRequiredGuard`; administrator endpoints should use `AdminGuard`. Obtain the acting identity with the `CurrentProfile` parameter decorator. Never take an acting `userId`, role, or status from a request body.

The T06 migration narrows the dedicated `taco_hunt_api` database role: it can insert a profile with only its ID and update only `display_name`. It cannot set a role or status. The API continues to use that dedicated runtime role; migration-owner credentials remain separate.

To grant the first administrator, sign up the account through Supabase Auth, then run the operator command with an owner-level database URL available only to the operator shell:

```powershell
$env:ADMIN_DATABASE_URL = "<operator-owned PostgreSQL connection URL>"
pnpm --filter @taco-hunt/api admin:bootstrap -- <registered-user-uuid>
Remove-Item Env:ADMIN_DATABASE_URL
```

The command verifies the supplied UUID belongs to `auth.users`, updates only that profile's role, and refuses the API runtime role. It does not expose an HTTP role-management route. Keep the owner URL in a secure shell/session and never use the runtime `DATABASE_URL` for this operation.

## Request limits

The API applies an in-process limit of 120 requests per IP per minute to all routes. Its global write guard requires authentication for every `POST`, `PUT`, `PATCH`, and `DELETE` request, then limits writes to 30 per IP and 10 per verified user per minute. It returns `Retry-After` with 429 responses, so contribution routes inherit the limits without per-controller configuration. These in-memory limits are approximate across multiple instances and reset on process restart. Database constraints remain authoritative for uniqueness and ownership.

The API trusts no proxy by default. For deployment behind a known ingress, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops in that ingress path (an integer from 1 to 10); leave it at `0` when requests reach the API directly. Verify the forwarding chain before enabling it, because the public IP limit and per-IP write limit use Fastify's resulting `request.ip`. Revisit this setting if deployment topology changes. Do not log authorization headers, signing secrets, or private profile text.
