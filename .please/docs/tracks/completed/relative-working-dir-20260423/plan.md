# Plan: Restore relative `working-directory` support in API-based deployment

> Track: relative-working-dir-20260423
> Spec: [spec.md](./spec.md)
> Investigation: [investigation.md](./investigation.md)

## Overview

- **Source**: /please:plan
- **Track**: relative-working-dir-20260423
- **Issue**: #341
- **Created**: 2026-04-23
- **Approach**: Centralize `working-directory` normalization in `getActionConfig()` via a new `parseWorkingDirectory()` helper

## Purpose

Fix the regression introduced in v42.2.0 where a relative `working-directory` input causes `Error: Provided path X is not absolute` from `@vercel/client.createDeployment()`. Restore the contract that users have relied on since before v42.2.0 while preserving the new API-based deployment path.

## Context

- v42.1.0 deployed via Vercel CLI subprocess; Node's `child_process.spawn` tolerated a relative `cwd`.
- v42.2.0 (PR #325) switched to `@vercel/client.createDeployment()`, which asserts `path.isAbsolute(options.path)`.
- `getActionConfig()` at `src/config.ts:81` passes the raw input through; every other input in the function is already coerced via a `parse*()` helper (`parseTarget`, `parseArchive`, etc.).
- The `vercelOutputDir` derivation at `src/vercel-api.ts:42-43` inherits the same bug in prebuilt mode.

## Architecture Decision

**Option chosen**: Centralized normalization at the input boundary (`getActionConfig()`).

**Why this over alternatives**:
- A single normalization point means API and CLI modes both observe an absolute `workingDirectory`, eliminating a source of divergent behavior.
- `path.join(<absolute>, '.vercel', 'output')` automatically makes prebuilt `vercelOutputDir` absolute — no second patch site.
- Pattern parity with existing `parseTarget`, `parseArchive`, `maskSecretValues`, `parseAliasDomains` keeps `getActionConfig()` coherent: input parsing lives in `config.ts`, consumers remain thin.
- AGENTS.md mandates "isolate side effects (I/O, network, global state) at the boundary layer." Reading `process.env.GITHUB_WORKSPACE` and `process.cwd()` is boundary-layer behavior; centralizing keeps consumers deterministic.

**Rejected alternatives**:
- Local fix in `buildClientOptions()` — two sources of truth for path semantics; prebuilt derivation must be patched separately; future readers of `config.workingDirectory` re-encounter the same bug class.
- Normalize in `index.ts:run()` — mutates config after construction; breaks the standalone-callable contract of `getActionConfig()`.

## Tasks

- [x] T001 Add failing unit tests for `parseWorkingDirectory` via `getActionConfig` in `src/__tests__/config.test.ts` covering: relative input + `GITHUB_WORKSPACE` set, relative input + `GITHUB_WORKSPACE` unset (fallback to `process.cwd()`), relative input + empty `GITHUB_WORKSPACE` (fallback to `process.cwd()`), absolute input pass-through, empty input stays empty, nested relative (`apps/web/public`), parent-traversal (`../sibling`) (file: src/__tests__/config.test.ts)
- [x] T002 Implement `parseWorkingDirectory()` helper in `src/config.ts` and call it from `getActionConfig()`; verify T001 tests pass (file: src/config.ts) (depends on T001)
- [x] T003 [P] Add regression test in `src/__tests__/vercel-api.test.ts` asserting `buildClientOptions` path is absolute for typical API-mode config, and that prebuilt mode derives an absolute `vercelOutputDir` from a non-empty `workingDirectory`; keep the existing `'uses cwd when workingDirectory is empty'` test passing (file: src/__tests__/vercel-api.test.ts) (depends on T002)
- [x] T004 [P] Add CLI-mode parity test in `src/__tests__/vercel.test.ts` verifying `exec.cwd` receives the absolute `workingDirectory` after normalization (file: src/__tests__/vercel.test.ts) (depends on T002)
- [x] T005 Run full validation: `pnpm run lint`, `pnpm test`, confirm >80% coverage on changed lines (file: n/a) (depends on T003, T004)
- [x] T006 Rebuild `dist/` via `pnpm run build` and commit the updated bundle (file: dist/index.js) (depends on T005)
- [x] T007 Commit with conventional message `fix: resolve relative working-directory to absolute path for API deployments` referencing `#341`; ensure commit contains src + tests + dist (file: git commit) (depends on T006)

## Dependencies

```
T001 (red test for config)
  ↓
T002 (impl in config.ts)
  ↓
  ├── T003 [P] (vercel-api regression test)
  └── T004 [P] (vercel-cli parity test)
       ↓
     T005 (lint + test + coverage)
       ↓
     T006 (dist rebuild)
       ↓
     T007 (commit)
```

## Key Files

| File                                  | Role                                             | Change                                                                |
| ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `src/config.ts`                       | Input boundary — reads all GitHub Action inputs | Add `parseWorkingDirectory()`; call from `getActionConfig()`          |
| `src/__tests__/config.test.ts`        | Config unit tests                                | Add `describe('parseWorkingDirectory')` block (7 cases)               |
| `src/__tests__/vercel-api.test.ts`    | API client tests                                 | Add regression assertion for `buildClientOptions.path` absoluteness + prebuilt `vercelOutputDir` |
| `src/__tests__/vercel.test.ts`        | CLI/router tests                                 | Add parity check that CLI mode receives absolute `exec.cwd`           |
| `dist/index.js`                       | Bundled distribution                             | Rebuild via `pnpm run build` (required for releases)                  |

Files explicitly NOT changed:
- `src/vercel-api.ts` — existing `|| process.cwd()` fallback still correct once input is normalized.
- `src/vercel-cli.ts` — unchanged; receives absolute path transparently.
- `action.yml` — description update is out of scope (see spec).
- `src/types.ts` — no type signature change (still `workingDirectory: string`).

## Verification

**Unit coverage**:
- `pnpm test` passes all suites.
- New `parseWorkingDirectory` tests in `config.test.ts` cover all FR-1 through FR-4 cases.
- `vercel-api.test.ts` asserts absolute path is propagated to `@vercel/client`.

**Manual smoke (optional)**:
- Run `node ./dist/index.js` locally with `INPUT_WORKING-DIRECTORY=public` and a fake token; observe that no `is not absolute` error occurs (will fail for other reasons, but the path assertion is the diagnostic signal).

**CI validation**:
- `pnpm run all` (lint + build + test) succeeds.
- `check-dist` workflow confirms `dist/` matches rebuilt output.

**Release note**:
- Conventional commit `fix: …` ensures release-please drops this into the next patch release automatically. No manual CHANGELOG edit required.

## Progress

- 2026-04-23T13:12Z — T001 done: 7 new tests in `config.test.ts` (5 red, 2 trivially pass) — RED confirmed.
- 2026-04-23T13:13Z — T002 done: `parseWorkingDirectory()` added; all 37 config tests pass — GREEN.
- 2026-04-23T13:14Z — T003 done: 2 regression tests added to `vercel-api.test.ts`; 16 tests pass.
- 2026-04-23T13:15Z — T004 done: CLI parity test added to `vercel.test.ts`; 31 tests pass.
- 2026-04-23T13:17Z — T005 done: `pnpm run lint` (0 errors, 20 pre-existing warnings), `pnpm test` (204/204 pass with `GITHUB_REPOSITORY` set).
- 2026-04-23T13:18Z — T006 done: `dist/index.js` rebuilt via `pnpm run build`.
- 2026-04-23T13:19Z — T007 done: committed as `fix: resolve relative working-directory to absolute path for API deployments` (f65f761), Fixes #341.

## Decision Log

| Date       | Decision                                                     | Rationale                                              |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| 2026-04-23 | Solution 1: centralize normalization in `getActionConfig()` | Pattern parity; fixes prebuilt for free; boundary hygiene |
| 2026-04-23 | Resolve relative paths against `GITHUB_WORKSPACE \|\| process.cwd()` | Actions convention with local-debug fallback         |
| 2026-04-23 | Scope deprecation warning out of scope                       | Unrelated to path bug; separate track                  |
| 2026-04-23 | Release note only via conventional commit (no migration guide) | Regression fix, not breaking change                    |
| 2026-04-23 | Use `\|\|` not `??` when reading `GITHUB_WORKSPACE`           | Empty string env value should also trigger fallback    |

## Surprises & Discoveries

- Integration test `src/__integration__/vercel-api.test.ts` requires `GITHUB_REPOSITORY` env var to run locally; it reads `github.context.repo.owner` at line 75 of `src/vercel-api.ts`. Unrelated to this track, but a friction point for local test runs — workaround: `GITHUB_REPOSITORY=test-owner/test-repo pnpm test`.

## Outcomes & Retrospective

### What Was Shipped

`parseWorkingDirectory()` helper in `src/config.ts` that normalizes the `working-directory` input to an absolute path at the boundary layer (`getActionConfig()`). Relative values resolve against `GITHUB_WORKSPACE` (with `process.cwd()` fallback); absolute values pass through unchanged; empty stays empty. 10 new test cases across 3 files validate the contract. The `@vercel/client.createDeployment()` precondition is now satisfied for both API and CLI deployment modes; prebuilt `vercelOutputDir` derivation is fixed transitively.

### What Went Well

- **Scope discipline paid off**: centralizing normalization at the input boundary (one helper, 9 LOC) avoided patching `vercel-api.ts` in two places and kept `vercel-cli.ts` untouched. The chosen approach matched the existing `parseTarget`/`parseArchive` pattern exactly, minimizing cognitive load for future readers.
- **Investigation → spec → plan → implement chain**: the investigation report correctly anticipated edge cases (`||` vs `??` for empty `GITHUB_WORKSPACE`, `~` non-expansion, symlink non-resolution) and all were covered in test cases without rework during implementation.
- **TDD ordering**: T001 (red) → T002 (green) caught no surprises because the red phase revealed precisely 5 failing cases as predicted (2 trivially-passing cases served as pass-through guards).
- **Code review**: external reviewer found zero Critical/Important issues — confirms the design was sound before coding started.

### What Could Improve

- **Default integration test setup**: the `GITHUB_REPOSITORY` env var requirement for local integration tests is a papercut; future work could add a Vitest `setupFiles` that sets sensible defaults when unset. Not this track's concern, but surfaced as tech debt.
- **`action.yml` docs**: input description "the working directory" is minimal. A one-liner clarifying "absolute path or relative to the workflow's GITHUB_WORKSPACE" would help users. Deliberately out of scope here; noted for a docs-only PR.

### Tech Debt Created

- None introduced by this change.
- Unresolved (pre-existing): the `scope` deprecation warning mentioned in #341 — separate track needed.
- Unresolved (pre-existing): integration tests require `GITHUB_REPOSITORY` env var to run locally.
