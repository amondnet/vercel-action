# Bug Investigation Report: v42.2.1 Deployment Validation Errors

> Track: fix-vercel-validation-20260430
> Issue: [#359](https://github.com/amondnet/vercel-action/issues/359)

## 1. Reproduction Status

**Reproduced** — both errors confirmed via static code-path tracing through `src/`, `dist/index.js` (bundled `@vercel/client`), and the Vercel CLI deploy code referenced by PR #350.

### Reproduction Path — Bug 1 (`projectSettings.nodeVersion` rejected)

1. `src/index.ts` reads action inputs and builds `ActionConfig`, then calls `client.deploy()`.
2. `src/project-config.ts:51-52` — `readNodeVersion()` returns `parsed.engines?.node` as-is (e.g. `">=24.0.0"`).
3. `src/project-config.ts:114-116` — `buildProjectConfig()` assigns `projectSettings.nodeVersion = nodeVersion` verbatim.
4. `src/vercel-api.ts:138-140` — `applyProjectConfig()` sets `options.projectSettings = projectConfig.projectSettings`.
5. `src/vercel-api.ts:177` — `createDeployment(clientOptions, deploymentOptions)` is called.
6. `dist/index.js:35126-35129` — `@vercel/client.postDeployment` does `JSON.stringify({ ...deploymentOptions, files })`, sending `projectSettings.nodeVersion = ">=24.0.0"` to the REST API.
7. **Failure**: Vercel REST API validates `projectSettings.nodeVersion` against the enum `["24.x","22.x","20.x"]` and returns `400 bad_request`.

### Reproduction Path — Bug 2 (`nowConfig` rejected)

1. `src/project-config.ts:98-100` — `buildProjectConfig()` sets `result.nowConfig = sanitizeNowConfig(vercelJson)`.
2. `src/vercel-api.ts:135-137` — `applyProjectConfig()` does `Object.assign(options, { nowConfig: projectConfig.nowConfig })`.
3. `src/vercel-api.ts:177` — `createDeployment(clientOptions, deploymentOptions)` is called.
4. `dist/index.js:35126-35129` — `postDeployment` raw-spreads `deploymentOptions` into the JSON body, so `nowConfig` becomes a top-level REST API field.
5. **Failure**: Vercel REST API rejects `nowConfig` as `additionalProperty` (`400 bad_request`).

## 2. Root Cause Analysis

### Bug 1
**Problem Location**: `src/project-config.ts:38-58`, function `readNodeVersion()`, lines 51-52.

**Root Cause**: The function returns `parsed.engines?.node` verbatim. The Vercel REST API's `projectSettings.nodeVersion` field is an enum (`"24.x" | "22.x" | "20.x"`), not a free-form semver range. Any user value that is not already in canonical `NN.x` form (e.g., `">=24.0.0"`, `"^20.0.0"`, `"24.0.0"`, `">=18"`) is rejected with HTTP 400.

The Vercel CLI normalizes this via `@vercel/build-utils` `getSupportedNodeVersion()` (visible at `dist/index.js:32044`). It runs `semver.intersects(o.range, engineRange)` against an internal `NODE_VERSIONS` array and returns the canonical `NN.x` string. The action does not perform this step.

```typescript
// src/project-config.ts:46-58 — current
export function readNodeVersion(workingDirectory: string): string | undefined {
  const filePath = path.join(resolveWorkingDir(workingDirectory), 'package.json')
  let raw: string
  try { raw = readFileSync(filePath, 'utf8') }
  catch { return undefined }

  try {
    const parsed = JSON.parse(raw) as { engines?: { node?: unknown } }
    const node = parsed.engines?.node
    return typeof node === 'string' ? node : undefined  // ← returns ">=24.0.0" unchanged
  }
  catch { return undefined }
}
```

### Bug 2
**Problem Location**: `src/vercel-api.ts:130-141`, function `applyProjectConfig()`, lines 135-137.

**Root Cause**: The function injects `nowConfig` as a top-level field on `DeploymentOptions`. `@vercel/client.postDeployment` (`dist/index.js:35101`) raw-spreads `DeploymentOptions` into the JSON body. The Vercel REST API rejects `nowConfig` as `additionalProperty`.

The comment claiming the API accepts `nowConfig` is incorrect:

```typescript
// src/vercel-api.ts:130-141 — current
function applyProjectConfig(options: DeploymentOptions, config: ActionConfig): void {
  // nowConfig is accepted by the REST API but not declared in DeploymentOptions  ← FALSE
  // (it's documented at https://vercel.com/docs/configuration#system-properties)
  const projectConfig = buildProjectConfig(config)
  if (projectConfig.nowConfig) {
    Object.assign(options, { nowConfig: projectConfig.nowConfig })  // ← rejected as additional property
  }
  if (projectConfig.projectSettings) {
    options.projectSettings = projectConfig.projectSettings
  }
}
```

The Vercel CLI's deploy command (referenced by PR #350 as the parity target, lines 494-571 in the CLI source) does **not** send `nowConfig`. Instead, it copies a select set of `vercel.json` keys (`buildCommand`, `installCommand`, `outputDirectory`, `framework`, `devCommand`) into `projectSettings`.

## 3. Proposed Solutions

### Bug 1 — Solution 1: Inline semver normalization (Recommended)

Use the `semver` package (already bundled at `dist/index.js:21921` as a transitive dep) to map any input to the closest matching `NN.x` from a static list of supported versions.

```typescript
import semver from 'semver'

const VERCEL_NODE_VERSIONS = ['24.x', '22.x', '20.x'] as const

export function normalizeNodeVersion(input: string | undefined): string | undefined {
  if (!input) return undefined
  if ((VERCEL_NODE_VERSIONS as readonly string[]).includes(input)) return input
  for (const version of VERCEL_NODE_VERSIONS) {
    if (semver.intersects(input, version)) return version
  }
  return undefined
}
```

**Pros**: No new dependency; deterministic; matches Vercel CLI behavior. Easy to update when Vercel adds/removes supported versions.
**Cons**: We hardcode the supported version list. If Vercel adds Node 26 silently, we miss it until we update.

### Bug 1 — Solution 2: Import from `@vercel/build-utils`

Reuse `getSupportedNodeVersion` directly from `@vercel/build-utils` (transitive via `@vercel/client`).

**Pros**: Always in sync with Vercel.
**Cons**: We pin to an internal API of a transitive dep — fragile across upgrades. Same risk we already documented for `@actions/http-client`. Reaching into `@vercel/build-utils` adds bundle weight and a stronger coupling than is warranted.

### Bug 2 — Solution 1: Remove `nowConfig`, expand vercel.json keys into `projectSettings` (Recommended)

```typescript
// src/project-config.ts — replacement for nowConfig assignment in buildProjectConfig
const PROJECT_SETTINGS_KEYS = [
  'buildCommand',
  'installCommand',
  'outputDirectory',
  'framework',
  'devCommand',
] as const

if (vercelJson) {
  for (const key of PROJECT_SETTINGS_KEYS) {
    if (key in vercelJson) {
      projectSettings[key] = vercelJson[key] as string | null
    }
  }
}
// Drop result.nowConfig entirely.
```

**Pros**: Mirrors actual Vercel CLI behavior; honors `vercel.json` for the keys the API documents under `projectSettings`; small diff; preserves prototype-pollution safeguards because we only copy whitelisted keys.
**Cons**: We hardcode the key list — adding support for new keys requires a code change.

### Bug 2 — Solution 2: Keep `nowConfig` but unwrap inside `applyProjectConfig`

Spread `nowConfig` keys directly into `projectSettings` and drop the `nowConfig` wrapper.

**Pros**: Minimal whitelist; user-driven keys propagate.
**Cons**: We have no idea which `vercel.json` keys the API actually accepts as `projectSettings` — this is a footgun. The whitelist approach is safer.

## 4. Testing Requirements

1. **Bug 1 scenarios**: Unit tests for the new `normalizeNodeVersion` (or the updated `readNodeVersion`) covering: `"24.x"` (passthrough), `">=24.0.0"`, `"^20.0.0"`, `"24.0.0"`, `">=18"`, `">=99.0.0"` (no match → undefined), `"not-a-version"`, `undefined`.
2. **Bug 2 scenarios**: Unit test asserting `nowConfig` is absent from `DeploymentOptions` for any combination of `vercel.json` contents.
3. **PR #350 regression**: Test asserting Hugo-style `vercel.json` with `"buildCommand": "./build.sh"` results in `projectSettings.buildCommand === "./build.sh"`.
4. **Existing assertion update**: `src/__tests__/vercel-api.test.ts:379-398` currently asserts `deployOpts.nowConfig.buildCommand === './build.sh'` — must be updated to assert `deployOpts.projectSettings.buildCommand === './build.sh'` and `deployOpts.nowConfig === undefined`.
5. **Integration**: Update `src/__integration__/vercel-api.test.ts` with a deployment whose `package.json` has `engines.node: ">=24.0.0"` and a `vercel.json` containing `buildCommand`; confirm the emulator receives the canonical-shape payload.

## 5. Similar Code Patterns

- **`src/vercel-api.ts:122-124`** — uses `Object.assign(options, { project: config.vercelProjectId })` for the `project` field. This is safe; `project` is an accepted Vercel API field. Leave it alone.
- **No other locations** in `src/` read `package.json` engines or `vercel.json` and forward values to the Vercel API. The bug surface is entirely localized to `src/project-config.ts` + `src/vercel-api.ts:applyProjectConfig`.

## 6. Recent Changes

| Commit | PR | Date | Relevance |
|---|---|---|---|
| `4b001a4` | #352 | 2026-04-24 | Release v42.2.1 |
| `ed665b2` | #350 | 2026-04-24 | **Introduces both bugs** — adds `readNodeVersion()` without normalization and `nowConfig` top-level injection |
| `353227b` | #325 | (prior) | Migrated to API-based deployment via `@vercel/client` (background) |

## 7. Test Coverage Gaps (current state)

- `src/__tests__/project-config.test.ts` — covers `readNodeVersion` only with the canonical `"20.x"` value. No semver-range, exact-version, or unsupported-input test exists.
- `src/__tests__/vercel-api.test.ts:379-398` — explicitly **asserts the broken behavior** (`deployOpts.nowConfig.buildCommand === './build.sh'`). This test must be updated when Bug 2 is fixed.
- `src/__integration__/vercel-api.test.ts` — does not assert absence of `nowConfig` in the request body; would not have caught either regression.
