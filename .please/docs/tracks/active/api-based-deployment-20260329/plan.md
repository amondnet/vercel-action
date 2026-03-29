# Plan: Migrate to API-based Deployment

> Track: api-based-deployment-20260329
> Spec: [spec.md](./spec.md)

## Overview
- **Source**: /please:plan
- **Track**: api-based-deployment-20260329
- **Created**: 2026-03-29
- **Approach**: Extend existing VercelClient strategy pattern; add @vercel/client as dependency; implement deploy() via createDeployment async generator; add new action inputs; route via vercel-args presence

## Purpose

Replace CLI exec-based deployment with programmatic @vercel/client API to eliminate stdout parsing, reduce fragility, and enable typed action inputs.

## Context

- `VercelClient` interface already has two implementations (CLI + API stub)
- `VercelApiClient.deploy()` currently throws 'not implemented'
- `createVercelClient()` factory always returns CLI client
- Integration tests use emulate.dev with Vercel API emulator
- `@vercel/client` v17.x is published on npm (Apache-2.0, Node 20+)

## Architecture Decision

Extend existing strategy pattern. `createVercelClient()` selects client based on `vercelArgs` presence. No new abstractions needed.

## Phases & Tasks

### Phase 1: Foundation — Add dependency and extend types

- [x] T-1: Add `@vercel/client` dependency (pinned version)
- [x] T-2: Extend `ActionConfig` with new fields: `target`, `prebuilt`, `force`, `env`, `buildEnv`, `regions`, `archive`, `rootDirectory`, `autoAssignCustomDomains`, `customEnvironment`, `isPublic`, `withCache`
- [x] T-3: Add new inputs to `action.yml` with descriptions and defaults
- [x] T-4: Update `config.ts` — parse new inputs in `getActionConfig()`, add env/buildEnv multiline parser
- [x] T-5: Unit tests for new config parsing (env multiline, boolean inputs, defaults)

### Phase 2: Core — Implement API deployment

- [x] T-6: Implement `VercelApiClient.deploy()` using `@vercel/client` `createDeployment` — iterate async generator, log events, extract deployment URL from `ready`/`alias-assigned` event
- [x] T-7: Build `gitMetadata` from GitHub Actions context (sha, ref, actor, commit message, remoteUrl)
- [x] T-8: Map `ActionConfig` fields to `VercelClientOptions` + `DeploymentOptions`
- [x] T-9: Unit tests for `VercelApiClient.deploy()` — mock `createDeployment` generator, test event handling, error cases, URL extraction

### Phase 3: Routing — Client selection logic

- [x] T-10: Update `createVercelClient()` in `vercel.ts` — return `VercelApiClient` when `vercelArgs` is empty, `VercelCliClient` when non-empty
- [x] T-11: Unit tests for client selection routing
- [x] T-12: Update existing integration test — remove 'not implemented' assertion, add API deploy test

### Phase 4: Verification & Documentation

- [x] T-13: Run full test suite, verify all existing tests pass
- [x] T-14: Run `pnpm build` and verify `dist/` builds successfully
- [x] T-15: Update README.md — document new inputs, deprecation notice for `vercel-args`

## Key Files

| File | Change |
|------|--------|
| `package.json` | Add `@vercel/client` dependency |
| `action.yml` | Add 12 new inputs, deprecate `vercel-args` |
| `src/types.ts` | Extend `ActionConfig` interface |
| `src/config.ts` | Parse new inputs |
| `src/vercel-api.ts` | Implement `deploy()` |
| `src/vercel.ts` | Update `createVercelClient()` routing |
| `src/__tests__/config.test.ts` | New input parsing tests |
| `src/__tests__/vercel.test.ts` | API client deploy tests |
| `src/__integration__/vercel-api.test.ts` | API deploy integration test |
| `README.md` | New inputs documentation |

## Verification

1. `pnpm test` — all unit tests pass
2. `pnpm test:integration` — API deployment via emulator
3. `pnpm build` — dist/ builds without errors
4. `pnpm lint` — no lint errors

## Progress

_(Updated by /please:implement)_

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-29 | Use @vercel/client over @vercel/sdk | @vercel/client handles full deployment lifecycle (file upload, hashing, status polling); @vercel/sdk only wraps REST API |
| 2026-03-29 | Coexist with vercel-args (non-breaking) | Backward compatible — vercel-args users fall back to CLI client |
| 2026-03-29 | Map inputs to API parameter names | target, prebuilt, force, env, etc. match DeploymentOptions/VercelClientOptions types |

## Surprises & Discoveries

- `@vercel/client` is an internal Vercel package but published on npm (Apache-2.0); semver not guaranteed
- `VercelApiClient` already has `inspect()` and `assignAlias()` implemented via REST API
- `createDeployment` is an async generator yielding typed events, not a simple Promise
- `@actions/http-client` v4 is ESM-only (no CJS entry in exports), breaks ncc bundling — had to downgrade to v2.2.3
- `@vercel/client` adds +1000 transitive packages but bundles cleanly with ncc (4.3MB dist/index.js)
