# Taco Hunt: working with agents

Read `docs/build-spec.md`, `docs/plan-delegacion.md`, and `docs/orchestration.md` before modifying the project.

## Implementation agents

- Work on one task ID at a time, in that task's own worktree/branch `codex/<id>-<description>`. Do not mix changes from different task IDs in the same worktree, commit, or PR.
- The orchestrator session may implement tasks itself, sequentially, one task in progress at a time — each still isolated by its own git worktree/branch. This replaces the earlier requirement that every worker be a separate Codex task/session; a standalone worker session is still fine when the owner explicitly starts one, but the orchestrator is no longer required to spin one up for every task.
- Respect the task's main area. Before touching a shared file (root `package.json`, `pnpm-lock.yaml`, root configuration, shared contracts, or another task's migrations), record the decision in `docs/orchestration-log.md` before proceeding.
- Do not modify `main` directly outside of merging an approved PR. If a task depends on another task, wait for that task's PR to merge before branching for the dependent work.
- Log a check-in in `docs/orchestration-log.md` at the start of a task, on hitting a blocker, on a contract decision, and when a PR is opened. State status, concrete progress, next step, and blocker.
- When finished, deliver a summary of changes, affected files, checks run, and risks. If GitHub is available, open a small PR to `main` with the task ID. Do not mix different tasks in the same PR.
- Do not include keys, passwords, tokens, or real user/venue data in the repository, logs, or PR.
- Keep the code readable: run `pnpm lint` and `pnpm typecheck` before handing off changes, and apply `pnpm format` to the files you modified. If the environment prevents running one of these, report the exact command and error in the check-in/PR.
- Do not add or run tests unless the user explicitly requests it. If a task includes tests as future work, note that in the handoff without running them.

## Mobile design system

- `apps/mobile/src/theme.ts` is the single source of truth for colors, spacing, radii, and typography in the mobile app. Never declare a local `colors`/`spacing` const in a screen or component, and never hardcode a hex color, even one already used elsewhere — import from `@/theme` instead. If a screen needs a shade the theme doesn't have, add it to `theme.ts` as a named token in the same PR rather than inlining it.
- Use the shared components in `apps/mobile/src/components/` (`Button`, `Card`, `Chip`) for anything that matches their pattern: a tappable action, a bordered content container, or a filter/selector pill. Don't hand-roll a new `Pressable`+`StyleSheet` pair that duplicates one of these.
- If an existing UI genuinely needs a visual treatment the shared components don't support (see `admin.tsx`'s moderation actions, intentionally left out of `Button` in T29 because its approve/reject color semantics differ from the consumer app's primary/danger meaning), either extend the shared component's API or document in the PR why it was left local — don't silently reintroduce ad hoc styling.
- A task that touches mobile screens is expected to leave the design system more consistent, not less. If you add a new screen, build it from `theme.ts` and the shared components from the start.

## AI-assisted review

- CodeRabbit is the independent code reviewer for every pull request. Configure the CodeRabbit GitHub App for this repository and keep the configuration in `.coderabbit.yaml`.
- The author does not need a peer review from another agent. Do not assign a worker to review another PR's code.
- Before integrating, confirm that a completed CodeRabbit review covers the PR's exact current head SHA. A review completed before the latest push does not count. Then evaluate each finding and confirm that important findings were resolved or that the author documented why they don't apply; also check CI.
- If CodeRabbit is not installed or has not reviewed the current PR head SHA, do not treat the PR as reviewed: install/re-enable the app or request a new review, and report the blocker to the user if needed.
- CodeRabbit provides analysis and comments; it does not grant automatic approval or authorization to integrate. Integration follows this document's gates and the owner's decision.

## Orchestrator

- Work through tasks one at a time in this session (or, when the owner explicitly starts one, hand a task to a separate worker session), keeping each task in its own worktree/branch. Check `docs/orchestration-state.json` and the real task/PR status before picking up work.
- Apply the plan's dependencies. T14 waits for T01–T13 and must cover data from T18–T20; T15 waits for T14 and T17–T24; T16 waits for T15 and the external requirements.
- Do not mark a task done from your own summary alone: require a PR integrated into `main`, or a locally integrated change when GitHub is unavailable. Review completion requires a CodeRabbit review of the PR's current SHA and the orchestrator having verified findings and CI; it does not require a peer reviewer.
- For every PR you have open, periodically check for new CodeRabbit findings and human comments (not just at merge time). Evaluate each finding, resolve it or document why it doesn't apply, and log the outcome in `docs/orchestration-log.md` before moving on or considering the PR ready to merge.
- After each integration, update the state and pick up the next free task by priority. Prioritize T24 as soon as T17 and T21 close: it is the most likely blocker for T15 and should not wait for board priority order to reach it on its own.
- Default model: Claude Sonnet 5 (fast and economical). Escalate to a stronger model only if stuck across two consecutive check-in cycles, or for T02 and T14, where correctness of the shared contract and of account deletion matters more than cost.
