# Bug Fix: v42.2.1 Deployment Validation Errors

> Track: fix-vercel-validation-20260430
> Investigation: [investigation.md](./investigation.md)
> Issue: [#359](https://github.com/amondnet/vercel-action/issues/359)

## Overview

v42.2.1 (PR #350) added `nowConfig` and `projectSettings` fields to the deployment payload sent to `@vercel/client.createDeployment` so that the action would honor `vercel.json` (e.g., custom `buildCommand`). Two distinct API validation errors break deployments for affected users:

1. **Bug 1 — `projectSettings.nodeVersion` rejected**: The action forwards `package.json` `engines.node` verbatim. The Vercel REST API only accepts the canonical shorthand `"24.x"`, `"22.x"`, or `"20.x"`. Any semver range or exact version (e.g., `>=24.0.0`, `^20.0.0`, `24.0.0`) triggers a 400 Bad Request.
2. **Bug 2 — `nowConfig` rejected as additional property**: The action attaches `nowConfig` as a top-level property on `DeploymentOptions`. `@vercel/client.postDeployment` raw-spreads it into the JSON body. The Vercel REST API rejects `nowConfig` as an undeclared additional property. The Vercel CLI never sends `nowConfig` at all — it copies a select set of `vercel.json` keys into `projectSettings` instead. PR #350 was based on a false assumption.

Severity: Major. Reproduces deterministically when (a) `engines.node` is a non-`NN.x` value, or (b) any `vercel.json` is present at the working directory.

## Reproduction

### Bug 1
1. Use `amondnet/vercel-action@v42.2.1` in a GitHub workflow.
2. Project has `package.json` with `"engines": { "node": ">=24.0.0" }`.
3. Run the workflow.
4. Action fails with:
   ```
   Error: Deployment failed: {"code":"bad_request","message":"Invalid request: `projectSettings.nodeVersion` should be equal to one of the allowed values \"24.x, 22.x, 20.x\".","status":400}
   ```

### Bug 2
1. Update `package.json` to `"engines": { "node": "24.x" }` (workaround for Bug 1).
2. Project has any `vercel.json` (even `{}`).
3. Run the workflow.
4. Action fails with:
   ```
   Error: Deployment failed: {"code":"bad_request","message":"Invalid request: should NOT have additional property `nowConfig`. Please remove it.","action":"View Documentation","link":"https://vercel.com/docs/configuration","keyword":"additionalProperties","dataPath":"","params":{"additionalProperty":"nowConfig"},"status":400}
   ```

**Expected**: Deployments succeed with arbitrary semver ranges in `engines.node` and with any valid `vercel.json` (matching Vercel CLI behavior).
**Actual**: Both error paths return 400 Bad Request and fail the action.

## Root Cause

### Bug 1
`src/project-config.ts:38-58` — `readNodeVersion()` reads `parsed.engines?.node` and returns it as-is. There is no normalization to the canonical `NN.x` enum the Vercel REST API requires for `projectSettings.nodeVersion`. The Vercel CLI does this normalization via `@vercel/build-utils` `getSupportedNodeVersion()`; this action does not.

### Bug 2
`src/vercel-api.ts:133-141` — `applyProjectConfig()` does `Object.assign(options, { nowConfig: projectConfig.nowConfig })`. `@vercel/client.postDeployment` raw-spreads `DeploymentOptions` into the request body, so `nowConfig` becomes a top-level field. The comment at `src/vercel-api.ts:130-132` claims "nowConfig is accepted by the REST API but not declared in DeploymentOptions" — this is factually wrong. The Vercel CLI's deploy path (referenced by PR #350 as the parity target) never sends `nowConfig`; instead it extracts a small set of `vercel.json` keys (`buildCommand`, `installCommand`, `outputDirectory`, `framework`, `devCommand`) into `projectSettings`.

See [investigation.md](./investigation.md) for full code-path traces, recent commit history, and recommended fix direction confirmed against `@vercel/client` and `@vercel/build-utils` source.

## Requirements

### Functional Requirements

- [ ] FR-1: Normalize `engines.node` from `package.json` into Vercel's canonical `NN.x` shorthand before assigning to `projectSettings.nodeVersion`. Support inputs: `NN.x` (passthrough), exact versions (`24.0.0`), semver ranges (`>=24.0.0`, `^20.0.0`, `>=18.0.0 <22.0.0`), bare majors (`24`, `>=24`), and unsupported values.
- [ ] FR-2: For values that cannot be mapped to a supported Vercel Node version, omit `projectSettings.nodeVersion` (send `undefined`) instead of forwarding an invalid value. Log a warning explaining the omission. Rationale: a missing `nodeVersion` lets Vercel use the project's account default; an invalid one fails the entire deployment.
- [ ] FR-3: Remove `nowConfig` from the deployment payload sent to `@vercel/client.createDeployment` entirely. The field is rejected by the Vercel REST API.
- [ ] FR-4: Continue to honor `vercel.json` by extracting Vercel-CLI-parity keys into `projectSettings`. At minimum: `buildCommand`, `installCommand`, `outputDirectory`, `framework`, `devCommand`. Only set keys that are present in `vercel.json` (do not send `null` or empty strings unless that is the literal value).
- [ ] FR-5: Preserve existing zero-config logic from PR #350: when `vercel.json` exists and lacks `builds`, set `projectSettings.rootDirectory` and `projectSettings.sourceFilesOutsideRootDirectory` (no behavior change here).
- [ ] FR-6: Preserve existing prototype-pollution / `images`-stripping safeguards from PR #350 — these still apply when copying `vercel.json` keys into `projectSettings`.

### Testing Requirements

- [ ] TR-1: Unit tests for nodeVersion normalization. Inputs and expected outputs:
  - `"24.x"` → `"24.x"` (passthrough)
  - `"22.x"` → `"22.x"` (passthrough)
  - `">=24.0.0"` → `"24.x"`
  - `"^20.0.0"` → `"20.x"`
  - `"24.0.0"` → `"24.x"`
  - `">=18"` → highest supported `NN.x` matching the range
  - `">=99.0.0"` → `undefined` (no supported version matches)
  - `"not-a-version"` → `undefined`
  - `undefined` → `undefined`
- [ ] TR-2: Unit test asserting `nowConfig` is **not** a property of the `DeploymentOptions` passed to `createDeployment` for any input scenario.
- [ ] TR-3: Unit tests asserting `vercel.json` fields are merged into `projectSettings` when present: `buildCommand`, `installCommand`, `outputDirectory`, `framework`, `devCommand`. Each field should also have a "not present in vercel.json → not in projectSettings" test.
- [ ] TR-4: Update the existing test at `src/__tests__/vercel-api.test.ts:379-398` that asserts `deployOpts.nowConfig.buildCommand === './build.sh'` to instead assert `deployOpts.projectSettings.buildCommand === './build.sh'` and `deployOpts.nowConfig === undefined`.
- [ ] TR-5: Integration test (emulator-based, in `src/__integration__/vercel-api.test.ts`): a deployment with `engines.node: ">=24.0.0"` and `vercel.json` containing `buildCommand` succeeds without 400 errors.
- [ ] TR-6: Regression test confirming the original PR #350 use case still works: a Hugo-style `vercel.json` with `"buildCommand": "./build.sh"` results in `projectSettings.buildCommand === "./build.sh"` reaching the deployment payload.

## Acceptance Criteria

- [ ] AC-1: Bug 1 no longer reproduces — a deployment with `package.json` `engines.node` set to any valid semver range succeeds, or omits `projectSettings.nodeVersion` for unsupported ranges (no 400 error).
- [ ] AC-2: Bug 2 no longer reproduces — a deployment with any `vercel.json` present succeeds without a 400 error citing `nowConfig`.
- [ ] AC-3: The PR #350 parity goal is preserved — `vercel.json` `buildCommand`, `installCommand`, `outputDirectory`, `framework`, `devCommand` are honored by Vercel's remote build.
- [ ] AC-4: All existing tests pass after the assertion update in TR-4.
- [ ] AC-5: Coverage for `src/project-config.ts` and `src/vercel-api.ts` does not regress (≥ current % per `pnpm test --coverage`).
- [ ] AC-6: `dist/index.js` is rebuilt with the fix and committed.
- [ ] AC-7: The misleading comment at `src/vercel-api.ts:130-132` is corrected or removed.

## Out of Scope

- Refactoring `src/project-config.ts` or `src/vercel-api.ts` beyond what these two fixes require.
- Honoring additional `vercel.json` keys not part of the PR #350 parity target (e.g., `headers`, `redirects`, `rewrites`). If users hit similar issues with other keys, a separate track should investigate.
- Replacing the `@vercel/client` integration with a different deployment mechanism.
- Bumping the GitHub Actions runtime from `node24` to a different version.
- Adding deployment-payload validation tests against the live Vercel API (we rely on the emulator and unit assertions).
