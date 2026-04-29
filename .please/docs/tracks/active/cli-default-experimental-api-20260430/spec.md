---
product_spec_domain: deployment
---

# CLI Default with Experimental API Mode

> Track: cli-default-experimental-api-20260430

## Overview

Restore the Vercel CLI as the default deployment client, and provide the `@vercel/client` API-based deployment as an opt-in experimental feature gated by a new `experimental-api` action input.

The previous track (`api-based-deployment-20260329`) made API the default when `vercel-args` was empty. However, `@vercel/client` is an internal Vercel package without semver guarantees, so users should explicitly opt in to the API path rather than have it imposed as the default.

## Requirements

### Functional Requirements

- [ ] FR-1: Add a new `experimental-api` boolean input to `action.yml` (default: `false`).
- [ ] FR-2: Default routing in `createVercelClient()` returns `VercelCliClient` when `experimental-api` is `false` (or unset).
- [ ] FR-3: When `experimental-api` is `true`, `createVercelClient()` returns `VercelApiClient` and emits a `core.warning` line stating that API mode is experimental and may break across `@vercel/client` updates.
- [ ] FR-4: When `experimental-api` is `true` AND `vercel-args` is non-empty, the action MUST fail fast with a clear configuration error explaining that the two inputs are mutually exclusive, and instruct the user to choose one.
- [ ] FR-5: When `vercel-args` is non-empty and `experimental-api` is `false`, route to `VercelCliClient` (legacy passthrough preserved).
- [ ] FR-6: Remove the `deprecationMessage` block from `vercel-args` and `scope` inputs in `action.yml` — CLI is now the standard mode and these inputs are no longer deprecated.
- [ ] FR-7: Update `ActionConfig` type and `getActionConfig()` parser in `src/config.ts` to surface the new `experimentalApi: boolean` field.
- [ ] FR-8: Update `README.md` with: (a) a new "Deployment Mode" section explaining CLI is default and `experimental-api` opt-in, (b) the warning that API mode is experimental, (c) the mutual exclusion rule with `vercel-args`.

### Non-functional Requirements

- [ ] NFR-1: Behavior parity — when API mode is enabled via `experimental-api`, deployment outputs (`preview-url`, `preview-name`, `deployment-id`) must match the previous API-default behavior.
- [ ] NFR-2: Released as a semver MINOR bump (no user code change is required to keep working — workflows that set `vercel-args` continue unchanged; users who relied on API as default must opt in, but this is a behavior change documented in release notes, not an API contract change).
- [ ] NFR-3: Test coverage ≥80% for new routing logic and config parsing changes.

## Acceptance Criteria

- [ ] AC-1: `pnpm test` — new unit tests cover all four routing matrix cases:
  - `experimental-api=false`, `vercel-args=""` → `VercelCliClient`
  - `experimental-api=false`, `vercel-args="--prod"` → `VercelCliClient`
  - `experimental-api=true`, `vercel-args=""` → `VercelApiClient` (with warning)
  - `experimental-api=true`, `vercel-args="--prod"` → throws config error before client construction
- [ ] AC-2: `pnpm test:integration` — emulator-backed test confirms `experimental-api=true` end-to-end deployment still produces the expected preview URL.
- [ ] AC-3: `pnpm build` succeeds and `dist/index.js` rebuilds cleanly.
- [ ] AC-4: `pnpm lint` passes with no new warnings.
- [ ] AC-5: Running the action with default inputs (no `experimental-api`, no `vercel-args`) on a sample workflow uses CLI mode (verifiable via `core.info` log line).
- [ ] AC-6: The `core.warning` is emitted exactly once per action run when `experimental-api=true`.

## Out of Scope

- Removing the `vercel` CLI npm dependency or the `@actions/exec` dependency.
- Removing or migrating `@vercel/client` away from internal-package status.
- Removing `zeit-*` / `now-*` deprecated inputs.
- Stabilizing the API mode (graduating from experimental → stable). That decision belongs to a future track once `@vercel/client` stability improves.
- Changes to `inspect()` or `assignAlias()` — these continue to use their current implementations on both clients.
- Reverting the new typed inputs (`target`, `prebuilt`, `force`, `env`, `build-env`, `regions`, `archive`, `root-directory`, `auto-assign-custom-domains`, `custom-environment`, `public`, `with-cache`) added by `api-based-deployment-20260329`. These remain available; only the routing default changes.

## Assumptions

- The existing `VercelClient` strategy interface and the two implementations (`VercelCliClient`, `VercelApiClient`) remain unchanged in shape — only the factory `createVercelClient()` selection logic and the config schema change.
- The typed inputs added by the previous track (`target`, `prebuilt`, `force`, etc.) are honored by `VercelCliClient` already. If they are not, that is tracked separately and not in scope here.
- Users who currently rely on the API default (no `vercel-args`, no opt-in) will receive CLI behavior after upgrade. Release notes will explicitly call out the change and the `experimental-api: true` opt-in.
- The mutual-exclusion error in FR-4 is preferable to silent precedence rules because it surfaces the misconfiguration immediately and avoids surprising deployments.
