# Bug Fix: build.sh exits with 255 on v42.2.0 API deployment

> Track: build-exit-255-20260423
> Issue: [#336](https://github.com/amondnet/vercel-action/issues/336)
> Investigation: [investigation.md](./investigation.md)

## Overview

After upgrading from v42.1.0 to v42.2.0, projects that declare a custom `buildCommand` in `vercel.json` (e.g., `./build.sh` for a Hugo site) fail during Vercel's remote build with:

```
Command "./build.sh" exited with 255
```

**Confirmed root cause**: The v42.2.0 migration to API-based deployment (PR #325) did not carry over the CLI's behavior of sending `nowConfig` (the `vercel.json` contents) and `projectSettings` in the deployment body. As a result, Vercel's server never sees the user's `buildCommand`/`installCommand`/`outputDirectory` and falls back to framework auto-detection. See `investigation.md` for the side-by-side CLI-vs-action source comparison.

The CLI path remains the workaround (`vercel-args: "--prod"`), but it also triggers #345 (paid-team requirement). v42.1.0 users have no clean upgrade path until this is fixed.

## Reproduction

1. Set up a Vercel project with `vercel.json`:
   ```json
   { "buildCommand": "./build.sh" }
   ```
2. Add an executable `build.sh` (committed with `chmod +x`).
3. Run this action at v42.2.0 with default inputs (no `vercel-args`, no `prebuilt`).

**Expected**: Vercel's remote builder runs `./build.sh` and returns a deployment URL.
**Actual**: Build exits with `Command "./build.sh" exited with 255`; the action reports deployment failure.

## Root Cause

`src/vercel-api.ts:68-116` (`buildDeploymentOptions`) omits two fields that the Vercel CLI always sends:

- **`nowConfig`** — contents of the user's `vercel.json` (see `vercel@50.0.0/packages/cli/src/commands/deploy/index.ts:512-517`). Carries `buildCommand`, `installCommand`, `outputDirectory`, `framework`, etc.
- **`projectSettings`** — `{ rootDirectory, sourceFilesOutsideRootDirectory, nodeVersion, ...localConfigurationOverrides }` (same file, lines 529-560).

Without these, `@vercel/client.createDeployment` POSTs a deployment body that does not include the user's build configuration. The server falls back to framework auto-detection, which — combined with `skipAutoDetectionConfirmation: true` unconditionally set at `src/vercel-api.ts:63` — silently overrides the user's `buildCommand`.

File executable bits are **not** the cause: `@vercel/client` preserves `mode` via `fs.lstat` and sends it in the `PreparedFile` manifest (verified in `@vercel/client@17.2.65/packages/client/src/utils/hashes.ts:54-79` and `packages/client/src/utils/index.ts:380-420`).

## Requirements

### Functional Requirements

- [ ] FR-1: The action MUST read `vercel.json` from the resolved working directory (`workingDirectory` input, or `process.cwd()` when empty) and pass its parsed contents as `nowConfig` in the DeploymentOptions sent via `@vercel/client.createDeployment`.
- [ ] FR-2: The action MUST populate `projectSettings.nodeVersion` from `package.json`'s `engines.node` field when present, mirroring the CLI.
- [ ] FR-3: When `vercel.json.builds` is absent (zero-config deployments), the action MUST populate `projectSettings.rootDirectory` and `projectSettings.sourceFilesOutsideRootDirectory` from the corresponding action inputs.
- [ ] FR-4: When `vercel.json` is missing, the action MUST still deploy successfully (no `nowConfig` sent — matches current behavior for projects without `vercel.json`).
- [ ] FR-5: When `vercel.json` is present but malformed (invalid JSON), the action MUST fail fast with a clear error message pointing at the file.
- [ ] FR-6: The CLI path (`vercel-args` provided) MUST continue to work unchanged. It is the escape hatch and must keep parity with v42.1.0.
- [ ] FR-7: The `images` field in `vercel.json` MUST be stripped from `nowConfig` before sending (mirrors CLI — `images` is consumed locally by `vc build` and rejected by the API endpoint).

### Testing Requirements

- [ ] TR-1: Integration test against `emulate.dev` — project with `vercel.json` containing `"buildCommand": "./build.sh"`; assert the deployment POST body includes `nowConfig.buildCommand === "./build.sh"`.
- [ ] TR-2: Integration test — project WITHOUT `vercel.json`; assert deployment succeeds and no `nowConfig` is sent.
- [ ] TR-3: Unit test — `vercel.json` with invalid JSON; assert action throws with a message naming the file.
- [ ] TR-4: Unit test — `vercel.json` read relative to `workingDirectory` (not `process.cwd()`) when `workingDirectory` input is set.
- [ ] TR-5: Unit test — `buildDeploymentOptions()` with `vercel.json` containing `buildCommand` and no `builds`: result has both `nowConfig` and `projectSettings` (including `nodeVersion` when `package.json.engines.node` is present).
- [ ] TR-6: Unit test — `buildDeploymentOptions()` strips `images` from `nowConfig`.
- [ ] TR-7: Regression — existing API deployment unit/integration tests continue to pass.
- [ ] TR-8: Regression — CLI path tests (`VercelCliClient`) continue to pass.

## Acceptance Criteria

- [ ] AC-1: The "Reproduction" scenario above succeeds on the fix branch — `./build.sh` runs and the deployment URL is produced.
- [ ] AC-2: A regression test exists that would have caught issue #336 before v42.2.0 shipped (integration test from TR-1).
- [ ] AC-3: All existing unit and integration tests under `src/__tests__/` and `src/__integration__/` continue to pass.
- [ ] AC-4: `dist/index.js` is rebuilt via `pnpm run build` and committed (required for GitHub Actions execution per `CLAUDE.md`).
- [ ] AC-5: Release notes / README call out that projects with `vercel.json` now have their build configuration honored by the API path (previously required `vercel-args` workaround).

## Out of Scope

- Fixing sibling v42.2.0 regressions (#341 absolute `working-directory`, #342 project name detection when `vercel-project-name` is unset, #343 alias assignment on preview, #345 CLI-version / paid-team). Each deserves its own track. This track does not regress them but does not fix them either.
- Refactoring `src/vercel-api.ts` beyond what's needed to populate `nowConfig` and `projectSettings`.
- Adding new action inputs for fine-grained `projectSettings` overrides. Only the fields the CLI already populates are in scope.
- Removing `skipAutoDetectionConfirmation: true`. Keep as-is; the root fix is to send proper `nowConfig` so auto-detection no longer matters.
