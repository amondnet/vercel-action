# Plan: CLI Default with Experimental API Mode

> Track: cli-default-experimental-api-20260430
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: cli-default-experimental-api-20260430
- **Created**: 2026-04-30
- **Approach**: Add `experimental-api` boolean input. Validate mutual exclusion with `vercel-args` at config-parse time. Move routing default to CLI in `createVercelClient()` and gate the API path behind `experimentalApi`. Emit a `core.warning` when the API path is selected.

## Purpose

Make Vercel CLI the default deployment client and gate the `@vercel/client` API path behind an explicit opt-in. The API client depends on an internal Vercel package without semver guarantees, so users should opt in consciously.

## Context

- `createVercelClient()` in `src/vercel.ts:9-16` currently selects the API client when `vercelArgs` is empty. This plan inverts that default.
- `getActionConfig()` in `src/config.ts:81-117` parses all action inputs. The new `experimental-api` input is parsed here, and the mutual-exclusion check lives here too.
- `ActionConfig` in `src/types.ts:55-83` carries the parsed config across the codebase.
- Existing tests in `src/__tests__/vercel.test.ts:495-515` already cover the routing matrix and need to be updated to the new semantics.
- The previous track `api-based-deployment-20260329` is the immediate predecessor and added the typed inputs (`target`, `prebuilt`, etc.) that remain available regardless of routing default.

## Architecture Decision

**Validation lives at config-parse time; routing lives at the factory.** Splitting these two concerns keeps each file's responsibility narrow:

- `getActionConfig()` is the single place that reads inputs and produces a typed config. Cross-input validation (mutual exclusion) belongs here so it fails fast before any side effects (env var setup, octokit creation, deployment context fetching) run.
- `createVercelClient()` only decides which client to instantiate. It assumes the config it receives is already valid, which keeps the routing logic boolean-simple and purely a function of `experimentalApi`.

The factory does not re-check `vercelArgs` against `experimentalApi`; that invariant is enforced upstream. This avoids defensive duplication and surfaces the misconfiguration earlier in the run.

The experimental warning is emitted in the factory (not the constructor) because the factory is the single point that proves "API path was actually chosen for this run." Constructors of `VercelApiClient` are also instantiated by tests and would emit noise.

## Tasks

### Phase 1 — Config foundation

- [x] T001 Add `experimental-api` boolean input to `action.yml` with default `'false'` and a description explaining it gates opt-in API mode and is mutually exclusive with `vercel-args` (file: action.yml)
- [x] T002 Add `experimentalApi: boolean` field to `ActionConfig` interface (file: src/types.ts) (depends on T001)
- [x] T003 Parse the new input in `getActionConfig()` and add the mutual-exclusion error: throw a clear `Error` when both `experimental-api === 'true'` and `vercel-args` is non-empty (file: src/config.ts) (depends on T002)
- [x] T004 Add unit tests in `src/__tests__/config.test.ts` for: (a) `experimentalApi=false` default, (b) `experimentalApi=true` parses correctly, (c) mutual-exclusion error message and stack when both are set (file: src/__tests__/config.test.ts) (depends on T003)

### Phase 2 — Routing change

- [x] T005 Update `createVercelClient()` in `src/vercel.ts`: route to `VercelCliClient` by default; route to `VercelApiClient` only when `config.experimentalApi === true`; emit `core.warning` describing the experimental nature and how to opt out when API path is taken (file: src/vercel.ts) (depends on T003)
- [x] T006 Update existing routing tests in `src/__tests__/vercel.test.ts` (the `describe('createVercelClient', ...)` block): replace the two existing cases with the new four-case matrix from spec AC-1 — verify warning text in the API case, verify `core.info` text in the CLI case, verify both `vercelArgs=""` and `vercelArgs="--prod"` route to `VercelCliClient` when `experimentalApi=false` (file: src/__tests__/vercel.test.ts) (depends on T005)
- [x] T007 [P] Update `createConfig` test helper in `src/__tests__/vercel.test.ts` to include `experimentalApi: false` so the helper produces a valid `ActionConfig` after T002 (file: src/__tests__/vercel.test.ts) (depends on T002)

### Phase 3 — action.yml cleanup

- [x] T008 Replace the empty `description` of `vercel-args` in `action.yml` with a real description noting it is for ad-hoc CLI passthrough; reword the `deprecationMessage` of `scope` so it no longer claims scope is "only for CLI when vercel-args is provided" (since CLI is now the default regardless of vercel-args). Keep zeit-*/now-* deprecations untouched (file: action.yml) (depends on T001)

### Phase 4 — Documentation

- [x] T009 Add a new "Deployment Mode" section to README.md near the top of the inputs documentation: explain CLI is the default, document the `experimental-api` opt-in, surface the experimental warning, document the mutual-exclusion rule (file: README.md) (depends on T008)
- [x] T010 [P] Add a migration note to README.md (or a release-notes section) explicitly calling out that users who relied on the previous API-default must now set `experimental-api: true` to keep that behavior (file: README.md) (depends on T009)

### Phase 5 — Integration verification

- [ ] T011 Update or add an integration test in `src/__integration__/` that runs the action twice against the emulator: once with default inputs (CLI path) and once with `experimental-api: true` (API path), verifying both produce a valid `preview-url` (file: src/__integration__/vercel-api.test.ts) (depends on T005)
- [ ] T012 Run the full quality gate locally: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:integration`. Fix any failures uncovered (depends on T006, T007, T011)

## Dependencies

```
T001 ──► T002 ──► T003 ──► T004
                  │
                  └─► T005 ──► T006 ──► T012
                  │     │
                  │     └────► T011 ──► T012
                  │
                  └─► T007 [P, depends on T002] ──► T012
T001 ──► T008 ──► T009 ──► T010 [P]
```

`[P]` tasks are parallelizable with their siblings under the same dependency root.

## Key Files

| File | Change |
|------|--------|
| `action.yml` | Add `experimental-api` input; add real description to `vercel-args`; reword `scope` deprecation |
| `src/types.ts` | Add `experimentalApi: boolean` to `ActionConfig` |
| `src/config.ts` | Parse `experimental-api`; add mutual-exclusion validation in `getActionConfig()` |
| `src/vercel.ts` | Invert routing default; emit experimental warning |
| `src/__tests__/config.test.ts` | Tests for new input parsing and mutual-exclusion error |
| `src/__tests__/vercel.test.ts` | Update test config helper; rewrite routing matrix tests |
| `src/__integration__/vercel-api.test.ts` | Add CLI-default and experimental-api opt-in cases |
| `README.md` | Deployment Mode section + migration note |

## Verification

1. `pnpm lint` — no warnings
2. `pnpm typecheck` — passes
3. `pnpm test` — all unit tests pass, including the new four-case routing matrix
4. `pnpm test:integration` — emulator tests pass for both default (CLI) and `experimental-api: true` (API) paths
5. `pnpm build` — `dist/index.js` regenerated successfully
6. Manual: invoke the action with default inputs and confirm `core.info('Using CLI-based deployment')` is logged (no warning)
7. Manual: invoke the action with `experimental-api: true` and confirm `core.warning(...)` is logged exactly once
8. Manual: invoke the action with both `experimental-api: true` and `vercel-args: --prod` and confirm a clear config error is thrown before any deployment side effects

## Progress

_(Updated by /please:implement)_

## Decision Log

| Date       | Decision                                                                                       | Rationale                                                                                                                          |
|------------|------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| 2026-04-30 | Validate mutual exclusion at config-parse time (not in `createVercelClient`)                   | Fails fast before any side effects; one source of truth; easier to unit-test in isolation                                          |
| 2026-04-30 | Emit experimental warning in `createVercelClient()`, not in `VercelApiClient` constructor       | Co-located with routing decision; constructor is also called by tests and would produce warning noise                              |
| 2026-04-30 | Field naming: `experimentalApi` (camelCase) and `experimental-api` (kebab-case input)           | Matches existing convention (`vercelOrgId` / `vercel-org-id`, `autoAssignCustomDomains` / `auto-assign-custom-domains`)            |
| 2026-04-30 | Treat as semver MINOR (per user direction), not MAJOR                                          | No public API contract changes; only default behavior shifts. Document the migration in README and release notes                  |
| 2026-04-30 | Hard-fail on mutual exclusion rather than silent precedence                                    | Surfaces misconfiguration immediately; avoids surprising deployments where one input is silently ignored                           |

## Surprises & Discoveries

- The spec's FR-6 mentioned removing a `deprecationMessage` from `vercel-args`, but inspection of `action.yml:7-10` shows `vercel-args` has no `deprecationMessage` at all — only an empty description. The real cleanup target is the `scope` input (line 44), whose deprecation message references "CLI-based deployments (when vercel-args is provided)" — that conditional clause is now misleading because CLI is the default regardless of `vercel-args`. T008 captures this corrected scope.
- Existing tests in `src/__tests__/vercel.test.ts:495-515` already provide a routing test scaffold; this plan rewrites them rather than creating new files.
- `src/__tests__/vercel.test.ts:27-55` `createConfig` helper does not currently include `githubDeployment` / `githubDeploymentEnvironment` fields — it produces a `Partial<ActionConfig>` cast as full. T007 will update it for the new `experimentalApi` field; whether to also fix the missing legacy fields is out of scope for this track.
