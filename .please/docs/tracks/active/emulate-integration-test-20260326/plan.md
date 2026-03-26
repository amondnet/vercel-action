# Plan: Integration Tests with emulate.dev

> Track: emulate-integration-test-20260326
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: emulate-integration-test-20260326
- **Created**: 2026-03-26
- **Approach**: Two-layer testing (direct fetch for Vercel API + GitHub Octokit) against emulate.dev

## Purpose

Add integration tests using [emulate.dev](https://emulate.dev) — a local, stateful API emulator from Vercel Labs. This enables end-to-end validation of API interactions without hitting production endpoints or requiring network access.

## Context

### Current State
- Unit tests use Vitest with `vi.mock()` for all external dependencies
- No integration tests exist; example workflows serve as manual E2E validation
- All Vercel interactions go through CLI (`npx vercel`), not direct HTTP
- GitHub API uses Octokit via `@actions/github.getOctokit()` with hardcoded base URL

### Key Constraints
- emulate.dev provides stateful Vercel API (port 4000) and GitHub API (port 4001)
- `@vercel/sdk` supports `serverURL` option for custom API endpoints
- `@actions/github.getOctokit()` supports `baseUrl` option for custom endpoints

## Architecture Decision

**Two test layers against emulate.dev using official SDK clients:**

1. **Vercel API integration tests** — Use direct `fetch` calls with `Authorization: Bearer <token>` headers against `http://localhost:4000` to test deployment creation, retrieval, and domain/alias management. (`@vercel/sdk` was evaluated but dropped due to strict Zod validation that rejects emulate.dev responses.)

2. **GitHub API integration tests** — Create Octokit client with `baseUrl: http://localhost:4001` and test the action's comment functions (`createCommentOnPullRequest`, `createCommentOnCommit`) against emulate.dev's stateful GitHub API.

**Why direct fetch instead of `@vercel/sdk`?** The SDK's Zod validation layer is too strict for emulate.dev's responses — it rejects fields the emulator omits or approximates. Direct `fetch` with manual JSON parsing provides the same coverage without validation friction.

**Why Vitest Projects?** [Vitest Projects](https://vitest.dev/guide/projects) allow defining `unit` and `integration` as separate projects in a single `vitest.config.ts`, with independent `include` patterns, `globalSetup`, and timeouts. This is cleaner than maintaining separate config files.

## Tasks

### Phase 1: Infrastructure Setup

- [x] T-1: Install dependencies and create Vitest globalSetup
  - `pnpm add -D emulate` (note: `@vercel/sdk` was evaluated but dropped — see Architecture Decision section)
  - Create `src/__integration__/global-setup.ts` using emulate's programmatic API (`createEmulator`)
  - Start Vercel (port 4000) and GitHub (port 4001) services in `setup()`
  - Tear down in `teardown()`
  - **Files**: `src/__integration__/global-setup.ts`, `package.json`
  - **Verify**: `pnpm test:integration` starts emulate.dev and exits cleanly

- [x] T-2: Configure Vitest Projects for unit and integration test separation
  - Refactor `vitest.config.ts` to use [Vitest Projects](https://vitest.dev/guide/projects)
  - Define `unit` project: `include: ['src/__tests__/**/*.test.ts']`, existing coverage thresholds
  - Define `integration` project: `include: ['src/__integration__/**/*.test.ts']`, `globalSetup: 'src/__integration__/global-setup.ts'`, extended timeouts
  - Add `test:unit` and `test:integration` scripts using `vitest run --project unit` / `--project integration`
  - Keep `test` script running all projects (both unit + integration)
  - **Files**: `vitest.config.ts`, `package.json`
  - **Verify**: `pnpm test:integration` runs only integration tests, `pnpm test:unit` runs only unit tests

- [x] T-3: Create emulate.config.yaml seed data
  - Define tokens, Vercel users/teams/projects, GitHub users/repos
  - Seed data should match action's typical usage (org ID, project ID, repo owner/name)
  - Create shared test helpers (`src/__integration__/helpers.ts`) with Vercel SDK and Octokit client factories
  - **Files**: `emulate.config.yaml`, `src/__integration__/helpers.ts`
  - **Verify**: emulate.dev starts with seed data populated

### Phase 2: Vercel API Integration Tests

- [x] T-4: Test deployment creation and retrieval via direct fetch
  - Use direct `fetch` with `Authorization: Bearer <token>` against `http://localhost:4000`
  - `POST /v13/deployments` — create deployment, verify response structure
  - `GET /v13/deployments/:id` — retrieve by ID via `VercelApiClient.inspect()`
  - **Files**: `src/__integration__/vercel-api.test.ts`
  - **Verify**: Deployment lifecycle endpoints return expected shapes

- [x] T-5: Test domain and alias management via direct fetch
  - `POST /v9/projects/:id/domains` — add domain to project
  - `GET /v9/projects/:id/domains` — list project domains
  - `POST /v9/projects/:id/domains/:domain/verify` — verify domain
  - `POST /v2/deployments/:id/aliases` — assign alias (skips gracefully if emulator returns 404)
  - **Files**: `src/__integration__/vercel-api.test.ts`
  - **Verify**: Domain creation, listing, verification, and alias assignment work via direct fetch

### Phase 3: GitHub API Integration Tests

- [x] T-6: Test PR comment creation and update
  - Create Octokit client with `baseUrl: http://localhost:4001`
  - Test `issues.createComment` → verify comment appears in `issues.listComments`
  - Test `issues.updateComment` → verify comment body is updated
  - Test the find-previous-comment pattern used by the action
  - **Files**: `src/__integration__/github-pr-comments.test.ts`
  - **Verify**: Full PR comment create/find/update cycle works against emulated API

- [x] T-7: Test commit comment creation and update
  - Test `repos.createCommitComment` → verify in `repos.listCommentsForCommit`
  - Test `repos.updateCommitComment` → verify body update
  - Test the find-previous-comment pattern for push events
  - **Files**: `src/__integration__/github-commit-comments.test.ts`
  - **Verify**: Full commit comment create/find/update cycle works against emulated API

### Phase 4: CI Integration

- [x] T-8: Add integration test job to CI workflow
  - Add `test:integration` job to `.github/workflows/ci.yml`
  - Same Node.js/pnpm setup as existing test job
  - Runs `pnpm test:integration`
  - **Files**: `.github/workflows/ci.yml`
  - **Verify**: CI pipeline includes integration test step

## Key Files

| File | Purpose |
|---|---|
| `src/__integration__/global-setup.ts` | Vitest globalSetup — starts/stops emulate.dev |
| `src/__integration__/helpers.ts` | Shared test helpers (Vercel SDK + Octokit client factories) |
| `vitest.config.ts` | Vitest config with unit + integration projects |
| `emulate.config.yaml` | Seed data for emulate.dev |
| `src/__integration__/vercel-deployments.test.ts` | Vercel deployment integration tests via SDK |
| `src/__integration__/vercel-domains.test.ts` | Vercel domain/alias integration tests via SDK |
| `src/__integration__/github-pr-comments.test.ts` | GitHub PR comment integration tests |
| `src/__integration__/github-commit-comments.test.ts` | GitHub commit comment integration tests |
| `.github/workflows/ci.yml` | CI pipeline with integration test job |

## Verification

1. `pnpm test:unit` — existing unit tests still pass
2. `pnpm test:integration` — all integration tests pass
3. `pnpm test` — both unit and integration projects pass
4. No external network calls during integration tests
5. CI workflow runs both unit and integration tests

## Progress

_(Updated by /please:implement)_

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-26 | Use `@vercel/sdk` with `serverURL` | Type-safe SDK with configurable endpoint; CLI has no API redirect mechanism |
| 2026-03-26 | Vitest Projects (not separate config) | Single `vitest.config.ts` with `unit` + `integration` projects; cleaner than separate config files |
| 2026-03-26 | `src/__integration__/` directory | Clear separation from unit tests in `src/__tests__/` |

## Surprises & Discoveries

- Vercel CLI has no `VERCEL_API` env var for custom API endpoints
- `@vercel/sdk` Zod validation is too strict for emulate.dev responses — switched to direct fetch
- `@actions/github.getOctokit()` bakes `baseUrl` at module load via `.defaults()` — used `@octokit/rest` directly instead
- emulate.dev has a programmatic API (`createEmulator`) ideal for Vitest globalSetup
- emulate.dev v0.2.0 does not support GitHub Deployments API endpoints (404)

## Outcomes & Retrospective

### What Was Shipped
- Integration test infrastructure with emulate.dev (Vitest Projects, globalSetup, seed config)
- Vercel API contract tests (deployments, domains)
- GitHub API integration tests (PR comments, commit comments)
- CI pipeline integration (`test:integration` job)
- GitHub Deployments API tests (gracefully skip until emulate.dev adds support)

### What Went Well
- emulate.dev's programmatic API made Vitest integration seamless
- Vitest Projects cleanly separated unit and integration concerns
- Seed config approach keeps tests deterministic

### What Could Improve
- `@vercel/sdk` couldn't be used due to strict Zod validation vs emulator responses — future emulate.dev versions may fix this
- `@actions/github` defaults pattern required using `@octokit/rest` directly

### Tech Debt Created
- GitHub Deployments API tests are stubs (skip when unsupported) — revisit when emulate.dev adds support
- Decision log still references `@vercel/sdk` approach that was changed to direct fetch
