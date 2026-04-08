# Bug Fix: Prebuilt deployment ignores vercel-project-id

> Track: prebuilt-project-id-bug-20260408
> Investigation: [investigation.md](./investigation.md)

## Overview

When using `prebuilt: true` with the API-based deployment path, the action deploys to the wrong Vercel project because `vercel-project-id` is never passed to the `@vercel/client` API. The project ID is only exported as an environment variable for CLI child processes, but the API client runs in-process and ignores it.

## Reproduction

1. Configure a monorepo with two Vercel projects linked to the same repo
2. Set `vercel-project-id` to the target project's ID
3. Run `vercel pull` and `vercel build` (both correctly use the project ID via env var)
4. Run the action with `prebuilt: true`
5. Deployment goes to the wrong project

**Expected**: Deployment targets the project specified by `vercel-project-id`
**Actual**: Deployment targets a different project resolved by name heuristic

## Root Cause

`buildClientOptions()` and `buildDeploymentOptions()` in `src/vercel-api.ts` never include `config.vercelProjectId` in the options passed to `@vercel/client`'s `createDeployment()`. The Vercel API falls back to name-based project resolution, which picks the wrong project in monorepo setups. Introduced in commit `353227b` (#325).

## Requirements

### Functional Requirements

- [ ] FR-1: Pass `vercel-project-id` to the Vercel REST API deployment request body so the correct project is targeted
- [ ] FR-2: When both `vercel-project-id` and `vercel-project-name` are set, project ID should take precedence
- [ ] FR-3: CLI fallback path must remain unaffected (env var approach still works for CLI)

### Testing Requirements

- [ ] TR-1: Unit test — `buildDeploymentOptions()` includes project ID when `vercelProjectId` is set
- [ ] TR-2: Unit test — `prebuilt: true` + `vercelProjectId` → deployment request contains project identifier
- [ ] TR-3: Unit test — verify existing CLI path tests still pass
- [ ] TR-4: Edge case — `vercelProjectId` set without `vercelProjectName`

## Acceptance Criteria

- [ ] AC-1: Deployment targets the correct project when `vercel-project-id` is set with `prebuilt: true`
- [ ] AC-2: All existing tests continue to pass
- [ ] AC-3: New tests cover the bug scenario and edge cases
- [ ] AC-4: CLI fallback path is unaffected

## Out of Scope

- Broader refactoring of `setVercelEnv()` env var approach
- Adding `process.env.VERCEL_PROJECT_ID` support to `@vercel/client`
- Changes to the Vercel CLI fallback path
