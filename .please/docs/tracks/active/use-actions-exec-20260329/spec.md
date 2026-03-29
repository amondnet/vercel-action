# Replace execSync with @actions/exec

> Track: use-actions-exec-20260329

## Overview

Replace the `execSync` call from `node:child_process` in `src/index.ts` with `@actions/exec` from the GitHub Actions toolkit. This aligns all command execution in the codebase to use the same library, improving consistency and leveraging the toolkit's built-in logging and error handling.

## Scope

- Replace `execSync('git log -1 --pretty=format:%B')` in `getGitCommitMessage()` with async `@actions/exec.getExecOutput()`
- Convert `getGitCommitMessage()` from sync to async
- Remove `import { execSync } from 'node:child_process'` from `src/index.ts`
- Update all callers of `getGitCommitMessage()` to await the result

## Success Criteria

- [ ] SC-1: No `node:child_process` imports remain in production source code
- [ ] SC-2: All existing tests pass without modification (or with minimal test updates for async signature)
- [ ] SC-3: `getGitCommitMessage()` produces identical output as before
- [ ] SC-4: Error handling preserves the same error message format

## Constraints

- No external behavior change — deployment output, PR comments, and error messages must remain identical
- `@actions/exec` is already a dependency; no new dependencies required

## Out of Scope

- Refactoring exec patterns in `src/vercel-cli.ts` (already uses `@actions/exec`)
- Adding new features or changing command execution logic
- Modifying the Vercel CLI invocation patterns
