# Plan: Fix prebuilt deployment ignoring vercel-project-id

> Track: prebuilt-project-id-bug-20260408
> Spec: [spec.md](./spec.md)

## Overview
- **Source**: /please:plan
- **Track**: prebuilt-project-id-bug-20260408
- **Issue**: #330
- **Created**: 2026-04-08
- **Approach**: Add `project` field to deployment options body

## Purpose

Fix the bug where API-based deployment ignores `vercel-project-id`, causing deployments to target the wrong project in monorepo setups.

## Context

- `buildDeploymentOptions()` in `src/vercel-api.ts` builds the POST body for `POST /v13/deployments`
- The Vercel API accepts a `project` field that overrides `name` for project targeting
- `@vercel/client@17.2.65` `DeploymentOptions` type doesn't declare `project`, but it passes through via spread at runtime
- A type cast is needed: `(options as DeploymentOptions & { project?: string })`

## Architecture Decision

- **Chosen**: Pass `project` in deployment body (Solution 1 from investigation)
- **Rejected**: Setting `process.env.VERCEL_PROJECT_ID` — `@vercel/client` doesn't read it
- **Rationale**: Direct, minimal, follows Vercel API contract

## Tasks

### T-1: Add project field to buildDeploymentOptions (FR-1, FR-2)
- **File**: `src/vercel-api.ts` (lines 62-103)
- **Change**: Add conditional `project` assignment from `config.vercelProjectId`
- **Type handling**: Cast options to include `project` field since `DeploymentOptions` doesn't declare it
- **Depends on**: none

### T-2: Add unit tests for project ID passthrough (TR-1, TR-2, TR-4)
- **File**: `src/__tests__/vercel-api.test.ts`
- **Tests to add**:
  - `passes project ID in deployment options when vercelProjectId is set`
  - `omits project field when vercelProjectId is empty`
  - `passes project ID alongside vercelProjectName` (FR-2 — both can coexist)
- **Pattern**: Follow existing `passes correct deployment options` test (line 195)
- **Depends on**: T-1

### T-3: Verify existing tests pass (TR-3, AC-2, AC-4)
- **Command**: `pnpm test`
- **Depends on**: T-2

## Key Files

- `src/vercel-api.ts` — `buildDeploymentOptions()` function (primary change)
- `src/__tests__/vercel-api.test.ts` — test additions
- `src/types.ts` — `ActionConfig` type reference
- `src/config.ts` — `vercelProjectId` input reading

## Verification

- `pnpm test` — all tests pass
- `pnpm run lint` — no lint errors
- Manual: confirm `project` field appears in mock deployment call args

## Progress

| Task | Status | Notes |
|------|--------|-------|
| T-1  | DONE | Added `project` field to `buildDeploymentOptions()` |
| T-2  | DONE | Added 3 unit tests for project ID passthrough |
| T-3  | DONE | All 14 unit tests pass, lint clean |

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-08 | Pass `project` in deployment body | Direct fix following Vercel API contract; type cast needed for `@vercel/client` |

## Surprises & Discoveries

- `@vercel/client@17.2.65` `DeploymentOptions` type is missing the `project` field that the Vercel REST API accepts
- `core.exportVariable()` only affects subsequent workflow steps, not the current Node.js process
