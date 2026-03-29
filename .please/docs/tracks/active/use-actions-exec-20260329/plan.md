# Plan: Replace execSync with @actions/exec

> Track: use-actions-exec-20260329
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: [spec.md](./spec.md)
- **Issue**: #317
- **Created**: 2026-03-29
- **Approach**: Minimal Change

## Purpose

After this change, all command execution in the codebase will use `@actions/exec` consistently, eliminating the `node:child_process` dependency from production code. This improves maintainability and leverages the toolkit's built-in logging.

## Context

The `getGitCommitMessage()` function in `src/index.ts` uses `execSync` from `node:child_process` to run `git log -1 --pretty=format:%B`. Every other command execution in the codebase uses `@actions/exec` (specifically in `src/vercel-cli.ts`). This inconsistency is unnecessary since `@actions/exec@1.1.1` provides `getExecOutput()` which returns `{ exitCode, stdout, stderr }` — a direct async replacement for `execSync`.

The function is called once, inside the already-async `getDeploymentContext()`, so converting to async has minimal ripple effect. The test file already mocks both `@actions/exec` and `node:child_process`, so the test changes involve removing the `child_process` mock and adding a `getExecOutput` mock.

Constraints: No behavior change. Error messages must remain identical.

## Architecture Decision

Replace `execSync(cmd).toString().trim()` with `await exec.getExecOutput(cmd, args).stdout.trim()`. This is the only viable approach — `@actions/exec` is already a dependency and `getExecOutput` is the exact API designed for capturing command output. No alternative approaches considered as this is a straightforward 1:1 replacement.

## Tasks

- [ ] T001 Replace execSync with getExecOutput in getGitCommitMessage (file: src/index.ts)
- [ ] T002 Update test mocks for @actions/exec.getExecOutput (file: src/__tests__/index.test.ts, depends on T001)

## Key Files

### Modify
- `src/index.ts` — Replace `execSync` import and `getGitCommitMessage()` implementation
- `src/__tests__/index.test.ts` — Remove `node:child_process` mock, add `getExecOutput` to `@actions/exec` mock

### Reuse (reference)
- `src/vercel-cli.ts` — Reference for existing `@actions/exec` usage patterns
- `node_modules/.pnpm/@actions+exec@1.1.1/node_modules/@actions/exec/lib/exec.d.ts` — `getExecOutput` API signature

## Verification

### Automated Tests
- [ ] All existing tests pass (`pnpm test`)
- [ ] No `node:child_process` imports in `src/index.ts`

### Observable Outcomes
- Running `grep -r 'child_process' src/` returns no matches in production code
- Running `pnpm test` shows all tests passing
- Running `pnpm run build` succeeds without errors

### Acceptance Criteria Check
- [ ] SC-1: No `node:child_process` imports in production source
- [ ] SC-2: All existing tests pass
- [ ] SC-3: `getGitCommitMessage()` produces identical output
- [ ] SC-4: Error handling preserves same error message format

## Decision Log

- Decision: Use `getExecOutput` over manual `exec` with listeners
  Rationale: `getExecOutput` is the official API for capturing stdout/stderr, simpler than wiring up listeners (as done in vercel-cli.ts)
  Date/Author: 2026-03-29 / Claude
