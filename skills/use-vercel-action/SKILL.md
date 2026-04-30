---
name: use-vercel-action
description: Wire `amondnet/vercel-action` into a GitHub Actions workflow to deploy Vercel projects from CI. Use when the user asks to deploy to Vercel from GitHub Actions, add Vercel preview deploys, post a Vercel preview URL on a PR, configure prebuilt Vercel deployments, set up alias domains for previews, create a GitHub Deployment for Vercel, or migrate off Vercel's native GitHub integration. Covers required tokens/IDs, the CLI vs experimental-API modes, prebuilt flows, alias placeholders, deprecated `zeit-*`/`now-*` aliases, and the action's outputs (`preview-url`, `preview-name`, `deployment-id`).
---

# use-vercel-action

This skill teaches an agent how to consume `amondnet/vercel-action` correctly. Inputs and outputs documented here come from `action.yml` in this repo — when in doubt, open `action.yml` for the full surface.

## When to use

- Adding `amondnet/vercel-action` to a workflow for the first time.
- Fixing a workflow that already uses the action (input names, mutual exclusions, missing prerequisites).
- Choosing between CLI mode (default), experimental API mode, and the two prebuilt flows.
- Migrating from Vercel's native GitHub integration to action-driven deploys.

## When NOT to use

- The user just wants the Vercel CLI locally (no GitHub Actions involved) — refer them to the [official Vercel CLI docs](https://vercel.com/docs/cli) instead.
- The user is happy with Vercel's native GitHub integration and isn't asking for action-based deploys.

## Mandatory prerequisites

Consumers consistently miss these. Verify each before writing the workflow:

1. **Disable Vercel's native auto-deploys** in the project repo, otherwise both Vercel and the action will deploy and you'll get duplicate previews. Add to `vercel.json` (or `vercel.ts`):
   ```json
   { "git": { "deploymentEnabled": false } }
   ```
   Legacy projects may instead use the older `{ "github": { "enabled": false } }` — both are accepted.

2. **Link the project locally and capture the IDs.** Run `vercel link` once on a developer machine; this writes `.vercel/project.json` with `projectId` and `orgId`. Store those values as GitHub repository secrets:
   - `VERCEL_TOKEN` — created at https://vercel.com/account/tokens
   - `VERCEL_ORG_ID` — from `.vercel/project.json`
   - `VERCEL_PROJECT_ID` — from `.vercel/project.json`

   Do not commit raw IDs into workflow files; reference them via `${{ secrets.* }}`.

3. **GitHub Deployments need explicit permission.** If you set `github-deployment: true`, the workflow job must declare `permissions: deployments: write` (and usually `contents: read`). Without it the deployment write call fails.

4. **Action runtime is Node 24.** No consumer-side Node setup is needed for the action itself — the runner provides it.

## Quick start: preview deploy on every PR

```yaml
name: Preview Deploy
on:
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v42
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

`github-token` is what enables the action to comment the preview URL on the PR. Omit it (or set `github-comment: false`) if you don't want the comment.

## Common patterns

### Production deploy on push to main

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v42
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: --prod
```

### Prebuilt — Method 1: build outside the action

Build with the Vercel CLI in a prior step, then deploy the prebuilt output. Best when you need to share the build artifact with other steps (tests, smoke checks).

```yaml
- run: npm install --global vercel@latest
- run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
  env:
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
- run: vercel build --token=${{ secrets.VERCEL_TOKEN }}
  env:
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
- uses: amondnet/vercel-action@v42
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    prebuilt: true
```

The `npm install --global vercel@latest` step is required on a fresh runner — the Vercel CLI is not preinstalled on GitHub-hosted runners.

### Prebuilt — Method 2: let the action build

`vercel-build: true` runs `vercel pull` + `vercel build` inside the action and then deploys the prebuilt output. Simpler — one step total — but you can't reuse the build artifact elsewhere.

```yaml
- uses: amondnet/vercel-action@v42
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    vercel-build: true
```

### Alias domains with placeholders

`alias-domains` accepts one domain per line and substitutes `{{PR_NUMBER}}` and `{{BRANCH}}`. The domains must already exist on the Vercel project.

```yaml
- uses: amondnet/vercel-action@v42
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    alias-domains: |
      pr-{{PR_NUMBER}}.preview.example.com
      {{BRANCH}}.preview.example.com
```

When alias domains are present the `preview-url` output is the first alias rather than the raw deployment URL.

### GitHub Deployments

```yaml
permissions:
  contents: read
  deployments: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v42
        id: vercel
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          github-deployment: true
          # Optional override; otherwise auto-derived from vercel-args.
          # github-deployment-environment: staging
      - run: echo "Deployment id ${{ steps.vercel.outputs.deployment-id }}"
```

Deployment lifecycle: created `in_progress` before deploy, then transitioned to `success` (with the preview/alias URL as the environment URL) or `failure`. Previous deployments to the same environment are auto-deactivated.

## Input reference (essentials)

| Input | Required | Notes |
|---|---|---|
| `vercel-token` | yes | Vercel personal token. |
| `vercel-org-id` | yes | Required for Vercel CLI 17+. Works for both CLI and API modes — prefer over `scope`. |
| `vercel-project-id` | yes | Required for Vercel CLI 17+. |
| `vercel-args` | no | Ad-hoc CLI flags (e.g. `--prod`, `--force`). **Mutually exclusive with `experimental-api` and `vercel-build`**. |
| `working-directory` | no | Run the deploy from a subdirectory. |
| `alias-domains` | no | Multi-line list; supports `{{PR_NUMBER}}` and `{{BRANCH}}`. |
| `prebuilt` | no | Deploy a prebuilt `.vercel/output` directory. **Mutually exclusive with `vercel-build`**. |
| `vercel-build` | no | Run `vercel pull` + `vercel build` inside the action. **Mutually exclusive with `prebuilt` and `vercel-args`**. |
| `vercel-output-dir` | no | Override the prebuilt output path. Defaults to `{working-directory}/.vercel/output` when `prebuilt: true`. |
| `github-token` | no | Needed for PR/commit comments. |
| `github-comment` | no | `true` (default), `false`, or a custom comment string. |
| `github-deployment` | no | `true` to create a GitHub Deployment. Requires `permissions: deployments: write`. |
| `github-deployment-environment` | no | Override the auto-derived environment name. |

For the long tail (`target`, `force`, `env`, `build-env`, `regions`, `archive`, `root-directory`, `auto-assign-custom-domains`, `custom-environment`, `public`, `with-cache`, `scope`, `vercel-version`, `vercel-project-name`, `experimental-api`) read `action.yml` — every input there is the source of truth.

## Outputs

| Output | Set when | Notes |
|---|---|---|
| `preview-url` | always | Raw deployment URL, or the first alias domain if `alias-domains` is set. |
| `preview-name` | always | Deployment name (resolved via `vercel inspect`). |
| `deployment-id` | only when `github-deployment: true` | GitHub Deployment ID — useful for follow-up status updates. |

## Mutual exclusions and gotchas

- `experimental-api: true` cannot be combined with `vercel-args`. The API client uses `@vercel/client`, an internal Vercel package without semver guarantees — keep CLI mode (the default) unless the user explicitly wants the typed inputs (`target`, `regions`, `env`, `build-env`, `public`, `with-cache`, `custom-environment`, `auto-assign-custom-domains`).
- `prebuilt` cannot be combined with `vercel-build`. Pick exactly one prebuilt flow.
- `vercel-build: true` cannot be combined with a non-empty `vercel-args`. The action throws at config-parse time with a clear error — `vercel-build` deploys the locally produced `.vercel/output` via the prebuilt path, while `vercel-args` routes through the CLI path which would ignore that output.
- `scope` is CLI-mode only. Prefer `vercel-org-id` so the same workflow works in both modes.
- The auto-detected GitHub Deployment environment is mode-dependent. **CLI mode**: `production` if `vercel-args` contains `--prod` or `--production`, otherwise `preview`. **Experimental API mode**: derived from `target` (`production` or `preview`). Set `github-deployment-environment` explicitly for `staging` and similar in either mode.
- Deprecated input aliases (still accepted, emit deprecation warnings): `zeit-token` → `vercel-token`, `now-args` → `vercel-args`, `now-project-id` → `vercel-project-id`, `now-org-id` → `vercel-org-id`. Always rewrite to the modern names.
- The action sets `VERCEL_TELEMETRY_DISABLED=1` and exports `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` from the corresponding inputs — don't redeclare them in `env:` for the action step itself.

## References

- `action.yml` — full input/output contract (source of truth).
- `README.md` — additional examples and a longer changelog.
- https://vercel.com/account/tokens — where to mint the `VERCEL_TOKEN` secret.
