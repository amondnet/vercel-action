---
product_spec_domain: deployment/vercel-build
---

# Local Vercel Build Step (`vercel-build` input)

> Track: auto-vercel-build-20260430

## Overview

Add a new `vercel-build` action input that, when set to `true`, instructs the action to execute the official Vercel CLI workflow locally before deployment: `vercel pull --environment=<target>` → `vercel build` → upload `.vercel/output` via the existing prebuilt deploy path. This mirrors the recommended workflow in the [Vercel KB GitHub Actions guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel#configuring-github-actions-for-vercel) and lets users build inside CI (with their own secrets and runtime) instead of relying on Vercel's remote build.

The current default behavior (uploading source via `@vercel/client` for remote build) is preserved when `vercel-build` is `false` (the default), maintaining backward compatibility with existing pipelines.

## Requirements

### Functional Requirements

- [ ] FR-1: Add a new boolean action input `vercel-build` to `action.yml` (default: `false`).
- [ ] FR-2: When `vercel-build: true` and `prebuilt: false`, the action MUST execute, in order, in the configured `working-directory`:
  1. `vercel pull --yes --environment=<target> [--scope <scope>]` (where `<target>` is `production` or `preview` based on the existing `production`/`target` inputs)
  2. `vercel build [--prod] [--scope <scope>] [--output <dir>]` (the `--prod` flag is included only when targeting production; `--output <dir>` is included only when `vercel-output-dir` is provided)
  3. Treat the resulting build output directory as the deploy artifact, using the existing prebuilt deploy code path (`config.prebuilt = true`, `vercelOutputDir` defaulted to `<working-directory>/.vercel/output` or set to `vercel-output-dir` when provided).
  - Authentication for both commands MUST be supplied via the `VERCEL_TOKEN` environment variable (the documented non-interactive auth path), never via a `--token`/`-t` CLI argument.
- [ ] FR-3: When `vercel-build: true` AND `prebuilt: true`, the action MUST fail fast with a clear error: the two flags are mutually exclusive (prebuilt means the user already built; `vercel-build: true` asks the action to build).
- [ ] FR-4: When `vercel-build: false` (default), preserve the current source-upload behavior — no behavior change for existing users.
- [ ] FR-5: The `vercel pull` and `vercel build` commands MUST be invoked programmatically through the `@vercel/client` SDK if it exposes a build/pull API; otherwise fall back to executing the bundled `vercel` package via `@actions/exec`. (Investigation of `@vercel/client` capability happens in the plan phase.)
- [ ] FR-6: If the team scope is configured (`vercel-org-id` / `--scope`), it MUST be propagated to both `vercel pull` and `vercel build` invocations.
- [ ] FR-7: Build environment variables (`build-env`) MUST be available to the local `vercel build` execution.
- [ ] FR-8: On `vercel build` failure, the action MUST:
  - Fail the action with a non-zero exit code,
  - Stream/capture build stdout+stderr into the GitHub Actions log,
  - Post a comment on the PR/commit (when comments are enabled) summarizing the failure with a truncated tail of build output.

### Non-functional Requirements

- [ ] NFR-1: No breaking change to existing inputs or default behavior — existing workflows continue to work unchanged.
- [ ] NFR-2: Build output streaming MUST not buffer the entire log in memory (use streamed exec).
- [ ] NFR-3: Vercel token MUST never appear in logs, comments, or error messages (existing secret-masking guarantees apply).
- [ ] NFR-4: Test coverage for new code MUST exceed 80% (per `workflow.md`).

## Acceptance Criteria

- [ ] AC-1: Setting `vercel-build: true` with `prebuilt: false` runs `vercel pull` then `vercel build` in `working-directory`, then deploys `.vercel/output` as a prebuilt deployment, and the resulting deployment URL is returned via the `preview-url` output.
- [ ] AC-2: Setting `vercel-build: true` with `prebuilt: true` fails the action immediately with a message identifying the conflict, and does not call any Vercel API.
- [ ] AC-3: With `vercel-build` unset or `false`, deployments produce identical behavior, payloads, and outputs to the current implementation (verified via existing integration tests).
- [ ] AC-4: When `vercel build` fails, the action exits non-zero, the failure is visible in the GitHub Actions log, and a PR/commit comment containing the truncated tail of build output is posted (when comments are enabled).
- [ ] AC-5: Targeting production (`production: true`) passes `--prod` to `vercel build` and `--environment=production` to `vercel pull`; otherwise uses `preview`.
- [ ] AC-6: Build secrets (`build-env`) and team scope (`vercel-org-id`) are honored by the local `vercel build` execution.
- [ ] AC-7: When `vercel-output-dir` is provided, `vercel build` is invoked with `--output <dir>` so the build artifact is written where the prebuilt deploy step expects it. When `vercel-output-dir` is empty, `vercel build` writes to its default `.vercel/output` and the deploy reads from the same default.

## Out of Scope

- Auto-detection of when a build is needed (no inference; behavior is purely flag-driven).
- Caching `.vercel/output` between runs (tracked separately as a future optimization).
- Custom build commands beyond `vercel build` (users should configure `buildCommand` in `vercel.json`).
- Deprecating the current source-upload path (a future major version may revisit defaults; not part of this track).
- Running `vercel build` independently of deployment (no "build only" mode in this track).
- Changes to the legacy `vercel-args` CLI fallback path.

## Assumptions

- The `@vercel/client` SDK (v17.2.65, currently a dependency) is the preferred entry point. If it does not expose a build/pull primitive, the bundled `vercel` package (v50.0.0, already a dependency) will be invoked via `@actions/exec`. This decision is deferred to the plan phase.
- The `working-directory` input, after normalization in `parseWorkingDirectory()` (`src/config.ts`), is an absolute path — confirmed by existing gotcha #341. The new build step relies on this same guarantee.
- Existing prebuilt deploy code path (`vercel-api.ts:41-45`, `buildClientOptions`) correctly handles `.vercel/output` upload and only needs to be invoked after a successful local build.
- `production: true` is the existing convention for production deployments; the new build step infers `--prod` from this flag rather than introducing a new target input.
- Out-of-scope decisions in Section "Out of Scope" reflect the user's intent to keep this track tightly focused on the build-step feature; revisit in follow-up tracks if needed.
