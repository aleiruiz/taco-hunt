# Taco Hunt Orchestration

The orchestrator operates in the main Codex task. Every worker must be a separate, user-visible Codex task/session with its own history and worktree in the repository. Do not use subagents within the orchestrator task as implementation workers. `docs/plan-delegacion.md` defines priorities and dependencies; `docs/orchestration-state.json` tracks assignments and integration status. The limit is **three active worker tasks**; coordination in the main task does not use one of those slots.

## Worker cycle

1. Select the highest-priority available task whose dependencies are integrated into `main`. Prefer tasks with separate areas and stable contracts.
2. Create an independent Codex task/session in its own worktree based on the latest `main`, with its ID, scope, owned files, acceptance criteria, and check-in format. Record its `threadId`, worktree, and branch. Do not spawn a subagent in the orchestrator session for this work.
3. Check progress at least every 30 minutes while a task is active. If there is a prolonged silence, ask for an update once and record a blocker if it persists; do not create a second task for the same ID.
4. When the author opens a PR, confirm that CodeRabbit completed a review of the exact current PR head commit. A review completed before the latest push does not count. If the app is not installed or has not reviewed the current head, resolve that integration or report the blocker to the user.
5. The orchestrator evaluates CodeRabbit findings against the specification, contracts, security, migrations, and compatibility with other branches. The author fixes important findings or documents why they do not apply. The orchestrator also checks CI and confirms that important findings are resolved.
6. Integrate the PR only after CodeRabbit reviewed the current head, CI passed, and important findings were resolved. Update `main`, the JSON state, and task dependencies. Refill the worker slot with the next available task.

CodeRabbit is the independent code reviewer for every PR. Do not assign peer reviewers or reserve worker capacity for reviewing another agent's code. The orchestrator checks AI findings and CI as part of integration; this verification is not a second peer review. CodeRabbit does not approve or merge changes automatically. If there is no completed review of the current PR head, the PR remains unreviewed and must not be integrated.

## Statuses and check-ins

Task statuses are `blocked`, `ready`, `active`, `review`, `changes_requested`, `merged`, and `external_blocked`. Only `merged` unblocks dependent tasks. An agent reports: `ID · status · concrete progress · next step · blocker/decision · PR (if any)`. The orchestrator verifies the report against Git, the PR, and CI; a check-in does not close a task.

Scheduled coordination checks messages and PRs every 30 minutes. If nothing has changed and no action is available, remain silent. Notify the user when a decision is needed, an external blocker arises, a significant set of changes is integrated, or a phase is complete.

## Integration gates

- The branch is based on the latest integrated state, or synchronized before merge if the base has advanced.
- The change is limited to one task ID; coordinate changes to shared files.
- CodeRabbit has completed a review of the exact current PR head commit, important findings are fixed or justified by the author, and CI passes. If CI does not exist yet, perform the checks agreed on in the PR. Peer review is not required.
- No secrets or private data are published. Migrations retain a reproducible path.
- The orchestrator integrates in dependency order and updates the task board after each merge.

Do not integrate T14 until T01–T13 are integrated. T15 waits for T14; T16 waits for T15 and E03/E04. E01/E02 are required for the physical-device checks in T15.

## Initial wave API contract

The current API uses Fastify directly and will be adapted in T02. Until T02 integrates the shared contracts, the mobile app consumes these response shapes through its own adapter:

- `GET /healthz` → `{status:"ok"}` or 503 `{status:"unavailable"}`.
- `GET /v1/taco-types` → `{items:[{id,slug,nameEs}]}`.
- `GET /v1/spots` accepts `north,south,east,west,q,tacoType,limit,cursor` and returns `{items, nextCursor}`. Each item has `id,name,neighborhood,latitude,longitude,lastVerifiedAt,reviewCount,bestTaco`.
- `GET /v1/spots/:id` returns `id,name,neighborhood,latitude,longitude,lastVerifiedAt,tacos`.
- Known HTTP errors: `{error:{code,message}}`, with `VALIDATION_ERROR`, `NOT_FOUND`, and `SERVICE_UNAVAILABLE`.

T02 publishes the shared contract and communicates any changes to T03. T05 fixes pagination and filters without requiring T03 to stop using its adapter.
