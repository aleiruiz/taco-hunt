# Taco Hunt: working with agents

Read `docs/build-spec.md`, `docs/plan-delegacion.md`, and `docs/orchestration.md` before modifying the project. Each area also has its own `AGENTS.md` with area-specific rules: `apps/mobile/`, `apps/api/`, `packages/contracts/`, `supabase/`. Read the one for every area your task touches.

Work is split between several agents running in parallel, each on its own task. One orchestrator (the owner or an orchestrator session) assigns tasks, owns the plan, and integrates PRs.

## Implementation agents

- Work only on the task ID you were assigned, in your own worktree/branch `codex/<id>-<description>` created from the latest `main`. Do not pick up a task yourself; if you finish or get blocked, say so and wait for the next assignment.
- Before starting, confirm in `docs/orchestration-state.json` and `docs/plan-delegacion.md` that the task is `Ready` and its dependencies are merged into `main`. If a dependency is not merged, stop and report the blocker; do not branch from another task's branch.
- Respect the task's main area (the "Area" column in the plan). Do not edit files that belong to another open task.
- **Shared files need an orchestrator decision first:** root `package.json`, `pnpm-lock.yaml`, `apps/mobile/package-lock.json`, root configuration, `packages/contracts`, `supabase/migrations` written by another task, `apps/mobile/src/theme.ts`, `apps/mobile/src/components/`, and `apps/mobile/app/index.tsx`. Ask, wait for the answer, and list any shared file you touched under a "Shared files" heading in the PR description.
- Only the orchestrator edits `docs/plan-delegacion.md`, `docs/orchestration-state.json`, `AGENTS.md`, and `CLAUDE.md`. If the plan is wrong or incomplete, say so in your PR or check-in instead of editing it.
- **Check-ins:** `docs/orchestration-log.md` is gitignored and local to the orchestrator's machine, so other agents cannot see it. Open a **draft PR** titled `T##: <summary>` as soon as you have a first commit and post check-ins as PR comments: at the start, on a blocker, on a contract decision, and when ready for review. State status, concrete progress, next step, and blocker. The orchestrator mirrors them into the log.
- Keep your branch current: merge or rebase the latest `main` before marking the PR ready. Resolve conflicts in your own files; if a conflict is in another task's files, stop and ask.
- When finished, mark the PR ready and include a summary of changes, affected files, checks run, and risks. One task per PR; never mix task IDs in a branch, commit, or PR.
- Do not include keys, passwords, tokens, or real user/venue data in the repository, logs, or PR.
- Keep the code readable: run `pnpm lint` and `pnpm typecheck` before handing off changes, and apply `pnpm format` to the files you modified. If the environment prevents running one of these, report the exact command and error in the check-in/PR.
- Do not add or run tests unless the user explicitly requests it. If a task includes tests as future work, note that in the handoff without running them.

## Design sources

- T25–T27 (map-first home) implement `docs/design-map-first.md`.
- P2.7 mobile work (T32, T35, T39, T41, plus header, add-a-taquería, empty-state, and profile work) implements the owner-reviewed design in `docs/design-owner-feedback.md` (public canvas: https://claude.ai/artifact/9AVKB3JQW7j3UGijkxiUEv). Read the section your task maps to (see that file's task-mapping table) before writing UI. It also defines the new `theme.ts` tokens and shared components; do not invent different ones.
- Design-system rules live in `apps/mobile/AGENTS.md`.

## AI-assisted review

- CodeRabbit is the independent code reviewer for every pull request. Configure the CodeRabbit GitHub App for this repository and keep the configuration in `.coderabbit.yaml`.
- The author does not need a peer review from another agent. Do not assign a worker to review another PR's code.
- Before integrating, confirm that a completed CodeRabbit review covers the PR's exact current head SHA. A review completed before the latest push does not count. Then evaluate each finding and confirm that important findings were resolved or that the author documented why they don't apply; also check CI.
- Authors: respond to every CodeRabbit finding on your PR, either with a fix commit or a reply explaining why it does not apply.
- If CodeRabbit is not installed or has not reviewed the current PR head SHA, do not treat the PR as reviewed: install/re-enable the app or request a new review, and report the blocker to the user if needed.
- CodeRabbit provides analysis and comments; it does not grant automatic approval or authorization to integrate. Integration follows this document's gates and the owner's decision.

## Orchestrator

- Keep at most three implementation agents active at once, each on its own task, worktree, and branch. Check `docs/orchestration-state.json` and the real task/PR status before assigning work, and record the assignment (agent, branch, PR) in the state file.
- **Avoid parallel conflicts.** Do not run two tasks at the same time when both touch the same hot file:
  - `apps/mobile/app/index.tsx`: T34 and the header redesign (design §2);
  - `apps/mobile/app/spot/[id].tsx`: T39, T44, and the stand-page changes (design §4);
  - `apps/mobile/src/theme.ts` and `src/components/`: any task that adds tokens or components. Land design §9 (tokens and shared components) as its own small task before the P2.7 UI tasks that need it;
  - `packages/contracts/`: any two API tasks that change the contract;
  - `supabase/migrations/`: tasks that add migrations. Tell agents to use a unique timestamp plus the task ID in the file name.
- Apply the plan's dependencies. T14 waits for T01–T13 and must cover data from T18–T20; T15 waits for T14 and T17–T24; T16 waits for T15 and the external requirements.
- Do not mark a task done from the agent's summary alone: require a PR integrated into `main`, or a locally integrated change when GitHub is unavailable. Review completion requires a CodeRabbit review of the PR's current SHA and the orchestrator having verified findings and CI; it does not require a peer reviewer.
- For every open PR, periodically check for new CodeRabbit findings, human comments, and agent check-ins; log the outcome in `docs/orchestration-log.md`.
- After each integration, update the state and assign the next free task by priority. Do not reserve an agent slot for reviewing PRs; use it for the next eligible task. Prioritize T24 as soon as T17 and T21 close: it is the most likely blocker for T15 and should not wait for board priority order to reach it on its own.
- Default model for implementation agents: Claude Sonnet 5 (fast and economical). Escalate to a stronger model only if an agent is stuck across two consecutive check-in cycles, or for T02 and T14, where correctness of the shared contract and of account deletion matters more than cost.
