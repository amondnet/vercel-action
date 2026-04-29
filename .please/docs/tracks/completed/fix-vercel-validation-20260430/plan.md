# Plan: v42.2.1 Deployment Validation Fixes

> Track: fix-vercel-validation-20260430
> Spec: [spec.md](./spec.md)
> Investigation: [investigation.md](./investigation.md)

## Overview

- **Source**: /please:plan
- **Track**: fix-vercel-validation-20260430
- **Issue**: #359
- **Created**: 2026-04-30
- **Approach**: Inline semver-based normalization for `nodeVersion` (no `@vercel/build-utils` coupling) + removal of `nowConfig` payload field with whitelist-based key copying from `vercel.json` into `projectSettings`.

## Purpose

Restore working deployments for users on `amondnet/vercel-action@v42.2.1+` whose projects have either (a) a non-`NN.x` `engines.node` value in `package.json` or (b) any `vercel.json` file present. The Vercel REST API rejects both conditions with HTTP 400 (see Issue #359). Both regressions were introduced by PR #350 ("send nowConfig and projectSettings to honor vercel.json"). The fix retains PR #350's parity goal — honoring `vercel.json` `buildCommand` and friends — while sending only the field shapes the API actually accepts.

## Context

The action calls `@vercel/client.createDeployment` with a `DeploymentOptions` object that the SDK raw-spreads into the REST request body (`dist/index.js:35126-35129`). PR #350 attached a `nowConfig` top-level field to that object based on a false assumption ("nowConfig is accepted by the REST API"); the API rejects it as `additionalProperty`. PR #350 also forwarded `engines.node` verbatim into `projectSettings.nodeVersion`, but the API enum only accepts `"24.x" | "22.x" | "20.x"`. The Vercel CLI, which PR #350 cited as parity target, normalizes `engines.node` via `@vercel/build-utils.getSupportedNodeVersion()` and copies a select set of `vercel.json` keys into `projectSettings` instead of sending `nowConfig`. We will mirror this CLI behavior with a small, local implementation rather than coupling to `@vercel/build-utils` (see Architecture Decision).

## Architecture Decision

**Bug 1 — nodeVersion normalization**: Use the `semver` package (already a transitive dep — pinned at `7.7.4` in `pnpm-lock.yaml:7113`) directly, with a hardcoded list of currently supported Vercel Node majors (`24.x`, `22.x`, `20.x`). Export `normalizeNodeVersion(input: string | undefined): string | undefined` from `src/project-config.ts`. Match in passthrough → `semver.intersects` order; return `undefined` when no canonical version matches (deployment falls back to project default rather than failing).

Why not `@vercel/build-utils.getSupportedNodeVersion`? The API surface is internal to that package and could shift across upgrades. We already have a precedent for keeping such couplings local (see `tech-stack.md`'s note on pinning `@actions/http-client` at v2 for CJS/ncc compat). A local implementation costs ~10 lines and isolates us from upstream churn.

**Bug 2 — replace nowConfig with whitelisted projectSettings keys**: Drop the `nowConfig` field from both `ProjectConfig` (the internal type) and the deployment payload. In `buildProjectConfig`, when `vercel.json` is present, copy a static whitelist of CLI-parity keys (`buildCommand`, `installCommand`, `outputDirectory`, `framework`, `devCommand`) into `projectSettings`. The static whitelist eliminates prototype-pollution paths the previous `sanitizeNowConfig` was guarding against — `__proto__`, `constructor`, `prototype`, and `images` are simply not in the whitelist and never copied. Keep the existing `rootDirectory` / `sourceFilesOutsideRootDirectory` zero-config logic untouched.

## Tasks

- [x] T001 Promote `semver` to a direct runtime dependency (file: package.json) — add `semver: ^7.7.4` to `dependencies` so the bundle pulls it from a stable, pinned reference rather than a transitive path. Verification: `pnpm install` exits 0; `pnpm-lock.yaml` continues to record `semver@7.7.4` as a top-level resolution.
- [x] T002 [P] [TDD-RED] Add failing unit tests for `normalizeNodeVersion` (file: src/__tests__/project-config.test.ts) — covers the eight cases from spec TR-1: `"24.x"`, `"22.x"`, `">=24.0.0"`, `"^20.0.0"`, `"24.0.0"`, `">=18"`, `">=99.0.0"`, `"not-a-version"`, `undefined`. Run `pnpm test src/__tests__/project-config.test.ts` and confirm the new cases fail (`normalizeNodeVersion` not yet exported).
- [x] T003 [TDD-GREEN] Implement `normalizeNodeVersion` and integrate into `buildProjectConfig` (file: src/project-config.ts) (depends on T001, T002) — export `normalizeNodeVersion(input: string | undefined): string | undefined`. Pass `readNodeVersion(workingDirectory)` through the normalizer before assigning to `projectSettings.nodeVersion`. Use `semver.intersects` against `['24.x', '22.x', '20.x']`. Confirm T002's tests pass.
- [x] T004 [P] [TDD-RED] Update `vercel-api.test.ts` nowConfig assertions to projectSettings (file: src/__tests__/vercel-api.test.ts) — rewrite the three tests at lines 367-431 (`includes nowConfig.buildCommand when vercel.json is present`, `omits nowConfig when vercel.json is absent`, `strips images from nowConfig`) so they assert against `deployOpts.projectSettings.{buildCommand, framework, ...}` and explicitly assert `deployOpts.nowConfig === undefined`. Add a new test asserting that `images` (and other non-whitelist keys) are never copied into `projectSettings`. Confirm tests fail.
- [x] T005 [TDD-GREEN] Replace nowConfig with whitelisted projectSettings keys in `buildProjectConfig` (file: src/project-config.ts) (depends on T003, T004) — remove the `nowConfig` field from the `ProjectConfig` interface and the `sanitizeNowConfig` helper. Add a static `PROJECT_SETTINGS_KEYS` constant (`['buildCommand','installCommand','outputDirectory','framework','devCommand']`). When `vercel.json` is present, iterate the whitelist and copy each key from `vercelJson` into `projectSettings` only when present. Preserve existing zero-config branch (`rootDirectory`, `sourceFilesOutsideRootDirectory`). Run T004 tests and confirm green.
- [x] T006 [TDD-GREEN] Drop nowConfig assignment in `applyProjectConfig` and correct misleading comment (file: src/vercel-api.ts) (depends on T005) — remove lines 135-137 (`if (projectConfig.nowConfig) { Object.assign(...) }`). Replace the misleading block comment at lines 127-132 with a short, accurate note: "Honor select `vercel.json` keys via `projectSettings`. The Vercel REST API does not accept `nowConfig` as a top-level field." Confirm `pnpm test src/__tests__/vercel-api.test.ts` passes.
- [x] T007 [TDD] Add integration regression test for semver range + vercel.json (file: src/__integration__/vercel-api.test.ts) (depends on T005, T006) — add a new `it` block under `describe('with vercel.json buildCommand', ...)` that writes `package.json` with `"engines": { "node": ">=24.0.0" }` and `vercel.json` with `{ "buildCommand": "./build.sh" }`, runs the deploy against the emulator, and asserts the recorded request body has `projectSettings.nodeVersion === "24.x"` and `projectSettings.buildCommand === "./build.sh"` and no `nowConfig` key. Run `GITHUB_REPOSITORY=test-owner/test-repo pnpm test src/__integration__/vercel-api.test.ts` and confirm green.
- [x] T008 Rebuild dist/ and run full quality gate (file: dist/index.js) (depends on T003, T005, T006, T007) — run `pnpm run all` (lint + build + test). Commit `dist/index.js` along with the source changes per project convention (CLAUDE.md "Build Process" + tech-stack.md). Verify `pnpm test --coverage` shows no regression for `src/project-config.ts` and `src/vercel-api.ts`.

## Dependencies

```
T001 (add semver) ──► T003 (impl normalizeNodeVersion)
T002 (RED nodeVer) ──► T003
T003 ────────────────────────────► T005 (whitelist projectSettings)
T004 (RED nowConfig→ps) ──► T005
T005 ──► T006 (drop nowConfig in applyProjectConfig)
T006 ──► T007 (integration regression)
T003 + T005 + T006 + T007 ──► T008 (dist rebuild)
```

T002 ‖ T004 — both are RED-phase test edits in independent files; can be authored in parallel.

## Key Files

| File | Why it matters |
|---|---|
| `src/project-config.ts` | Hosts both bugs. `readNodeVersion` (Bug 1) and `buildProjectConfig`/`sanitizeNowConfig` (Bug 2). Where `normalizeNodeVersion` and the projectSettings whitelist will live. |
| `src/vercel-api.ts:127-141` | `applyProjectConfig` injects `nowConfig` top-level (Bug 2). Misleading comment block needs correction. |
| `src/__tests__/project-config.test.ts` | Existing unit tests for `readVercelJson`, `readNodeVersion`, `buildProjectConfig`. Will gain `normalizeNodeVersion` cases. |
| `src/__tests__/vercel-api.test.ts:367-431` | Currently asserts the broken `nowConfig` presence behavior — must be rewritten to assert `projectSettings` keys and `nowConfig === undefined`. |
| `src/__integration__/vercel-api.test.ts` | Emulator-based regression test for the combined fix. |
| `dist/index.js` | Bundled output committed for GitHub Actions consumption — must be rebuilt for the fix to ship. |
| `package.json` | `dependencies` gets `semver`. |

## Verification

Phase-gate verification before marking the track complete:

1. **Unit gate**: `pnpm test` passes with all new and updated tests.
2. **Integration gate**: `GITHUB_REPOSITORY=test-owner/test-repo pnpm test src/__integration__/vercel-api.test.ts` passes (CI sets the env var; locally must be set per gotchas.md).
3. **Coverage gate**: `pnpm test --coverage` shows no decrease for `src/project-config.ts` or `src/vercel-api.ts`.
4. **Build gate**: `pnpm run all` exits 0; `dist/index.js` is rebuilt and committed.
5. **Manual smoke (recommended before tagging release)**: push a test branch with `engines.node: ">=24.0.0"` and `vercel.json: { "buildCommand": "./build.sh" }`; confirm the action succeeds end-to-end against a real Vercel project.

Acceptance criteria mapping to spec:
- AC-1, AC-2 → T003, T005, T006 (functional fixes) verified by T002, T004, T007 tests.
- AC-3 → T007 integration regression preserves PR #350 use case.
- AC-4 → T004 updates the broken assertion; T008 confirms full suite green.
- AC-5 → T008 coverage gate.
- AC-6 → T008 rebuilds `dist/`.
- AC-7 → T006 corrects the misleading comment.

## Progress

- [x] T001 — completed 2026-04-30 04:11 — `semver@^7.7.4` and `@types/semver@^7.7.1` added.
- [x] T002 — completed 2026-04-30 04:11 — RED, 11 cases failing as expected.
- [x] T003 — completed 2026-04-30 04:12 — `normalizeNodeVersion` + integration into `buildProjectConfig` (src/project-config.ts).
- [x] T004 — completed 2026-04-30 04:13 — RED, 6 cases failing across `vercel-api.test.ts` and `project-config.test.ts`.
- [x] T005 — completed 2026-04-30 04:14 — `PROJECT_SETTINGS_KEYS` whitelist replaces `sanitizeNowConfig`/`nowConfig` field.
- [x] T006 — completed 2026-04-30 04:14 — `applyProjectConfig` no longer assigns `nowConfig`; comment block corrected.
- [x] T007 — completed 2026-04-30 04:15 — added unit + integration regression for semver-range + vercel.json combo.
- [x] T008 — completed 2026-04-30 04:17 — `pnpm run all` green (248 tests). `dist/` rebuilt and committed. Coverage: `project-config.ts` 93.63%, `vercel-api.ts` 90.78%.

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-30 | Use local `semver`-based normalizer instead of `@vercel/build-utils.getSupportedNodeVersion` | Avoids coupling to internal API of a transitive dep; consistent with the project's existing pattern of pinning sensitive integrations (e.g., `@actions/http-client`). ~10 lines of code. |
| 2026-04-30 | Promote `semver` to direct dependency | Already in node_modules tree as transitive; declaring it directly pins the version we rely on and removes the implicit hop through `@vercel/client`. |
| 2026-04-30 | Drop `nowConfig` entirely (do not unwrap into payload) | Matches Vercel CLI behavior; static whitelist of projectSettings keys is safer than reflecting arbitrary `vercel.json` content into the API request. |
| 2026-04-30 | Map unsupported `engines.node` values to `undefined` (omit) rather than fail loudly | Matches Vercel CLI fallback behavior and avoids hard-failing deployments for users with exotic ranges; we surface the omission via a `core.warning`. |

## Surprises & Discoveries

- The bundled `@vercel/client.postDeployment` (`dist/index.js:35101`) is a raw JSON.stringify spread — it does no field filtering. Anything we attach to `DeploymentOptions` ends up in the request body verbatim. Future contributors should add fields only after confirming they appear in the Vercel REST API schema (or use it via `Object.assign` only for fields that are accepted but absent from the SDK type, like `project`).
- The existing test `src/__tests__/vercel-api.test.ts:379-398` asserts the broken behavior. This is a useful reminder that "all tests pass" does not imply "behavior is correct" — schema-level integration coverage was missing.
- Initial implementation iterated `VERCEL_NODE_VERSIONS` lowest-first, which would have silently sent `>=18` users to Node 20 when Vercel CLI sends them to Node 24. Caught in code review against the actual `@vercel/build-utils` source. Reinforces the value of explicit CLI-parity verification rather than just "any matching major."

## Outcomes & Retrospective

### What Was Shipped
PR #364 — semver-based `engines.node` normalization plus removal of the `nowConfig` deployment payload field with whitelisted `vercel.json` → `projectSettings` mapping. Fully covered by 11 new normalization unit tests, an updated `vercel-api.test.ts` suite, and an emulator-based regression test for the combined scenario. `dist/` rebuilt.

### What Went Well
- The bug-spec → code-analyzer → spec → plan → TDD flow surfaced the root cause (false assumption in PR #350 about `nowConfig` API acceptance) before any code was written, so implementation was a straight line.
- Inspecting `dist/index.js`'s bundled `@vercel/client.postDeployment` confirmed the SDK does not unwrap `nowConfig` — the architecture decision rested on observed behavior, not docs.
- Code review caught the highest-vs-lowest precedence divergence from Vercel CLI parity. One small fix re-aligned the implementation with the spec and avoided silently shipping users to a different Node major than `vc deploy` would.

### What Could Improve
- The TR-1 test matrix did not initially codify the "highest-first" precedence requirement explicitly, so the implementation drifted to lowest-first without tripping a test. Adding a precedence-direction assertion (e.g., `>=18` must yield the highest, not lowest, supported major) up front would have caught it earlier.
- No live integration test exercises against the real Vercel API — we depend on the emulator and unit-level payload assertions. A nightly canary smoke test would catch future schema drift faster than waiting for a user bug report.

### Tech Debt Created
- None added. The change is net-removal: `sanitizeNowConfig`, the `nowConfig` field on `ProjectConfig`, and the prior images/proto-pollution stripping were all retired in favor of a smaller, declarative whitelist.
