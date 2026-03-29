# Migrate to API-based Deployment

> Track: api-based-deployment-20260329

## Overview

Replace the current Vercel CLI `exec`-based deployment with `@vercel/client` programmatic API. Redesign `vercel-args` CLI flag passthrough into explicit, typed action inputs mapped to Vercel API parameter names (`DeploymentOptions` / `VercelClientOptions`).

## Scope

### In Scope

1. **Architecture change**: Implement `VercelApiClient.deploy()` using `@vercel/client`'s `createDeployment` async generator, replacing `npx vercel` exec calls
2. **Input redesign**: Add explicit action inputs (`target`, `prebuilt`, `force`, `env`, `build-env`, `regions`, `archive`, `root-directory`, `auto-assign-custom-domains`, `custom-environment`, `public`, `with-cache`) mapped directly to API parameter names
3. **Backward compatibility**: Keep `vercel-args` as deprecated input — when provided, fall back to existing `VercelCliClient`
4. **GitMetadata auto-population**: Automatically build `gitMetadata` from GitHub Actions context (sha, ref, actor, commit message)

### Out of Scope

- Removing `vercel` CLI package dependency (future track)
- Removing `@actions/exec` dependency (future track)
- Removing deprecated `zeit-*` / `now-*` inputs
- `github-deployment` feature (GitHub Deployments API)

## Success Criteria

- [ ] SC-1: `VercelApiClient.deploy()` creates a deployment via `@vercel/client` and returns the deployment URL
- [ ] SC-2: All new action inputs are defined in `action.yml` with correct types and defaults
- [ ] SC-3: When `vercel-args` is empty, new inputs are used with API client (new default)
- [ ] SC-4: When `vercel-args` is provided, CLI client is used (backward compat fallback)
- [ ] SC-5: All existing tests pass without modification
- [ ] SC-6: New unit tests for `VercelApiClient.deploy()` with >80% coverage
- [ ] SC-7: Integration test via emulate.dev validates end-to-end API deployment
- [ ] SC-8: `inspect()` and `assignAlias()` continue to work via existing API implementation

## Constraints

- **Backward compatible**: `vercel-args` users must not be broken — semver minor release
- **Behavior parity**: API deployment must produce same outputs (preview-url, preview-name) as CLI deployment
- **Client selection logic**: `vercel-args` provided → CLI client; otherwise → API client
- **`@vercel/client` is an internal package**: API may change without semver guarantees; pin exact version

## Routing Logic

```
if (config.vercelArgs is non-empty) {
  // Backward compat: use CLI client (existing behavior)
  client = new VercelCliClient(config)
} else {
  // New default: use API client
  client = new VercelApiClient(config)
}
```
