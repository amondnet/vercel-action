# Bug Investigation Report

> Track: relative-working-dir-20260423
> Issue: [#341](https://github.com/amondnet/vercel-action/issues/341)

## 1. Reproduction Status

**Reproduced** — code path is unambiguous and the error string matches exactly.

**Reproduction Path:**
1. `src/index.ts:248` — `getActionConfig()` reads `working-directory` raw
2. `src/config.ts:81` — `workingDirectory: core.getInput('working-directory')` stores `'public'` with no normalization
3. `src/index.ts:269` — `createVercelClient(config)` returns `VercelApiClient` (no `vercel-args` provided is the new default in v42.2.0)
4. `src/vercel.ts:23` — delegates to `client.deploy(config, deployContext)`
5. `src/vercel-api.ts:145` — `buildClientOptions(config, this.baseUrl)` is called
6. `src/vercel-api.ts:25` — **failure point**: `path: config.workingDirectory || process.cwd()` sets `path: 'public'`
7. `src/vercel-api.ts:152` — `createDeployment(clientOptions, deploymentOptions)` from `@vercel/client` validates `path` is absolute → throws `Error: Provided path public is not absolute`

A second site exists at `src/vercel-api.ts:42-43` for prebuilt mode: `basePath = config.workingDirectory || process.cwd()` then `vercelOutputDir = config.vercelOutputDir || path.join(basePath, '.vercel', 'output')`. With `workingDirectory='public'`, `vercelOutputDir` becomes `'public/.vercel/output'` — also relative — which would fail the same SDK precondition.

Sample failing run: https://github.com/python-poetry/website/actions/runs/24625830288/job/72004584030?pr=209

## 2. Root Cause Analysis

**Problem Location:**
- File: `src/config.ts`
- Function: `getActionConfig()`
- Line: `81`

**Root Cause:**

Commit `353227b` (PR #325, v42.2.0) replaced CLI-based deployment with `@vercel/client.createDeployment()`, which validates that its `path` option is absolute. `getActionConfig()` continues to pass the `working-directory` input through verbatim, so the previously-tolerated relative value `'public'` now reaches the SDK at `src/vercel-api.ts:25` and throws.

**Why `@vercel/client` requires absolute paths:**
`createDeployment()` synchronously asserts `path.isAbsolute(clientOptions.path)` before doing anything else. The SDK uses `path` as the root for hash/upload streaming, glob resolution, and (in prebuilt mode) for locating `.vercel/output`. Vercel made this a hard precondition because implicit resolution against `cwd` produces a different deployment payload depending on where the SDK is invoked from.

**Why CLI mode tolerated relative paths:**
`src/vercel-cli.ts:79-80` and `:134-135` pass `workingDirectory` to `@actions/exec` as `options.cwd`, which forwards it to Node's `child_process.spawn`. `spawn` accepts a relative `cwd` and lets the OS resolve it via the parent process's cwd. So `working-directory: public` worked accidentally — not because the action normalized it, but because `spawn`'s contract is looser than the SDK's.

**Why this is a regression, not an intentional API change:**
- `action.yml:26-28` describes `working-directory` as "the working directory" with no mention of an absolute-path requirement.
- v42.1.0's contract — set via the CLI exec path — accepted relative values for years.
- PR #325's changelog frames the migration as an internal implementation swap (CLI → REST API), not a breaking input-contract change.
- The user-visible failure is a low-level SDK assertion message, not a validated input error, signalling that the boundary layer (`getActionConfig`) failed to coerce the input to the new downstream contract.

**Code Context:**

```typescript
// src/config.ts:81 — no normalization
workingDirectory: core.getInput('working-directory'),
//                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Returns raw user input; 'public', './public', '../sibling' all accepted unchanged
```

```typescript
// src/vercel-api.ts:22-44 — both bug sites annotated
function buildClientOptions(config: ActionConfig, apiUrl?: string): VercelClientOptions {
  const options: VercelClientOptions = {
    token: config.vercelToken,
    path: config.workingDirectory || process.cwd(), // BUG 1: relative path passes through unchanged
    debug: core.isDebug(),
  }
  // ...
  if (config.prebuilt) {
    options.prebuilt = true
    const basePath = config.workingDirectory || process.cwd() // BUG 2: same issue for prebuilt
    options.vercelOutputDir = config.vercelOutputDir || path.join(basePath, '.vercel', 'output')
  }
}
```

## 3. Proposed Solutions

### Solution 1: Centralize normalization in `getActionConfig()` (Recommended)

Add a `parseWorkingDirectory()` helper alongside `parseTarget`/`parseArchive` in `src/config.ts`:

```typescript
// src/config.ts
import path from 'node:path'

function parseWorkingDirectory(input: string): string {
  if (!input) {
    return ''
  }
  if (path.isAbsolute(input)) {
    return input
  }
  const base = process.env.GITHUB_WORKSPACE || process.cwd()
  return path.resolve(base, input)
}

export function getActionConfig(): ActionConfig {
  // ...
  return {
    // ...
    workingDirectory: parseWorkingDirectory(core.getInput('working-directory')),
    // ...
  }
}
```

`src/vercel-api.ts:25, 42` and `src/vercel-cli.ts:79, 134` are unchanged — they already handle absolute strings correctly. The empty-string fallback at `vercel-api.ts:25` keeps working, and `path.join(<absolute>, '.vercel', 'output')` produces an absolute path, so the prebuilt output-dir bug is fixed for free.

**Pros:**
- Consistency: API and CLI modes both observe the same normalized value.
- Testability: a single pure helper to unit-test.
- Pattern alignment: matches every other input coercion already in `config.ts`.
- Boundary discipline (per AGENTS.md "Isolate side effects… at the boundary layer").
- Future-proofing: if a third deployment mode is added, no third copy of the normalization is needed.

**Cons:**
- Slightly larger blast radius — changes the observable value of `config.workingDirectory` for any future consumer (currently just CLI/API clients). Mitigated: an absolute path is strictly more useful.

### Solution 2: Local fix in `buildClientOptions()`

Normalize only inside `src/vercel-api.ts:buildClientOptions`:

```typescript
function resolveAbsolutePath(p: string): string {
  if (!p) return process.cwd()
  return path.isAbsolute(p) ? p : path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), p)
}
```

**Pros:**
- Smallest diff, isolated to the file containing the broken precondition.

**Cons:**
- Two sources of truth: API normalizes, CLI doesn't.
- Future code paths reading `config.workingDirectory` will hit the same bug class again.

### Solution 3: Normalize at `index.ts:run()` entry

```typescript
async function run(): Promise<void> {
  const config = getActionConfig()
  if (config.workingDirectory && !path.isAbsolute(config.workingDirectory)) {
    config.workingDirectory = path.resolve(
      process.env.GITHUB_WORKSPACE || process.cwd(),
      config.workingDirectory,
    )
  }
  // ...
}
```

**Cons:**
- Mutates the config struct after construction (immutability hygiene).
- Splits responsibility — `getActionConfig` is the documented input boundary.
- `getActionConfig()` consumed standalone returns a relative path.

**Recommendation:** Solution 1.

## 4. Testing Requirements

1. **Bug Scenario (regression):** `getActionConfig()` returns absolute path when `working-directory='public'` and `GITHUB_WORKSPACE='/github/workspace'`.
2. **Edge Cases:**
   - Empty `GITHUB_WORKSPACE` falls back to `process.cwd()` (use `||` not `??`).
   - Empty input stays empty.
   - Absolute input passes through unchanged (no double-prefix).
   - Nested relative path (`'apps/web/public'`).
   - Parent-traversal (`'../sibling'`) collapses correctly via `path.resolve`.
   - Prebuilt: `vercelOutputDir` derives an absolute path.
3. **Regression Prevention:**
   - `buildClientOptions()` always emits `path.isAbsolute(callArgs.path) === true` when `workingDirectory` is non-empty.
   - CLI mode `exec.cwd` receives absolute path (parity check).

## 5. Similar Code Patterns

- `src/vercel-api.ts:42-43` — same relative-path issue for `vercelOutputDir` derivation in prebuilt mode (same fix covers it).
- `src/vercel-cli.ts:79-80, 134-135` — pass `workingDirectory` to `exec.cwd`, which currently masks the issue via OS cwd resolution. After centralized normalization, these continue to work with absolute paths.
- No other code paths in `src/` pass `workingDirectory` to APIs that require absolute paths.

## 6. Edge Cases Considered

- **`~` expansion:** Out of scope. Node's `path.resolve` does not expand `~`. Users should use `${{ github.workspace }}` or `${HOME}` in their workflow YAML.
- **Trailing slashes:** Harmless — `path.resolve('/ws', 'public/')` → `'/ws/public'`.
- **Windows paths:** `node:path` (not `node:path/posix`) gives platform-correct behavior. Tests should use `path.join`/`path.resolve` rather than hardcoding `/`.
- **Symlinks:** `path.resolve` does not call `realpath`. Matches CLI behavior; preserves user intent.
- **Local runners (`act`):** `act` sets `GITHUB_WORKSPACE` to its mounted repo path. Falling back to `process.cwd()` covers `node ./index.js` debugging via `pnpm start`.
- **Empty `GITHUB_WORKSPACE`:** `||` (not `??`) is correct so empty-string env values fall back to `process.cwd()`.
