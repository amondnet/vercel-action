# Known Gotchas

> Short, actionable pitfalls for this project. Check here first when behavior seems surprising.

- **Integration tests require `GITHUB_REPOSITORY` env var.** `src/__integration__/vercel-api.test.ts` (and any test that reaches `VercelApiClient.deploy`) calls `github.context.repo.owner` from `@actions/github`, which throws `context.repo requires a GITHUB_REPOSITORY environment variable like 'owner/repo'` when the env var is unset. CI sets this automatically; locally you must set it manually: `GITHUB_REPOSITORY=test-owner/test-repo pnpm test`. Discovered while implementing #341.

- **`working-directory` must resolve to an absolute path before reaching `@vercel/client`.** `createDeployment()` synchronously asserts `path.isAbsolute(options.path)` and throws `Provided path X is not absolute` otherwise. Since v42.2.0 (PR #325) the action deploys through this SDK path, so `getActionConfig()` normalizes the input via `parseWorkingDirectory()` in `src/config.ts`. If you ever route `config.workingDirectory` into a new API, assume it is already absolute; if you add a new input that also flows to `@vercel/client`, apply the same normalization at the boundary. See #341.
