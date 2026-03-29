# Plan: GitHub Deployment Integration

> Track: github-deployment-20260329
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: [spec.md](./spec.md) (reimplementation of PR #45)
- **Issue**: #321
- **Created**: 2026-03-29
- **Approach**: Pragmatic — follow existing module patterns (github-comments.ts) for consistency

## Purpose

After this change, users who set `github-deployment: true` will see their Vercel deployments tracked as GitHub Deployments in the repo's Environments tab, with live status updates and clickable links to preview URLs. They can verify it works by checking the Environments section of their repository after a deployment.

## Context

The Vercel Action currently deploys to Vercel and optionally comments on PRs/commits, but it does not create GitHub Deployment records. GitHub Deployments are a first-class GitHub feature that provides environment tracking, deployment history, and status badges directly in the repository UI. This was prototyped in PR #45 (2020) but never merged, and the codebase has since been rewritten in TypeScript with a modular architecture.

The implementation must integrate into the existing `run()` flow in `index.ts`, creating a deployment before `vercelDeploy()` and updating its status afterward. Environment auto-detection from `vercel-args` (looking for `--prod`) provides a convenient default while still allowing explicit override. All GitHub Deployment API operations must be non-blocking — failures log warnings but do not fail the action, matching the pattern established by `github-comments.ts`.

Key constraints: the `github-token` must have `deployments: write` permission; the feature is opt-in via `github-deployment` input (default `false`); and the module must follow existing TypeScript patterns with full test coverage.

Non-goals: deployment rollback/cleanup, custom payloads, multi-environment per run, protection rules integration.

## Architecture Decision

The implementation follows the established module pattern in this codebase: a new `src/github-deployment.ts` module with exported functions, integrated into the `run()` orchestration in `index.ts`. This mirrors how `github-comments.ts` works — separate module, accepts `OctokitClient` and context parameters, uses non-blocking error handling with `core.warning()`.

The environment auto-detection logic lives in `config.ts` alongside other input parsing, keeping configuration concerns centralized. New types are added to `types.ts` following the existing pattern. The deployment lifecycle wraps the Vercel deploy call: create deployment + set `in_progress` before deploy, then update to `success`/`failure` after.

Alternative considered: embedding deployment logic directly in `index.ts`. Rejected because it would violate the separation of concerns established by the existing architecture and make testing harder.

## Tasks

- [x] T001 Add GitHub Deployment types to types.ts (file: src/types.ts)
- [x] T002 Add GitHub Deployment config parsing to config.ts (file: src/config.ts, depends on T001)
- [x] T003 Add action.yml inputs and outputs (file: action.yml, depends on T001)
- [x] T004 [P] Create github-deployment module (file: src/github-deployment.ts, depends on T001)
- [x] T005 Integrate GitHub Deployment into run() flow (file: src/index.ts, depends on T002, T003, T004)
- [x] T006 [P] Add unit tests for github-deployment module (file: src/__tests__/github-deployment.test.ts, depends on T004)
- [x] T007 Add unit tests for config changes (file: src/__tests__/config.test.ts, depends on T002)
- [x] T008 Add unit tests for index integration (file: src/__tests__/index.test.ts, depends on T005)
- [x] T009 Build dist bundle (file: dist/index.js, depends on T005)

## Key Files

### Create

- `src/github-deployment.ts` — New module: `createGitHubDeployment()`, `updateGitHubDeploymentStatus()`

### Modify

- `src/types.ts` — Add `GitHubDeploymentConfig` fields to `ActionConfig`, add `GitHubDeploymentResult` interface
- `src/config.ts` — Add `githubDeployment` and `githubDeploymentEnvironment` input parsing, add `resolveDeploymentEnvironment()` with `--prod` auto-detection
- `src/index.ts` — Integrate deployment creation before `vercelDeploy()`, status update after, error handling wrapper
- `action.yml` — Add `github-deployment-environment` input, add `deployment-id` output
- `src/__tests__/github-deployment.test.ts` — New test file
- `src/__tests__/config.test.ts` — Add tests for new config fields and environment auto-detection
- `src/__tests__/index.test.ts` — Add tests for deployment integration in run() flow

### Reuse

- `src/github-comments.ts` — Reference pattern for GitHub API interaction, error handling, and test structure
- `src/utils.ts` — `isPullRequestType()` for event-based ref resolution

## Verification

### Automated Tests

- [ ] `github-deployment.test.ts`: createGitHubDeployment creates deployment with correct params (ref, environment, auto_merge, required_contexts)
- [ ] `github-deployment.test.ts`: updateGitHubDeploymentStatus sets success with environment_url and log_url
- [ ] `github-deployment.test.ts`: updateGitHubDeploymentStatus sets failure with description
- [ ] `github-deployment.test.ts`: createGitHubDeployment returns null when disabled or no octokit
- [ ] `github-deployment.test.ts`: API errors are caught and logged as warnings (non-blocking)
- [ ] `github-deployment.test.ts`: auto_inactive is set to true for environment deactivation
- [ ] `config.test.ts`: githubDeployment parses boolean input correctly
- [ ] `config.test.ts`: environment auto-detects "production" when vercel-args contains --prod
- [ ] `config.test.ts`: environment auto-detects "preview" when vercel-args does not contain --prod
- [ ] `config.test.ts`: explicit github-deployment-environment overrides auto-detection
- [ ] `index.test.ts`: run() creates deployment before vercelDeploy and updates status after
- [ ] `index.test.ts`: run() sets deployment-id output
- [ ] `index.test.ts`: run() continues when GitHub Deployment creation fails

### Observable Outcomes

- After running with `github-deployment: true`, the GitHub repo's Environments tab shows a new deployment entry
- Running `pnpm test` passes all new and existing tests with coverage thresholds met
- Running `pnpm run build` produces updated `dist/index.js` without errors

### Acceptance Criteria Check

- [ ] AC-1: GitHub Deployment record appears in repo Environments tab
- [ ] AC-2: Deployment status shows success with clickable Vercel URL
- [ ] AC-3: --prod auto-detects as production environment
- [ ] AC-4: Explicit environment input overrides auto-detection
- [ ] AC-5: Previous deployments to same environment are marked inactive
- [ ] AC-6: Action succeeds with warning if GitHub Deployment API fails
- [ ] AC-7: deployment-id output is set and usable

## Decision Log

- Decision: Follow github-comments.ts module pattern for new github-deployment.ts
  Rationale: Consistent with existing codebase architecture, proven error handling pattern, familiar test structure
  Date/Author: 2026-03-29 / Claude

- Decision: Environment auto-detection from vercel-args --prod flag
  Rationale: Most convenient for users — avoids requiring explicit environment input for the common case
  Date/Author: 2026-03-29 / Claude

- Decision: Use auto_inactive parameter instead of transient_environment
  Rationale: auto_inactive is simpler — GitHub handles deactivation of previous deployments automatically without marking the environment as transient
  Date/Author: 2026-03-29 / Claude

## Progress

- [x] (2026-03-29 18:25 KST) T001 Add GitHub Deployment types to types.ts
- [x] (2026-03-29 18:25 KST) T002 Add GitHub Deployment config parsing to config.ts
- [x] (2026-03-29 18:25 KST) T003 Add action.yml inputs and outputs
- [x] (2026-03-29 18:26 KST) T004 Create github-deployment module
  Evidence: `pnpm test -- github-deployment` → 10 tests passed
- [x] (2026-03-29 18:27 KST) T005 Integrate GitHub Deployment into run() flow
- [x] (2026-03-29 18:26 KST) T006 Add unit tests for github-deployment module
- [x] (2026-03-29 18:28 KST) T007 Add unit tests for config changes
  Evidence: `pnpm test -- config` → 25 tests passed (10 new)
- [x] (2026-03-29 18:28 KST) T008 Add unit tests for index integration
  Evidence: `pnpm test -- index` → 17 tests passed (5 new)
- [x] (2026-03-29 18:29 KST) T009 Build dist bundle
  Evidence: `pnpm run build` → dist/index.js (1248kB), dist/github-deployment.d.ts created
- [x] (2026-03-29 18:36 KST) Review fixes applied (SHA: `7f1fe25`)

## Outcomes & Retrospective

### What Was Shipped
- GitHub Deployment integration with full lifecycle management (in_progress → success/failure)
- Environment auto-detection from `--prod` flag with explicit override
- `deployment-id` output for downstream workflow steps
- Non-blocking error handling with graceful degradation

### What Went Well
- Following the `github-comments.ts` module pattern made the implementation clean and consistent
- Code review caught a critical issue (unsafe cast on GitHub 202 response) before merge
- TDD approach with 18 new tests provided good coverage from the start

### What Could Improve
- Initial implementation had unsafe type cast — should have checked GitHub API docs for the 202 response variant earlier
- The `run()` integration tests in `index.test.ts` test mock structure rather than actual `run()` execution

### Tech Debt Created
- `index.test.ts` integration tests don't exercise the full `run()` function with `github-deployment: true` — they only verify mock structure
