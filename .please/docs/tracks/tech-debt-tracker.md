# Tech Debt Tracker

> Tracked across all tracks. Updated during implementation and retrospectives.

## Active

| ID | Source Track | Description | Priority | Created |
|----|------------|-------------|----------|---------|
| TD-001 | auto-vercel-build-20260430 | `src/vercel-cli.ts` passes the Vercel token via `-t <token>` argv, which @actions/exec echoes to stdout via the `[command]…` line before secret masking can fully claim it. Apply the same `VERCEL_TOKEN` env + `silent: true` pattern that was applied to `src/vercel-build.ts`. | medium | 2026-04-30 |
| TD-002 | auto-vercel-build-20260430 | Integration test for `vercel-build` does not yet wire a non-default `vercel-output-dir` end-to-end through a real deploy. Unit tests cover argv + return-value separately. Revisit if regressions surface. | low | 2026-04-30 |

## Resolved

| ID | Source Track | Description | Resolved In | Date |
|----|------------|-------------|-------------|------|
