# Taco Hunt Delegation Plan

This board follows the specification in docs/build-spec.md and the repository's current state. The landing page, the initial schema, basic API reads, and the mobile list/detail screens already exist. The ngrok tunnel is a temporary view of the landing page, not a production deployment.

## Blocking rule

- A task becomes **free** when all its dependencies are closed and its input contract is agreed.
- Each worker is an independent Codex task/session, with its own history and worktree; it is not delegated as a subagent of the orchestrator's thread. Each worker modifies its own area; coordination integrates shared package.json files, pnpm-lock.yaml, root routes, and migrations that affect multiple modules.
- T00 sets a versioned baseline and the current read contract. After that, three agents can work in parallel: T01, T02, and T03. Coordination can advance T04.
- **Final closure:** T14 stays blocked until T01–T13 are closed and must cover data from T18–T20. T15 stays blocked until T14 and T17–T24 are closed — T24 (Maps/Places cost and security controls) is the candidate most at risk of lagging and should be assigned as soon as T17 and T21 close. T16 additionally requires the external launch inputs. A task being free means it can start; opening the final closure requires it to be finished.

## P0: remove the blockers preventing delegation

| ID  | Task and expected outcome                                                                                                                                                                     | Blocked by | Main area                          | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------- | ------- |
| T00 | Review and version the current baseline; fix the API's response and error shapes; assign file owners and prepare work branches.                                                              | None       | Coordination, repo root             | Closed  |
| T01 | Consolidate local Supabase: migrations, API role permissions, constraints, and ten reproducible fictional stands.                                                                            | T00        | supabase/                           | Free    |
| T02 | Adapt the API to NestJS with Fastify, create contracts and OpenAPI packages, and fix common validation and errors. The spec requires this architecture; the current API uses Fastify directly. | T00        | apps/api/ and packages/contracts/   | Free    |

## P1: first parallel product wave

| ID  | Task and expected outcome                                                                                                                                                                                      | Blocked by     | Main area                                   | Status                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------- | -------------------------------------------------------------- |
| T03 | Complete mobile discovery: search, filter by taco type, map/list, location only on request, manual area selection, detail, and offline states. May use data adapters while T05 finishes.                     | T00            | apps/mobile/app/ and src/features/discovery/ | Free                                                            |
| T04 | Add lint and type commands, reproducible CI, and document the first run. Coordination integrates shared changes; creating or running tests is pending an explicit request.                                   | T00            | .github/, root, and docs/                    | Partial: PR #4 integrated; follow-up ready for CI and E2E guide |
| T05 | Complete public reads: stable pagination, area bounds, filters, visible reviews, and reliability data; only return approved stands.                                                                           | T01 and T02    | apps/api/src/spots/ and reviews/reads        | Blocked                                                         |
| T06 | Implement server identity: verified JWT, profiles, admin role, blocks, rate limits, and key separation.                                                                                                       | T01 and T02    | apps/api/src/auth/ and profiles/             | Blocked                                                         |
| T07 | Implement sign-up, sign-in, recovery, session, and settings on mobile with Supabase Auth.                                                                                                                      | T03 and T06    | apps/mobile/src/auth/ and access routes      | Blocked                                                         |

T05 and T06 can run in parallel once T01 and T02 are closed; their modules and routes have separate owners. T07 starts once T06 closes, to integrate the mobile session against server verification.

## P2: contributions and complementary features

| ID  | Task and expected outcome                                                                                                                                                            | Blocked by     | Main area                                               | Status    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------- | --------- |
| T08 | Reviews and favorites API: scores, own edit/delete, uniqueness, history, and idempotent operations.                                                                                   | T05 and T06    | apps/api/src/reviews/ and favorites/                        | Blocked   |
| T09 | Proposals, reports, and moderation: nearby duplicates, private queue, admin actions, and audit.                                                                                        | T05 and T06    | apps/api/src/proposals/, reports/, and admin/               | Blocked   |
| T10 | Mobile screens for rating, saving, proposing, reporting, and viewing My Tacos. Use the fixed contracts and mocked data until T08 and T09 integrate.                                    | T02, T03, and T07 | apps/mobile/src/features/contributions/ and new routes  | Blocked   |
| T11 | Photo per review: validation, metadata stripping, compression, private storage, unique association, and orphaned-upload cleanup.                                                      | T06 and T08    | apps/api/src/media/ and Storage                             | Blocked   |
| T12 | HTTPS page for sharing a stand, links to the app, and privacy and moderation documents. Keep the current landing page and prepare final metadata for a stable domain.                 | T03 and T05    | apps/api/src/share/ and docs/                               | Blocked   |
| T13 | CSV import into private candidates, duplicate detection, review, and provenance documentation; no automatic publishing.                                                                | T01 and T09    | db/scripts/ or supabase/scripts/                            | Blocked   |

T08, T09, and T10 can advance in parallel with frozen contracts. T11, T12, and T13 form another parallel wave once their dependencies are released.

## P2.5: taquería discovery, proposals, and moderation

| ID  | Task and expected outcome                                                                                                                                                        | Blocked by | Main area                            | Status    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------- | --------- |
| T17 | Admin candidate discovery with Google Places for Monterrey; keep `place_id` and discovery metadata, without importing ratings, reviews, or photos.                               | T02, T06   | apps/api/src/places/ and moderation    | Blocked   |
| T18 | Taquería proposals from autocomplete or manual entry; the author sees their pending proposals, and no record gets a Taco Hunt rating before approval.                            | T02, T03, T06 | apps/api/src/proposals/ and mobile  | Blocked   |
| T19 | Moderation panel for proposals, reports, photos, and duplicates, with approve, reject, request changes, merge, and hide, plus audit.                                             | T06, T09   | apps/mobile/ and apps/api/src/admin/   | Blocked   |
| T20 | Approval and provenance flow: convert a proposal into a Taco Hunt stand, recording source, verification, moderator, and ownership fields.                                        | T18, T19   | apps/api/src/spots/ and admin          | Blocked   |
| T21 | Autocomplete for taquerías, neighborhoods, municipalities, and addresses with Google attribution and an alternative manual-entry option.                                          | T03, T17   | apps/mobile/src/features/discovery/    | Blocked   |
| T22 | Address links to Google Maps or the installed maps app, without storing routes.                                                                                                   | T03, T20   | apps/mobile/                           | Blocked   |
| T23 | Periodic review of candidates by `place_id`; send changes or closures to moderation without silently overwriting Taco Hunt data.                                                  | T17, T20   | apps/api/src/places/ and jobs          | Blocked   |
| T24 | Maps/Places cost and safety controls: restricted keys, quotas, deduplication, alerts, and an emergency shutoff.                                                                   | T17, T21   | infrastructure and docs                | Blocked   |

## P3: deliberately blocked until the end

| ID  | Task and expected outcome                                                                                                                                                                          | Blocked by                                                                                       | Status          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| T14 | Close the account lifecycle: safe and retryable deletion, cleanup of photos and private data (includes proposal/moderation/provenance data from T18–T20), aggregated telemetry, and final privacy documentation. | **All of T01–T13 closed; T18–T20 data covered**                                                    | Blocked final    |
| T15 | Full integration and acceptance: clean and existing migrations, two-user and admin flows, photo privacy, accessibility, devices, CI, container, and a reproducible guide.                           | **T14 closed; T17–T24 closed** and E01/E02 for the corresponding physical passes                    | Blocked final    |
| T16 | Real deployment and publishing, with domain and authorized data.                                                                                                                                     | **T15 closed** and E03/E04; requires owner authorization to activate resources or spend             | Blocked final    |

## External inputs: do not block independent code

| ID  | Input                                                                                                | Blocks                      |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| E01 | Sign in to Expo CLI and Expo Go on the iPhone with the same account.                                  | T15's physical iOS pass      |
| E02 | Restricted Google Maps SDK for Android key and a test device.                                         | T15's Android map pass       |
| E03 | Remote Supabase and Google Cloud accounts and configuration, secrets, domain, and cost approval.       | T16                          |
| E04 | Validated public name, stands and photos with confirmed rights, store accounts.                        | T16                          |

## Release order

1. Coordination closes T00.
2. First wave: agents on T01, T02, and T03; coordination on T04.
3. Second wave: T05 and T06; then T07. T08–T10 are released according to their dependencies.
4. T11–T13 advance in parallel once their input modules are closed.
5. T14 opens only once T01–T13 are closed and T18–T20 data is covered; T15 additionally requires T17–T24 closed; finally T16.
