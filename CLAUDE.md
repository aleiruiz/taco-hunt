# Taco Hunt: working with agents

Read `docs/build-spec.md`, `docs/plan-delegacion.md`, and `docs/orchestration.md` before modifying the project.

## Implementation agents

- Work only on your assigned task ID and in your own worktree/branch `codex/<id>-<description>`.
- Each worker must be an independent Codex task/session with its own history, `threadId`, and worktree. Do not delegate implementation to subagents inside the orchestrator's thread.
- Respect the task's main area. Before touching a shared file (root `package.json`, `pnpm-lock.yaml`, root configuration, shared contracts, or another task's migrations), tell the orchestrator and wait for a decision.
- Do not modify `main` or pull in changes from another branch on your own. If you depend on another task, explain the blocker to the orchestrator.
- Send a check-in at the start, on hitting a blocker, on a contract decision, and when ready for review. State status, concrete progress, next step, and blocker.
- When finished, deliver a summary of changes, affected files, checks run, and risks. If GitHub is available, open a small PR to `main` with the task ID. Do not mix different tasks in the same PR.
- Do not include keys, passwords, tokens, or real user/venue data in the repository, logs, or PR.
- Keep the code readable: run `pnpm lint` and `pnpm typecheck` before handing off changes, and apply `pnpm format` to the files you modified. If the environment prevents running one of these, report the exact command and error in the check-in/PR.
- Do not add or run tests unless the user explicitly requests it. If a task includes tests as future work, note that in the handoff without running them.

## AI-assisted review

- CodeRabbit is the independent code reviewer for every pull request. Configure the CodeRabbit GitHub App for this repository and keep the configuration in `.coderabbit.yaml`.
- The author does not need a peer review from another agent. Do not assign a worker to review another PR's code.
- Before integrating, confirm that a completed CodeRabbit review covers the PR's exact current head SHA. A review completed before the latest push does not count. Then evaluate each finding and confirm that important findings were resolved or that the author documented why they don't apply; also check CI.
- If CodeRabbit is not installed or has not reviewed the current PR head SHA, do not treat the PR as reviewed: install/re-enable the app or request a new review, and report the blocker to the user if needed.
- CodeRabbit provides analysis and comments; it does not grant automatic approval or authorization to integrate. Integration follows this document's gates and the owner's decision.

## Orchestrator

- Keep at most three independent worker tasks active. Create them as separate Codex tasks/sessions with their own worktrees; do not use subagents inside the orchestrator session. Check `docs/orchestration-state.json` and the real task/PR status before assigning work.
- Apply the plan's dependencies. T14 waits for T01–T13 and must cover data from T18–T20; T15 waits for T14 and T17–T24; T16 waits for T15 and the external requirements.
- Do not mark a task done from the agent's summary alone: require a PR integrated into `main`, or a locally integrated change when GitHub is unavailable. Review completion requires a CodeRabbit review of the PR's current SHA and the orchestrator having verified findings and CI; it does not require a peer reviewer.
- After each integration, update the state and assign the next free task by priority. Do not reserve a worker slot for reviewing PRs; use it for the next eligible task. Prioritize T24 as soon as T17 and T21 close: it is the most likely blocker for T15 and should not wait for board priority order to reach it on its own.
- Default model for implementation workers: Claude Sonnet 5 (fast and economical). Escalate to a stronger model only if a worker is stuck across two consecutive check-in cycles, or for T02 and T14, where correctness of the shared contract and of account deletion matters more than cost.
