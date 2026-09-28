# Orchestration check-in log

Append-only. Every worker check-in and every orchestrator action goes here as one line, oldest first. This is how state survives across separate Claude Code sessions and scheduled re-invocations — nothing is passed through a live chat channel.

Format: `- <UTC timestamp> · <ID or "orchestrator"> · <status> · <message>`

Example:
```
- 2026-09-28T18:00:00Z · T24 · active · Worker started in worktree ../taco-hunt-T24 on branch codex/T24-maps-cost-controls.
- 2026-09-28T18:31:00Z · orchestrator · info · Scheduled re-invocation; no state changes since last run.
```

---
