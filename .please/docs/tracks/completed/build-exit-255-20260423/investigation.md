# Bug Investigation Report: Error on v42.2.0 Deployment (Issue #336)

## 1. Reproduction Status

**Status**: Root cause confirmed by source comparison of `@vercel/client@17.2.65` and `vercel@50.0.0` (pinned versions in `package.json`). Live reproduction not yet executed — to be done as task T-01 during implementation.

**Reported Symptom**:

```
Command "./build.sh" exited with 255
```

Triggered on v42.2.0 but not on v42.1.0 for the same repository and workflow (reference: `petems/petersouter.xyz` Hugo site with a custom `build.sh` in `vercel.json`'s `buildCommand`).

**Reproduction Path**:

1. `src/index.ts:269` — `createVercelClient(config)` returns a `VercelApiClient` because `vercel-args` is empty (new default path in v42.2.0).
2. `src/vercel.ts:9-16` — Routing selects API client over CLI client.
3. `src/vercel-api.ts:144-202` — `VercelApiClient.deploy()` calls `@vercel/client`'s `createDeployment` with `clientOptions` (from `buildClientOptions`) and `deploymentOptions` (from `buildDeploymentOptions`).
4. `src/vercel-api.ts:68-116` — `buildDeploymentOptions()` populates only: `meta`, `gitMetadata`, `autoAssignCustomDomains`, `target`, `env`, `build.env`, `regions`, `public`, `customEnvironmentSlugOrId`, `name`, `project`. **It does NOT populate `nowConfig` or `projectSettings`.**
5. `@vercel/client` sends a POST to `/v13/deployments` with only the provided fields plus the file manifest. The server has no knowledge of the user's `vercel.json` `buildCommand`.
6. **Failure point** — Vercel's remote builder applies framework auto-detection (Hugo detected by the uploaded `config.toml`/`hugo.toml`), runs a default Hugo build command (or a pre-registered dashboard command), and `./build.sh` is either not executed or is executed in a context that fails. Exit code 255 is the wrapper exit code Vercel's builder returns on non-zero build-command exit.

## 2. Root Cause Analysis

**Confirmed Root Cause**: The `VercelApiClient` does NOT send `nowConfig` (the contents of the user's `vercel.json`) or `projectSettings` in the deployment body. The Vercel CLI — which the action used exclusively in v42.1.0 and earlier — always sends both. Without them, the server-side build does not receive the user's `buildCommand`, `installCommand`, `outputDirectory`, `rootDirectory`, etc., and falls back to framework auto-detection. Combined with `skipAutoDetectionConfirmation: true` (unconditionally set in `src/vercel-api.ts:63`), the server proceeds silently with whatever it detects, overriding the user's intent.

**Evidence from CLI source** (`vercel@50.0.0`, `packages/cli/src/commands/deploy/index.ts:494-571`):

```typescript
createArgs: CreateArgs = {
  name,
  env: deploymentEnv as Dictionary<string>,
  build: { env: deploymentBuildEnv as Dictionary<string> },
  forceNew: parsedArguments.flags['--force'],
  // ...
  nowConfig: {
    ...localConfig,            // <-- vercel.json contents
    images: undefined,
  },
  regions,
  meta,
  gitMetadata,
  target,
  skipAutoDetectionConfirmation: autoConfirm,
  // ...
};

if (!localConfig.builds || localConfig.builds.length === 0) {
  // Only add projectSettings for zero config deployments
  createArgs.projectSettings = {
    sourceFilesOutsideRootDirectory,
    rootDirectory,
    ...localConfigurationOverrides,
  };
}
// ...
if (!createArgs.projectSettings) createArgs.projectSettings = {};
createArgs.projectSettings.nodeVersion = nodeVersion;   // from package.json engines.node
```

The CLI populates **both** `nowConfig` and `projectSettings`. The vercel-action populates **neither**.

**Evidence from action source** (`src/vercel-api.ts:68-116`):

```typescript
function buildDeploymentOptions(config: ActionConfig, deployContext: DeploymentContext): DeploymentOptions {
  const options: DeploymentOptions = {
    meta: { /* ... */ },
    gitMetadata: buildGitMetadata(deployContext),
    autoAssignCustomDomains: config.autoAssignCustomDomains,
  }
  if (config.target === 'production') { options.target = 'production' }
  if (Object.keys(config.env).length > 0) { options.env = config.env }
  if (Object.keys(config.buildEnv).length > 0) { options.build = { env: config.buildEnv } }
  // regions, public, customEnvironmentSlugOrId, name, project ...
  return options
}
```

No `nowConfig`. No `projectSettings`. Also no read of `vercel.json` anywhere in the action codebase (confirmed via grep for `vercel.json` in `src/`).

**Type support** (`@vercel/client@17.2.65`, `packages/client/src/types.ts:181-205`):

```typescript
export interface DeploymentOptions {
  // ...
  projectSettings?: ProjectSettings;
  // ...
}
```

`projectSettings` is a typed DeploymentOptions field. `nowConfig` is accepted by the API but not in the DeploymentOptions type — the CLI passes it via a broader `createArgs` shape.

**Why the mode/executable-bit hypothesis is wrong**: `@vercel/client` DOES preserve POSIX mode. `packages/client/src/utils/hashes.ts:54-79` reads `mode = stat.mode` via `fs.lstat`. `packages/client/src/utils/index.ts:380-420` includes `mode: file.mode` in the `PreparedFile` manifest sent to the server. So executable bits ARE preserved end-to-end.

**Supporting evidence (sibling v42.2.0 regressions)**: All trace to the same missing `nowConfig`/`projectSettings`:

- #341 (`working-directory` must be absolute) — `@vercel/client` requires absolute paths (`packages/client/src/create-deployment.ts:77-91`). The CLI resolves to absolute before calling; the action passes through raw.
- #342 (project name falls back to repo name) — without `nowConfig.name`, the client uses `getDefaultName()` (`packages/client/src/deploy.ts:114-131`) which picks the last path segment.
- #343 (alias assignment fails on preview) — alias/autoAlias config lives in `nowConfig` via `vercel.json`; the server falls back without it.
- #345 (paid-team / CLI-version complaints) — when framework auto-detection replaces the user's `buildCommand`, builds hit different server-side code paths that have different eligibility checks.

## 3. Proposed Solutions

### Solution 1: Send `nowConfig` and `projectSettings` from the action (Recommended)

Mirror what the CLI does in `packages/cli/src/commands/deploy/index.ts:494-571`:

1. Read `vercel.json` from `workingDirectory` (or `rootDirectory`). Pass its contents as `nowConfig` in DeploymentOptions.
2. Read `package.json`'s `engines.node` and build `projectSettings.nodeVersion`.
3. When `localConfig.builds` is absent (zero-config), populate `projectSettings.rootDirectory` / `projectSettings.sourceFilesOutsideRootDirectory` / `projectSettings.localConfigurationOverrides`.
4. Pass them through via `Object.assign(options, { nowConfig, projectSettings })` (same pattern used for `project` on line 112).

**Pros**: Mirrors CLI behavior exactly — fixes #336 and reduces divergence for #341/#342/#343. Narrow surface.
**Cons**: Introduces dependency on filesystem reads of `vercel.json`/`package.json`. Need to handle missing/invalid config gracefully.

### Solution 2: Defer to the CLI for deployments that have `vercel.json` (Fallback only)

If the action detects `vercel.json` in the working directory, route to `VercelCliClient` instead of `VercelApiClient`.

**Pros**: Cheap to implement; keeps CLI as the "reliable" path.
**Cons**: Defeats the purpose of the API migration. Doesn't address the underlying gap. Users would hit other CLI-only issues (#345 paid-team requirement, telemetry, etc.). Strong preference **against**.

### Solution 3: Conditionally skip `skipAutoDetectionConfirmation`

Set `skipAutoDetectionConfirmation: true` only when the project is being created fresh (no `vercel-project-id`). For existing linked projects, let the server respect stored settings.

**Pros**: Single-line change.
**Cons**: Doesn't fix the root gap — the server still doesn't see the user's `vercel.json` via `nowConfig`. Partial fix only.

## 4. Testing Requirements

1. **Bug scenario (TR-1)** — Integration test: seed a project via `emulate.dev` with `vercel.json` containing `"buildCommand": "./build.sh"` and an executable `build.sh`. Run `VercelApiClient.deploy()`. Assert: the emulator receives a POST body that includes `nowConfig.buildCommand === "./build.sh"`.
2. **Edge case (TR-2)** — Missing `vercel.json`: deploy must succeed with empty `nowConfig` (no regression on projects that don't ship `vercel.json`).
3. **Edge case (TR-3)** — Invalid/unparseable `vercel.json`: action must fail fast with a clear error, not hang or silently drop config.
4. **Edge case (TR-4)** — `working-directory` provided: `vercel.json` must be read relative to `workingDirectory`, not `process.cwd()`.
5. **Regression (TR-5)** — Existing API deployment tests (no `vercel.json`) continue to pass.
6. **Regression (TR-6)** — CLI path (`vercel-args` provided) remains green.
7. **Unit (TR-7)** — `buildDeploymentOptions()` returns a DeploymentOptions with `nowConfig` and `projectSettings` populated when inputs include a `vercel.json`.

## 5. Similar Code Patterns

- `src/vercel-api.ts:107-113` — existing "push extra fields" pattern via `Object.assign(options, { project: config.vercelProjectId })`. Same pattern applies to `nowConfig`/`projectSettings`.
- `src/vercel-api.ts:63` — `skipAutoDetectionConfirmation = true`. Relevant to Solution 3 and to the broader interaction.
- `src/__integration__/vercel-api.test.ts` — existing API deployment integration tests against `emulate.dev`; new tests can follow the same structure.
- Related recent fixes in the v42.x line: `1d5e098` (project ID fix — same `Object.assign` pattern), `5dc8cc2` (scope loop), `bfe8c4e` (scope for inspect/alias). The v42.2.0 migration has consistently missed CLI-parity edge cases.
