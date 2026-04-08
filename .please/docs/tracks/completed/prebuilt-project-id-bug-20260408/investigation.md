## Bug Investigation Report

### 1. Reproduction Status

**Reproduced** — Always reproducible when `prebuilt: true` is used with `vercel-project-id` in monorepo setups with multiple Vercel projects.

**Reproduction Path:**
1. `src/index.ts:248` — `getActionConfig()` reads `vercel-project-id` input into `config.vercelProjectId`
2. `src/config.ts:115-138` — `setVercelEnv()` exports `VERCEL_PROJECT_ID` as env var (only visible to child processes, not current Node.js process)
3. `src/index.ts:269` — `createVercelClient(config)` returns `VercelApiClient` (API path, no CLI)
4. `src/vercel-api.ts:22-60` — **FAILURE POINT**: `buildClientOptions()` maps `vercelOrgId` → `teamId` but never maps `vercelProjectId`
5. `src/vercel-api.ts:62-103` — `buildDeploymentOptions()` also does not include `projectId` in body
6. `@vercel/client` sends `POST /v13/deployments` with no project identifier → Vercel API resolves project by name heuristic → wrong project

### 2. Root Cause Analysis

**Problem Location:**
- File: `src/vercel-api.ts`
- Functions: `buildClientOptions()` (lines 22-60) and `buildDeploymentOptions()` (lines 62-103)

**Root Cause:**
`buildClientOptions()` maps `config.vercelOrgId` → `options.teamId` but has no corresponding mapping for `config.vercelProjectId`. The `@vercel/client` library does not have a `projectId` field in `VercelClientOptions` — the project must be identified via the `POST /v13/deployments` request body. Neither `buildClientOptions()` nor `buildDeploymentOptions()` includes `projectId`, so the Vercel API falls back to name-based resolution, which picks the wrong project in monorepo setups.

The `setVercelEnv()` call only helps the CLI path (child process inherits env), not the API path (runs in-process, `@vercel/client` doesn't read `VERCEL_PROJECT_ID` from env).

**Introducing Commit:** `353227b` — `refactor: migrate to API-based deployment (#325)`

### 3. Proposed Solutions

#### Solution 1: Pass `projectId` in deployment body (Recommended)

Add `config.vercelProjectId` to the deployment options body in `buildDeploymentOptions()`. The Vercel REST API `POST /v13/deployments` accepts `project` (project ID or name) in the request body.

**Pros:** Direct fix, minimal change, follows Vercel API contract
**Cons:** Need to verify exact field name accepted by `/v13/deployments`

#### Solution 2: Set `process.env.VERCEL_PROJECT_ID` before `@vercel/client` call

Explicitly set `process.env.VERCEL_PROJECT_ID` in addition to `core.exportVariable()`.

**Pros:** Simple one-liner
**Cons:** Relies on undocumented `@vercel/client` behavior; grep confirms `@vercel/client` doesn't read this env var

### 4. Testing Requirements

1. **Bug scenario test:** `prebuilt: true` + `vercelProjectId` set → verify `projectId` appears in deployment request
2. **Edge case:** `vercelProjectId` set without `vercelProjectName` → project ID should take precedence
3. **Regression:** Existing tests continue to pass (CLI path unaffected)

### 5. Similar Code Patterns

- `src/vercel-api.ts:62-103` — `buildDeploymentOptions()`: sets `options.name = config.vercelProjectName` if provided, but `config.vercelProjectId` is absent here too
- `src/config.ts:115-138` — `setVercelEnv()`: asymmetry between CLI path (env vars work) and API path (env vars ignored by `@vercel/client`)
