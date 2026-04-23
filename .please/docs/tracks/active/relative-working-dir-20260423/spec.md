# Bug Fix: Restore relative `working-directory` support in API-based deployment

> Track: relative-working-dir-20260423
> Investigation: [investigation.md](./investigation.md)
> Issue: [#341](https://github.com/amondnet/vercel-action/issues/341)

## Overview

After v42.2.0 migrated from CLI-based to API-based deployment (PR #325), workflows that set a relative `working-directory` (e.g., `working-directory: public`) fail with:

```
Error: Provided path public is not absolute
```

`@vercel/client.createDeployment()` synchronously asserts that the `path` option is absolute. The previous CLI implementation tolerated relative paths because Node's `child_process.spawn` resolves a relative `cwd` against the parent process. The new API client has no such tolerance, and `getActionConfig()` passes the input through verbatim, so the boundary layer fails to satisfy the new downstream contract.

The breaking change was unintentional and absent from the v42.2.0 release notes. Restoring relative-path support preserves the documented contract of the `working-directory` input.

## Reproduction

1. Workflow contains `working-directory: public` (or any non-absolute path) and no `vercel-args` (so API mode is selected).
2. Action runs → `getActionConfig()` stores `workingDirectory: 'public'` raw.
3. `createVercelClient()` returns `VercelApiClient`.
4. `VercelApiClient.deploy()` → `buildClientOptions()` sets `path: 'public'`.
5. `@vercel/client.createDeployment()` validates `path` is absolute and throws.

**Expected:** Deployment proceeds, treating `public` as relative to the GitHub Actions workspace (the repo root).
**Actual:** Action exits non-zero with `Error: Provided path public is not absolute`.

Reference failing run: https://github.com/python-poetry/website/actions/runs/24625830288/job/72004584030?pr=209

## Root Cause

`src/config.ts:81` reads `working-directory` with no normalization, while every other input (`parseTarget`, `parseArchive`, `maskSecretValues`, `parseAliasDomains`) is coerced at the input boundary. The relative string flows unchanged into `src/vercel-api.ts:25` (`path`) and `src/vercel-api.ts:42` (`basePath` for prebuilt `vercelOutputDir` derivation), where `@vercel/client` rejects it. CLI mode in `src/vercel-cli.ts` is not affected because `exec.exec` forwards `cwd` to `spawn`, which resolves relative values against `process.cwd()` automatically.

See `investigation.md` Section 2 for the full causal trace.

## Requirements

### Functional Requirements

- **FR-1**: `getActionConfig()` MUST normalize the `working-directory` input so that downstream consumers always receive either an absolute path or an empty string.
- **FR-2**: A non-empty relative input MUST be resolved against `process.env.GITHUB_WORKSPACE` first, falling back to `process.cwd()` when `GITHUB_WORKSPACE` is unset or empty.
- **FR-3**: A non-empty absolute input MUST pass through unchanged (no double-prefix, no symlink resolution).
- **FR-4**: An empty input MUST stay empty so that `vercel-api.ts:25` and `vercel-cli.ts:79` retain their existing `|| process.cwd()` fallback behavior.
- **FR-5**: Prebuilt mode (`prebuilt: true`) MUST derive `vercelOutputDir` from the normalized (absolute) `workingDirectory`, so `path.join(workingDirectory, '.vercel', 'output')` produces an absolute path.
- **FR-6**: CLI-mode deployment (`vercel-args` provided) MUST continue to function with the normalized absolute path; no behavior change observable to users.

### Testing Requirements

- **TR-1** (Regression — primary): Unit test in `src/__tests__/config.test.ts` verifying `getActionConfig()` returns `'/github/workspace/public'` when `working-directory='public'` and `GITHUB_WORKSPACE='/github/workspace'`. This test MUST fail on `master` and pass after the fix.
- **TR-2**: Unit test for fallback to `process.cwd()` when `GITHUB_WORKSPACE` is unset.
- **TR-3**: Unit test for fallback to `process.cwd()` when `GITHUB_WORKSPACE` is set to empty string.
- **TR-4**: Unit test that absolute input (`'/app'`) passes through unchanged.
- **TR-5**: Unit test that empty input remains empty (preserves existing fallback chain).
- **TR-6**: Unit test for nested relative paths (`'apps/web/public'`) and parent-traversal (`'../sibling'`).
- **TR-7**: Update `src/__tests__/vercel-api.test.ts` to add: prebuilt mode produces absolute `vercelOutputDir` from a working-directory; assertion that `buildClientOptions` always emits `path.isAbsolute(callArgs.path) === true` when `workingDirectory` is non-empty.
- **TR-8**: Existing test `'uses cwd when workingDirectory is empty'` in `vercel-api.test.ts:315-327` MUST continue to pass unchanged.
- **TR-9**: CLI-mode test verifying `exec.cwd` receives the normalized absolute path (parity with API mode).

## Acceptance Criteria

- **AC-1**: A workflow with `working-directory: public` (or any relative path) deploys successfully without `Provided path X is not absolute`.
- **AC-2**: All existing tests continue to pass.
- **AC-3**: New regression tests added per TR-1 through TR-9.
- **AC-4**: `pnpm run all` (lint + build + test) succeeds.
- **AC-5**: `dist/` is rebuilt and committed (required for releases).
- **AC-6**: Conventional commit message is `fix:`-prefixed so release-please includes it in the next patch release notes.

## Out of Scope

- The unrelated `scope` input deprecation warning mentioned in the issue (separate track if needed).
- `~` expansion in `working-directory` (Node's `path.resolve` does not expand `~`; users should use `${{ github.workspace }}` or `${HOME}` in their workflow).
- Symlink resolution via `fs.realpath` (CLI mode never resolved symlinks; preserving symlinks matches established behavior).
- Refactoring `vercel-api.ts` `buildClientOptions()` beyond what is required to consume the normalized value.
- Updating the migration guide (this is a regression fix, not a breaking change).
- Updating `action.yml` description text (not load-bearing for the fix; can be addressed in a separate docs PR).
