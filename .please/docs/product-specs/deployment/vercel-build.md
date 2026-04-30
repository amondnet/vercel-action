---
id: SPEC-001
level: V_M
domain: deployment
feature: vercel-build
depends: []
conflicts: []
traces: []
created_at: 2026-04-30T00:49:41Z
updated_at: 2026-04-30T00:49:41Z
source_tracks: ["auto-vercel-build-20260430"]
---

# Local Vercel Build Step (`vercel-build` input) Specification

## Purpose

Specifies the opt-in `vercel-build` action input that runs the official Vercel CLI workflow (`vercel pull` → `vercel build`) inside the GitHub Actions runner before deployment, then uploads `.vercel/output` via the existing prebuilt deploy path. Mirrors the official Vercel KB recommended GitHub Actions workflow and lets users build inside CI with their own secrets and runtime instead of relying on Vercel's remote build.

## Requirements

### Requirement: Add `vercel-build` boolean input

The system MUST expose a new boolean action input `vercel-build` in `action.yml` with default `false`.

#### Scenario: Add `vercel-build` boolean input

- GIVEN the action is consumed in a workflow
- WHEN the user inspects the inputs
- THEN `vercel-build` is available as a boolean input defaulting to `false`

### Requirement: Run `vercel pull` and `vercel build` in working directory when enabled

The system MUST execute, in order, in the configured `working-directory` when `vercel-build: true` and `prebuilt: false`: (1) `vercel pull --yes --environment=<target> [--scope <scope>]`, (2) `vercel build [--prod] [--scope <scope>] [--output <dir>]`, (3) treat the resulting build output directory as the deploy artifact via the existing prebuilt code path. Authentication MUST be supplied via the `VERCEL_TOKEN` environment variable, never via a `--token`/`-t` CLI argument.

#### Scenario: Run `vercel pull` and `vercel build` in working directory when enabled

- GIVEN `vercel-build: true` and `prebuilt: false`
- WHEN the action runs
- THEN `vercel pull` runs first, `vercel build` runs second, and `.vercel/output` (or the configured `vercel-output-dir`) is uploaded as a prebuilt deployment

### Requirement: Reject mutually exclusive `vercel-build` + `prebuilt`

The system MUST fail fast at config-parse time with a clear error when both `vercel-build: true` and `prebuilt: true` are set.

#### Scenario: Reject mutually exclusive `vercel-build` + `prebuilt`

- GIVEN `vercel-build: true` AND `prebuilt: true`
- WHEN config parsing runs
- THEN the action exits non-zero before any I/O with a message identifying the conflict

### Requirement: Preserve current behavior when disabled

The system MUST preserve the current source-upload behavior unchanged when `vercel-build: false` (default).

#### Scenario: Preserve current behavior when disabled

- GIVEN `vercel-build` is unset or `false`
- WHEN the action runs
- THEN deployment payloads, calls, and outputs are byte-identical to the implementation prior to introducing `vercel-build`

### Requirement: Invoke pull/build via `@actions/exec` against the bundled `vercel` package

The system MUST invoke `vercel pull` and `vercel build` via `@actions/exec` against the bundled `vercel` CLI when `@vercel/client` does not expose a programmatic build/pull API.

#### Scenario: Invoke pull/build via `@actions/exec` against the bundled `vercel` package

- GIVEN the project depends on the `vercel` package and `@vercel/client` exposes no build/pull primitive
- WHEN the build step runs
- THEN both commands are spawned through `@actions/exec` rather than fetching the CLI on the fly

### Requirement: Propagate team scope to pull and build

The system MUST forward `vercel-org-id` / `--scope` to both `vercel pull` and `vercel build` invocations whenever a scope is configured.

#### Scenario: Propagate team scope to pull and build

- GIVEN `vercel-org-id` (or scope) is configured
- WHEN the build step runs
- THEN both `vercel pull` and `vercel build` receive the scope via `--scope`

### Requirement: Make `build-env` available to local build

The system MUST make `build-env` KEY=VALUE pairs available to the local `vercel build` execution as environment variables.

#### Scenario: Make `build-env` available to local build

- GIVEN `build-env` contains one or more KEY=VALUE pairs
- WHEN `vercel build` runs
- THEN the child process environment contains those variables in addition to `VERCEL_TOKEN`

### Requirement: Surface build failures with exit, log, and PR/commit comment

The system MUST, on `vercel build` failure, exit non-zero, stream stdout and stderr into the GitHub Actions log, and (when `github-comment` is enabled) post a comment on the PR or commit summarizing the failure with a truncated tail of build output.

#### Scenario: Surface build failures with exit, log, and PR/commit comment

- GIVEN `vercel build` exits non-zero and `github-comment` is not `false`
- WHEN the failure is observed
- THEN the action exits non-zero, the failure is visible in the log, and a comment is posted with the captured stderr tail (escaped to prevent fenced-block breakout)

### Requirement: Honor `vercel-output-dir` end-to-end

The system MUST pass `--output <dir>` to `vercel build` whenever `vercel-output-dir` is set, and the prebuilt deploy step MUST upload from the same directory. Relative paths are resolved against `working-directory`.

#### Scenario: Honor `vercel-output-dir` end-to-end

- GIVEN `vercel-build: true` AND `vercel-output-dir` is set to a custom path
- WHEN the build step runs
- THEN `vercel build --output <resolved-dir>` is invoked and the prebuilt deploy reads from the same `<resolved-dir>`

## Non-functional Requirements

### Requirement: No breaking change to existing inputs

The system SHOULD NOT introduce any breaking change to existing inputs or default behavior — existing workflows continue to work unchanged.

### Requirement: Stream build output without buffering

The system SHOULD stream build stdout and stderr without buffering the entire log in memory; only a bounded tail is captured for failure reporting.

### Requirement: Never expose Vercel token in logs or comments

The system SHOULD ensure the Vercel token never appears in any log line, PR/commit comment, or error message. Token transport uses the `VERCEL_TOKEN` environment variable; `@actions/exec` is configured with `silent: true` to suppress the `[command]…` echo line.

### Requirement: Maintain >80% test coverage on new code

The system SHOULD maintain test coverage above 80% for the new `vercel-build` module and orchestration code.
