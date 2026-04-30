# Plan: Local Vercel Build Step (`vercel-build` input)

> Track: auto-vercel-build-20260430
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: auto-vercel-build-20260430
- **Issue**: TBD (created by /please:new-track)
- **Created**: 2026-04-30
- **Approach**: New `VercelBuildRunner` module + pre-deploy step in `run()`

## Purpose

Add an opt-in `vercel-build` action input that executes the official Vercel CLI workflow (`vercel pull` → `vercel build`) inside the GitHub Actions runner before deployment, then reuses the existing prebuilt deploy path to upload `.vercel/output`. Lets users build inside CI with their own secrets/runtime instead of relying on Vercel's remote build.

## Context

The action currently has two deploy paths: API-based (default, uploads source via `@vercel/client`) and CLI-based (when `vercel-args` is provided, runs `npx vercel ...`). The `prebuilt` input already exists and routes to the API path with prebuilt upload of `.vercel/output`.

This track adds a third orchestration: when `vercel-build: true`, run `vercel pull` + `vercel build` locally first, then funnel into the existing prebuilt API path. The change is additive and opt-in — existing pipelines see no behavior change.

## Architecture Decision

**Chosen: New `src/vercel-build.ts` module + pre-deploy orchestration in `src/index.ts`** (Approach A from architecture review).

Rejected: embedding build logic inside `VercelApiClient.deploy()` (Approach B). Reasons for rejection: couples subprocess execution to the API client, violates AGENTS.md "isolate side effects at boundary," and harder to unit-test in isolation.

Key design points:
- `@vercel/client` v17 does **not** expose `build`/`pull` primitives; the SDK fallback in spec FR-5 is therefore void. We invoke the bundled `vercel` package via `@actions/exec` (same pattern as `vercel-cli.ts`).
- Mutual exclusivity (`vercel-build: true` + `prebuilt: true`) is enforced in `getActionConfig()` so the action fails before any network/IO.
- After a successful local build, the runner mutates a copy of `ActionConfig` to set `prebuilt = true`, then the existing `VercelApiClient` deploys `.vercel/output` unchanged. No changes to `vercel-api.ts` are required.
- Build failure surfaces as a custom `BuildFailedError` carrying a truncated stderr tail; the `run()` catch block recognizes this error type and posts a build-failure comment (PR or commit) before rethrowing.

## Architecture Diagram

```
run() in src/index.ts
  │
  ├─► getActionConfig()                    [config.ts]
  │     └─ validates vercelBuild XOR prebuilt   ← FR-3
  │
  ├─► [if config.vercelBuild]
  │     └─► runBuildStep(config)            [NEW: vercel-build.ts]
  │           ├─ exec: npx vercel pull --yes --environment=<target> [--scope <scope>]
  │           │       env: VERCEL_TOKEN=<token>, silent: true
  │           └─ exec: npx vercel build [--prod] [--scope <scope>] [--output <dir>]
  │                   env: VERCEL_TOKEN=<token>, ...buildEnv, silent: true
  │           ├─ throws BuildFailedError on failure (with stderr tail)
  │           └─ on success: returns { prebuilt: true, vercelOutputDir }
  │     └─► config = { ...config, prebuilt: true, vercelOutputDir }
  │
  ├─► createVercelClient(config)            [vercel.ts]   ← unchanged
  │     └─ chooses API or CLI client
  │
  └─► client.deploy(config, ctx)            [vercel-api.ts]   ← unchanged
        └─ uses existing prebuilt upload path

[catch BuildFailedError]
  └─► createBuildFailureComment(...)        [github-comments.ts]
```

## Tasks

- [x] T001 Add `vercel-build` input to action.yml and `vercelBuild` field to `ActionConfig` type (file: action.yml, src/types.ts)
- [x] T002 [P] Add unit tests for `vercel-build` input parsing in `getActionConfig()` (file: src/__tests__/config.test.ts) (depends on T001)
- [x] T003 Parse `vercel-build` input in `getActionConfig()` and enforce mutual exclusivity with `prebuilt` (file: src/config.ts) (depends on T002)
- [x] T004 [P] Add unit tests for `BuildFailedError` class (file: src/__tests__/vercel-build.test.ts)
- [x] T005 Implement `BuildFailedError` class with stderr tail capture (file: src/vercel-build.ts) (depends on T004)
- [x] T006 [P] Add unit tests for `runVercelPull()` and `runVercelBuild()` exec wrappers — covers happy path, scope propagation, build-env, target=production, exit-code failure (file: src/__tests__/vercel-build.test.ts) (depends on T005)
- [x] T007 Implement `runVercelPull()` and `runVercelBuild()` using `@actions/exec` with streamed stdout/stderr listeners (file: src/vercel-build.ts) (depends on T006)
- [x] T008 [P] Add unit tests for `runBuildStep()` orchestrator — verifies pull → build sequencing, returns `{ prebuilt, vercelOutputDir }`, propagates `BuildFailedError` (file: src/__tests__/vercel-build.test.ts) (depends on T007)
- [x] T009 Implement `runBuildStep(config)` orchestrator that calls pull + build and returns updated config fragment (file: src/vercel-build.ts) (depends on T008)
- [x] T010 [P] Add tests for build-failure comment helpers — verifies truncated tail formatting and PR/commit dispatch (file: src/__tests__/github-comments.test.ts) (depends on T009)
- [x] T011 Add `createBuildFailureCommentOnPullRequest()` and `createBuildFailureCommentOnCommit()` helpers (file: src/github-comments.ts) (depends on T010)
- [x] T012 [P] Add tests for `run()` integration — `vercel-build: true` invokes build runner before deploy and routes through prebuilt path; build failure posts comment and exits non-zero (file: src/__tests__/index.test.ts or new src/__tests__/run-build.test.ts) (depends on T011)
- [x] T013 Wire `runBuildStep()` into `run()` in src/index.ts: call before `createVercelClient`, mutate config to `prebuilt = true`, catch `BuildFailedError` to post comment then rethrow (file: src/index.ts) (depends on T012)
- [x] T014 [P] Add integration test using emulate.dev that verifies `vercel-build: true` flow end-to-end against a fixture project with `.vercel/output` (file: src/__integration__/vercel-build.test.ts) (depends on T013)
- [x] T015 Update README.md with `vercel-build` input documentation, usage example, and the official Vercel KB workflow reference (file: README.md) (depends on T013)
- [x] T016 Rebuild dist/ via `pnpm build` and commit the bundled output (file: dist/index.js) (depends on T015)

## Dependencies

```
T001 ─► T002 ─► T003
                  │
T004 ─► T005 ─────┤
                  ▼
T006 ─► T007 ─► T008 ─► T009 ─► T010 ─► T011 ─► T012 ─► T013 ─┬─► T014
                                                              │
                                                              ├─► T015 ─► T016
```

`[P]` markers indicate test-first parallel-capable tasks within their dependency cluster (RED phase can be authored while previous GREEN is being verified, but the implementation task immediately following each `[P]` test must wait for the test to be in place).

## Key Files

| Path | Role |
|---|---|
| `action.yml` | Add `vercel-build` input definition |
| `src/types.ts` | Add `vercelBuild: boolean` to `ActionConfig` |
| `src/config.ts` | Parse input + enforce mutual exclusivity in `getActionConfig()` |
| `src/vercel-build.ts` | **NEW**: `BuildFailedError`, `runVercelPull()`, `runVercelBuild()`, `runBuildStep()` |
| `src/index.ts` | Wire `runBuildStep()` into `run()` orchestrator and handle `BuildFailedError` |
| `src/github-comments.ts` | Add build-failure comment helpers |
| `src/__tests__/config.test.ts` | Cover input parsing + mutual exclusivity |
| `src/__tests__/vercel-build.test.ts` | **NEW**: Unit tests for build runner |
| `src/__tests__/github-comments.test.ts` | Cover new comment helpers |
| `src/__tests__/index.test.ts` (or new `run-build.test.ts`) | Cover `run()` integration |
| `src/__integration__/vercel-build.test.ts` | **NEW**: Emulate-based end-to-end test |
| `README.md` | Document new input + example workflow |
| `dist/index.js` | Rebuilt bundle (committed) |

## Verification

Manual verification (run after T013):

1. **Happy path (preview)**: In `example/nextjs`, set `vercel-build: 'true'`, `prebuilt: 'false'`. Run the action against a real Vercel project (preview token). Expect: log shows `vercel pull` then `vercel build` invocations, `.vercel/output` is uploaded, deployment URL returned.
2. **Happy path (production)**: Set `target: production` + `vercel-build: 'true'`. Expect: `vercel pull --environment=production` and `vercel build --prod` invoked.
3. **Mutual exclusivity**: Set `vercel-build: 'true'` AND `prebuilt: 'true'`. Expect: action fails immediately with a clear conflict message; no API calls made.
4. **Build failure**: In a fixture project, introduce a syntax error so `vercel build` fails. Expect: action exits non-zero, GitHub Actions log shows the build error, PR comment is posted with truncated tail (when `github-comment: true`).
5. **Backward compatibility**: With `vercel-build` unset (or `false`), run an existing-style deployment. Expect: identical behavior to current main branch — no `vercel pull`/`vercel build` invocations.
6. **Token redaction**: Inspect logs from steps 1–4. The Vercel token MUST NOT appear in any log line, comment, or error message.

Automated:
- `pnpm test` — all unit tests green
- `pnpm test --coverage` — coverage for new code > 80%
- `pnpm run lint` — no errors
- `pnpm run build` — clean build, no warnings

## Progress

- 2026-04-30 — T001+T002+T003 completed: `vercel-build` input added to action.yml, `vercelBuild` field added to ActionConfig, parser + mutual-exclusivity validation in getActionConfig(), 6 new tests (43 total config tests passing).
- 2026-04-30 — T004+T005 completed: `BuildFailedError` class with `fromOutput()` factory and stderr-tail capture (last 20 lines, fallback to stdout when stderr empty). 7 tests passing.
- 2026-04-30 — T006+T007 completed: `runVercelPull()` + `runVercelBuild()` via `@actions/exec`, with `--scope`, `-t <token>`, `--environment=<target>`, `--prod` (production only), `buildEnv` merged into exec env. 10 new tests (17 total in vercel-build.test.ts).
- 2026-04-30 — T008+T009 completed: `runBuildStep(config)` orchestrator runs pull → build sequentially, returns `{ prebuilt: true, vercelOutputDir }`. 4 new tests (21 total).
- 2026-04-30 — T010+T011 completed: `createBuildFailureCommentOnPullRequest()` and `createBuildFailureCommentOnCommit()` helpers in github-comments.ts. Wraps stderr tail in fenced code block, warns (does not throw) on API failure. 5 new tests (16 total in github-comments.test.ts).
- 2026-04-30 — T012+T013 completed: `run()` exported and wired with `maybeRunVercelBuild()` (no-op when vercelBuild=false; otherwise runs build then mutates config to prebuilt). BuildFailedError caught to post failure comment before rethrow. Top-level `run()` invocation guarded by `process.env.VITEST` check to prevent double-execution under tests. 3 new integration tests in run-build.test.ts. Full suite: 252 tests passing.
- 2026-04-30 — T014 completed: emulate.dev integration test (3 tests) verifying runBuildStep produces correct vercelOutputDir, end-to-end deploy through real emulator using prebuilt output, and fail-fast on pull error. Full suite: 272 tests passing.
- 2026-04-30 — T015 completed: README updated with `vercel-build` input row, "Method 4 - Build inside the action" usage example, KB workflow reference, and notes on mutual exclusivity, build-env, target=production, and failure comments.
- 2026-04-30 — T016 completed: dist/ rebuilt via `pnpm build` (4336 kB bundle). Coverage: vercel-build.ts 94.39% (> 80% NFR-4 target), overall lines 87.42%.
- 2026-04-30 — Code review fixes applied (5 findings):
  - Fix 1 (CRITICAL, security): Token now passed via `VERCEL_TOKEN` env var instead of `-t <token>` argv; added `silent: true` to ExecOptions to suppress `[command]…` echo. Validated by Vercel CLI source (packages/cli/src/commands/build/index.ts:309). 4 new tests asserting token is NOT in argv and IS in env.
  - Fix 2 (IMPORTANT, security): `escapeFencedBlock()` escapes triple-backticks in `stderrTail` to prevent fence breakout / Markdown injection in PR comments. 1 new test asserting injected ``` is escaped.
  - Fix 3+4+5 (IMPORTANT, tests): 3 new orchestration tests in run-build.test.ts — failure-comment call assertion (PR + push variants) + githubComment:false suppression.
  - dist/ rebuilt. Full suite: 280 tests passing.

## Decision Log

- **2026-04-30 — Approach A (new module) chosen over embedding in VercelApiClient.** Reason: separation of concerns, AGENTS.md compliance (boundary isolation), reuse of existing prebuilt deploy path with zero modification.
- **2026-04-30 — `@actions/exec` chosen over SDK.** Reason: `@vercel/client` v17 does not expose `build`/`pull` primitives; the spec's "SDK if available, else exec" condition resolves to "exec" deterministically.
- **2026-04-30 — Mutual exclusivity validated in `getActionConfig()`.** Reason: fail-fast at the input boundary before any network or filesystem I/O.

## Surprises & Discoveries

- `@vercel/client` v17 does **not** expose `build`/`pull` primitives — confirmed by reading the package's exports and corroborated by the official Vercel CLI source. The spec FR-5 SDK-or-exec branch resolves deterministically to "exec".
- The `[command]…` echo line in `@actions/exec` (`toolrunner.js:402-403`) writes the resolved argv to stdout *before* `setSecret` masking can fully claim it, making `-t <token>` argv unsafe even when the value is registered via `core.setSecret`. The fix is `silent: true` + `VERCEL_TOKEN` env var.
- A subtle bug emerged from the gemini-code-assist review: `vercel-output-dir` was silently ignored when combined with `vercel-build: true` (build wrote to default `.vercel/output`, deploy looked at the configured path). Caught only because reviewer asked about the spec wording.
- The `process.env.VITEST` guard pattern lets us export `run()` for testability while keeping the production fire-and-forget invocation intact.

## Outcomes & Retrospective

### What Was Shipped

- New opt-in `vercel-build` action input + new `src/vercel-build.ts` module (BuildFailedError, runVercelPull, runVercelBuild, runBuildStep)
- Mutual-exclusivity validation against `prebuilt` at config parse time
- Build-failure comment helpers in `src/github-comments.ts` (PR + commit variants), with stderr-tail capture and triple-backtick escaping
- Wired into `run()` orchestrator with proper failure-comment routing
- `--output <dir>` flag passthrough so `vercel-output-dir` is honored end-to-end
- Token transport via `VERCEL_TOKEN` env var (never `-t` argv) + `silent: true` exec
- README "Method 4 - Build inside the action" section
- 33 new tests across 5 files (252 → 285 total). Coverage on `vercel-build.ts` 94%+.

### What Went Well

- **TDD pairing**: every implementation task had a RED test sibling (T002↔T003, T004↔T005, …); refactors stayed safe.
- **Vertical slicing**: each commit shipped a self-contained, testable slice (input parsing → error class → runners → orchestrator → comments → wiring → tests/docs/dist).
- **Architecture decision was sound**: the new module / orchestration pattern (Approach A) cleanly reused the existing prebuilt deploy path with zero changes to `vercel-api.ts`. AGENTS.md compliance held throughout (file ≤ 300 LOC, function ≤ 50 LOC, params ≤ 5, side-effect isolation).
- **Review feedback compounded value**: the security agent caught the `[command]` echo issue (Critical), the test agent caught 3 orchestration coverage gaps, and gemini-code-assist caught a real `--output` data-flow bug. All five findings turned into concrete improvements.

### What Could Improve

- **Spec FR-5 was too speculative**: the "use SDK if it exposes the API; else fall back to exec" condition resolved to a single branch. Should have verified `@vercel/client` capabilities during spec authoring rather than deferring to the plan phase.
- **`vercel-output-dir` interaction was overlooked in the original spec**: should have traced the data flow between build output and deploy upload at spec time. The new AC-7 fills the gap, but it took an external bot review to surface.
- **Pre-existing `-t <token>` pattern in `vercel-cli.ts`** has the same security concern as the fix applied to `vercel-build.ts`. Left for a separate hardening track to keep this PR focused, but it should be addressed.

### Tech Debt Created

- **`src/vercel-cli.ts` token transport**: still uses `-t <token>` argv. Same `[command]` echo concern. → Tracked in `tech-debt-tracker.md` for follow-up hardening track.
- **No e2e test for the `--output` data-flow bug fix**: the new unit tests cover `runVercelBuild` argv and `runBuildStep` return value, but the integration test does not yet wire a non-default `vercel-output-dir` through to a real deploy. Acceptable risk given unit coverage; revisit if regressions surface.
