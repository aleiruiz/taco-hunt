# packages/contracts: agent notes

Shared zod schemas and `openapi.yaml` used by both `apps/api` and `apps/mobile`. This whole package is a **shared file**: any change needs the orchestrator's decision before you edit it, because other agents may be building against the same shapes. Also read the root `AGENTS.md`.

- Prefer additive changes: new optional fields, new schemas, new endpoints. Renaming or removing a field, or making an optional field required, breaks other tasks; propose it and wait.
- Keep `src/` schemas and `openapi.yaml` in sync in the same PR.
- Never add fields that expose private data publicly (email, auth IDs, pending or rejected content) to a public response schema.
- Build with `pnpm --filter @taco-hunt/contracts build`; the API typecheck builds it too.
- If two open tasks both need contract changes, the orchestrator runs them one after another, not in parallel.
