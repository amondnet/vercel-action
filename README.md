# Vercel Action

![deploy website preview](https://github.com/amondnet/vercel-action/workflows/deploy%20website%20preview/badge.svg)
![test now-deployment action](https://github.com/amondnet/vercel-action/workflows/test%20now-deployment%20action/badge.svg)
![example - static](https://github.com/amondnet/vercel-action/workflows/example%20-%20static/badge.svg)
![example - basic auth](https://github.com/amondnet/vercel-action/workflows/example%20-%20basic%20auth/badge.svg)
![example - angular](https://github.com/amondnet/vercel-action/workflows/example%20-%20angular/badge.svg)

![stars](https://badgen.net/github/stars/amondnet/vercel-action)
![forks](https://badgen.net/github/forks/amondnet/vercel-action)
![HitCount](http://hits.dwyl.com/amondnet/vercel-action.svg)

[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=amondnet_vercel-action&metric=sqale_rating)](https://sonarcloud.io/dashboard?id=amondnet_vercel-action)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=amondnet_vercel-action&metric=sqale_index)](https://sonarcloud.io/dashboard?id=amondnet_vercel-action)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=amondnet_vercel-action&metric=bugs)](https://sonarcloud.io/dashboard?id=amondnet_vercel-action)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=amondnet_vercel-action&metric=code_smells)](https://sonarcloud.io/dashboard?id=amondnet_vercel-action)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=amondnet_vercel-action&metric=reliability_rating)](https://sonarcloud.io/dashboard?id=amondnet_vercel-action)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=amondnet_vercel-action&metric=security_rating)](https://sonarcloud.io/dashboard?id=amondnet_vercel-action)

This action was formerly [Zeit Now Deployment](https://github.com/marketplace/actions/zeit-now-deployment). [Migration Guide](#migration-from-v2)
![stars](https://badgen.net/github/stars/amondnet/now-deployment) ![forks](https://badgen.net/github/forks/amondnet/now-deployment)

## Introduction to Vercel
Vercel is a cloud platform for **static sites** and **Serverless Functions** that fits perfectly with your workflow. It enables developers to host **Jamstack** websites and web services that **deploy instantly**, **scale automatically**, and requires **no supervision**, all with **no configuration**.

This action make a Vercel deployment with github actions.

- [x] Deploy to Vercel.
- [x] Comment on pull request.
- [x] Comment on commit.
- [x] [Password Protect ( Basic Auth )](https://github.com/amondnet/vercel-action#basic-auth-example)
- [x] [Alias domain to deployment.](https://github.com/amondnet/vercel-action#alias-domains)
- [x] [Create Deployment on GitHub.](https://github.com/amondnet/vercel-action#github-deployments)

## Result

![preview](./preview.png)

[pull request example](https://github.com/amondnet/now-deployment/pull/2)

[commit](https://github.com/amondnet/now-deployment/commit/3d926623510294463c589327f5420663b1b0b35f)
## Inputs

| Name                             |         Required         | Default | Description                                                                                       |
|----------------------------------|:------------------------:|---------|---------------------------------------------------------------------------------------------------|
| vercel-token                     | <ul><li>- [x] </li></ol> |         | Vercel token. see https://vercel.com/account/tokens                                                                                   |
| github-comment                   | <ul><li>- [ ] </li></ol> |  true   | Its type can be either **string or boolean**. When string, it leaves PR a comment with the string. When boolean, it leaves PR a default comment(true) or does not leave a comment at all(false).                                                      |
| github-token                     | <ul><li>- [ ] </li></ol> |         | if you want to comment on pull request or commit. `${{ secrets.GITHUB_TOKEN }}` ([GitHub token docs](https://docs.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token))                                                         |
| github-deployment                | <ul><li>- [ ] </li></ol> |  false  | if you want to create a [GitHub Deployment](https://docs.github.com/en/rest/deployments/deployments), set `true`.                                                      |
| github-deployment-environment    | <ul><li>- [ ] </li></ol> |         | The environment for the GitHub deployment (e.g., `production`, `staging`, `preview`). If not specified, auto-detects: `production` when `vercel-args` contains `--prod`, otherwise `preview`. |
| vercel-project-id                | <ul><li>- [x] </li></ol> |         | ❗Vercel CLI 17+,The `name` property in vercel.json is deprecated (https://zeit.ink/5F)                  |
| vercel-org-id                    | <ul><li>- [x] </li></ol> |         | Vercel team ID (also used as `teamId` for API deployments). See [How can I use GitHub Actions with Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel) |
| vercel-args                      | <ul><li>- [ ] </li></ol> |         | Ad-hoc CLI flags forwarded to the Vercel CLI (e.g. `--prod --force`). Mutually exclusive with `experimental-api`. |
| working-directory                | <ul><li>- [ ] </li></ol> |         | the working directory                                                                             |
| scope                            | <ul><li>- [ ] </li></ol> |         | Team slug for the Vercel CLI `--scope` flag. Prefer `vercel-org-id`, which works in both CLI and experimental API modes. |
| experimental-api                 | <ul><li>- [ ] </li></ol> |  false  | ⚠️ **Experimental.** Opt in to API-based deployment via `@vercel/client`. The CLI is the default and recommended path. The API client relies on an internal Vercel package without semver guarantees and may break across updates. Mutually exclusive with `vercel-args`. |
| alias-domains                    | <ul><li>- [ ] </li></ol> |         | You can assign a domain to this deployment. Please note that this domain must have been configured in the project. You can use pull request number via `{{PR_NUMBER}}` and branch via `{{BRANCH}}`.
| vercel-project-name              | <ul><li>- [ ] </li></ol> |         | The name of the project; if absent we'll use the `vercel inspect` command to determine. [#27](https://github.com/amondnet/vercel-action/issues/27) & [#28](https://github.com/amondnet/vercel-action/issues/28)
| vercel-version                   | <ul><li>- [x] </li></ol> |         | vercel-cli package version if absent we will use one declared in [package.json](https://github.com/amondnet/vercel-action/blob/master/package.json)

### Experimental API Deployment Inputs

These typed inputs map onto `@vercel/client`'s `DeploymentOptions` and `VercelClientOptions`. They only take effect when **experimental API mode is enabled** with `experimental-api: true` (see [Deployment Mode](#deployment-mode) below). They are ignored in the default CLI mode.

> **Note:** When experimental API mode is enabled, the API path honors your project's `vercel.json` — including `buildCommand`, `installCommand`, `outputDirectory`, and `framework` — along with `engines.node` from `package.json`. Projects with custom build scripts (e.g. `"buildCommand": "./build.sh"`) work without a `--prod` workaround. Fixes [#336](https://github.com/amondnet/vercel-action/issues/336).

| Name                       | Required | Default   | Description                                                        |
|----------------------------|:--------:|-----------|--------------------------------------------------------------------|
| target                     |    No    | `preview` | Deployment target: `production` or `preview`                       |
| prebuilt                   |    No    | `false`   | Deploy prebuilt output (requires a prior `vercel build` step). Mutually exclusive with `vercel-build`. |
| vercel-build               |    No    | `false`   | Run `vercel pull` + `vercel build` inside the action before deploying, then upload `.vercel/output` via the prebuilt path. Mutually exclusive with `prebuilt`. See ["Build inside the action"](#method-4---build-inside-the-action-vercel-build) below. |
| vercel-output-dir          |    No    |           | Custom path to prebuilt output. Defaults to `{working-directory}/.vercel/output` |
| force                      |    No    | `false`   | Force new deployment, bypassing dedupe and build cache             |
| env                        |    No    |           | Environment variables (`KEY=VALUE` per line)                       |
| build-env                  |    No    |           | Build-time environment variables (`KEY=VALUE` per line)            |
| regions                    |    No    |           | Deployment regions, comma-separated (e.g. `iad1,sfo1`)            |
| archive                    |    No    |           | Upload format: `tgz` for compressed archive                       |
| root-directory             |    No    |           | Root directory of the project relative to the repository root      |
| auto-assign-custom-domains |    No    | `true`    | Automatically assign custom domains to this deployment             |
| custom-environment         |    No    |           | Custom environment slug or ID                                      |
| public                     |    No    | `false`   | Make deployment source publicly accessible                         |
| with-cache                 |    No    | `false`   | Retain build cache from previous deployments                       |

## Outputs

### `preview-url`

The url of deployment preview.

### `preview-name`

The name of deployment name.

### `deployment-id`

The GitHub Deployment ID. Only set when `github-deployment` is `true`. Can be used by downstream steps to reference the deployment.

## How To Use

### Disable Vercel for GitHub

> The Vercel for GitHub integration automatically deploys your GitHub projects with Vercel, providing Preview Deployment URLs, and automatic Custom Domain updates.
> See [Git Configuration](https://vercel.com/docs/project-configuration/git-configuration) for more details.

We would like to use `github actions` for build and deploy instead of `Vercel`.

Disable automatic deployments by setting `git.deploymentEnabled: false` in your project configuration.

#### Using `vercel.ts` (recommended)

Install `@vercel/config` and create a `vercel.ts` file:

```typescript
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  public: false,
  git: {
    deploymentEnabled: false,
  },
};
```

#### Using `vercel.json`

```json
{
  "public": false,
  "git": {
    "deploymentEnabled": false
  }
}
```

> **Note:** The `github.enabled` property is deprecated. Use `git.deploymentEnabled` instead.
> See [Turning off all automatic deployments](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments).

### Skip vercel's build step

Since we do the `build` in `github actions`, we don't need to build in `vercel`.

#### Method 1 - via vercel interface

- Specify "Other" as the framework preset, and
- Enable the Override option for the Build Command, and
- Leave the Build Command **empty**.
- This will prevent the build from being attempted and serve your content as-is.

See [docs](https://vercel.com/docs/concepts/deployments/build-step#build-command) for more details

#### Method 2 - via project configuration

You can override the build command in your project configuration to skip Vercel's build step.

**`vercel.ts`** (recommended):

```typescript
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: '',
};
```

**`vercel.json`**:

```json
{
  "buildCommand": ""
}
```

See [Build Command docs](https://vercel.com/docs/deployments/configure-a-build#build-command) and [Programmatic Configuration](https://vercel.com/docs/project-configuration/vercel-ts) for more details.

#### Method 3 - Prebuilt deployments (recommended)

You can build your project locally (or in GitHub Actions) using `vercel build` and upload only the build artifacts to Vercel — without giving Vercel access to the source code. This uses the [Build Output API](https://vercel.com/docs/build-output-api/v3) specification.

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
      - name: Pull Vercel Environment Information
        run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      - name: Build Project Artifacts
        run: vercel build --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      - uses: amondnet/vercel-action@v42
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          prebuilt: true
```

See [Vercel's official GitHub Actions example](https://github.com/vercel/examples/tree/main/ci-cd/github-actions) for more details.

#### Method 4 - Build inside the action (`vercel-build`)

If you want the same prebuilt-deploy benefits as Method 3 but prefer not to manage `vercel pull` / `vercel build` steps yourself, set `vercel-build: true`. The action will run `vercel pull` followed by `vercel build` inside the runner and then upload the resulting `.vercel/output` via the prebuilt path.

This mirrors the [Vercel KB recommended GitHub Actions workflow](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel#configuring-github-actions-for-vercel) but consolidates pull + build + deploy into a single step.

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v42
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-build: true
```

Notes:

- `vercel-build` and `prebuilt` are mutually exclusive. Use `prebuilt: true` if you've already produced `.vercel/output` in an earlier step (Method 3); use `vercel-build: true` to let the action run the build for you.
- Build-time secrets (`build-env`) are forwarded to `vercel build`.
- The Vercel token is supplied to the CLI via the `VERCEL_TOKEN` environment variable (the documented non-interactive auth path), never as a `--token` argument.
- When `target: production` is set, the action passes `--environment=production` to `vercel pull` and `--prod` to `vercel build`.
- When `vercel-output-dir` is also provided, the action passes `--output <dir>` to `vercel build` so the artifact is written where the prebuilt deploy step reads from.
- If `vercel build` fails, the action exits non-zero and (when `github-comment: true`) posts a comment on the PR/commit with the last 20 lines of build output.

### Project Linking

You should link a project via [Vercel CLI](https://vercel.com/download) in locally.

When running `vercel` in a directory for the first time, [Vercel CLI](https://vercel.com/download) needs to know which scope and Project you want to deploy your directory to. You can choose to either link an existing project or to create a new one.

> NOTE: Project linking requires at least version 17 of [Vercel CLI](https://vercel.com/download). If you have an earlier version, please [update](https://vercel.com/guides/updating-vercel-cli) to the latest version.

```bash
vercel
```

```bash
? Set up and deploy “~/web/my-lovely-project”? [Y/n] y
? Which scope do you want to deploy to? My Awesome Team
? Link to existing project? [y/N] y
? What’s the name of your existing project? my-lovely-project
🔗 Linked to awesome-team/my-lovely-project (created .vercel and added it to .gitignore)
```

Once set up, a new `.vercel` directory will be added to your directory. The `.vercel` directory contains both the organization(`vercel-org-id`) and project(`vercel-project-id`) id of your project.

```json
{ "orgId": "example_org_id", "projectId": "example_project_id" }
```

You can save both values in the secrets setting in your repository. Read the [Official documentation](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets) if you want further info on how secrets work on Github.

### Github Actions

* This is a complete `.github/workflows/deploy.yml` example.

Set the `vercel-project-id` and `vercel-org-id` you found above.

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      #  your build commands
      # - run: |
      #    ng build --prod
      - uses: amondnet/vercel-action@v42 # deploy
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }} # Required
          github-token: ${{ secrets.GITHUB_TOKEN }} # Optional
          vercel-args: --prod # Optional
          vercel-org-id: ${{ secrets.ORG_ID}} # Required
          vercel-project-id: ${{ secrets.PROJECT_ID}} # Required
          working-directory: ./sub-directory
```

### Angular Example

See [.github/workflows/example-angular.yml](/.github/workflows/example-angular.yml) ,

### Basic Auth Example

How to add Basic Authentication to a Vercel deployment

See [.github/workflows/example-express-basic-auth.yml](.github/workflows/example-express-basic-auth.yml)

[source code](https://github.com/amondnet/vercel-action/tree/master/example/express-basic-auth)

| `@now/node-server` is deprecated and stopped working. Use `@vercel/node` instead. #61

### Alias Domains

You can assign a domain to this deployment. Please note that this domain must have been [configured](https://vercel.com/docs/v2/custom-domains#adding-a-domain) in the project.

If you want to assign domain to branch or pr, you should add [Wildcard Domain](https://vercel.com/docs/v2/custom-domains#wildcard-domains).

You can use pull request number via `{{PR_NUMBER}}` and branch via `{{BRANCH}}`

#### Example

Wildcard Domains : *.angular.vercel-action.amond.dev

*Per Pull Request*

https://pr-{{PR_NUMBER}}.angular.vercel-action.amond.dev

- PR-1 -> https://pr-1.angular.vercel-action.amond.dev
- PR-2 -> https://pr-2.angular.vercel-action.amond.dev

*Per Branch*

https://{{BRANCH}}.angular.vercel-action.amond.dev

- develop -> https://develop.angular.vercel-action.amond.dev
- master -> https://master.angular.vercel-action.amond.dev
- master -> https://master.angular.vercel-action.amond.dev

See [.github/workflows/example-angular.yml](/.github/workflows/example-angular.yml)

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/vercel-action@v42
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }} # Required
          github-token: ${{ secrets.GITHUB_TOKEN }} # Optional
          vercel-args: --prod # Optional
          vercel-org-id: ${{ secrets.ORG_ID}} # Required
          vercel-project-id: ${{ secrets.PROJECT_ID}} # Required
          working-directory: ./sub-directory # Your Working Directory, Optional
          alias-domains: | # Optional
            staging.angular.vercel-action.amond.dev
            pr-{{PR_NUMBER}}.angular.vercel-action.amond.dev
```

### GitHub Deployments

You can create [GitHub Deployments](https://docs.github.com/en/rest/deployments/deployments) to track your Vercel deployments directly in GitHub's Environments tab.

Set `github-deployment` to `true` and provide a `github-token` with `deployments: write` permission.

The environment is auto-detected from `vercel-args`: `production` when `--prod` is present, otherwise `preview`. You can override this with `github-deployment-environment`.

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      deployments: write
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/vercel-action@v42
        id: vercel
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID}}
          vercel-project-id: ${{ secrets.PROJECT_ID}}
          github-deployment: true
          # github-deployment-environment: staging  # Optional override
      - run: echo "Deployment ID is ${{ steps.vercel.outputs.deployment-id }}"
```

The deployment lifecycle:
1. A GitHub Deployment is created with status `in_progress` before the Vercel deploy
2. On success, the status is updated to `success` with the preview URL
3. On failure, the status is updated to `failure`
4. Previous deployments to the same environment are automatically deactivated

> **Note:** GitHub Deployment errors are non-blocking. If the GitHub API call fails, the Vercel deployment will still proceed normally.

## Deployment Mode

The action runs the Vercel CLI by default. An experimental API-based path using `@vercel/client` is also available behind an opt-in flag.

### CLI mode (default, recommended)

The default mode runs the Vercel CLI under the hood. It is stable, depends only on published `vercel` CLI versions, and supports all CLI flags through the `vercel-args` input.

```yaml
- uses: amondnet/vercel-action@v42
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    vercel-org-id: ${{ secrets.ORG_ID }}
    vercel-project-id: ${{ secrets.PROJECT_ID }}
    vercel-args: --prod
```

When the CLI path is selected, the action logs `Using CLI-based deployment`.

### Experimental API mode (opt-in)

API mode runs `@vercel/client` directly instead of spawning the CLI. It exposes typed inputs (`target`, `prebuilt`, `force`, `env`, `build-env`, `regions`, `archive`, `root-directory`, `auto-assign-custom-domains`, `custom-environment`, `public`, `with-cache`) that map onto `DeploymentOptions` and `VercelClientOptions`.

```yaml
- uses: amondnet/vercel-action@v42
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    vercel-org-id: ${{ secrets.ORG_ID }}
    vercel-project-id: ${{ secrets.PROJECT_ID }}
    experimental-api: true
    target: production
    force: true
    env: |
      API_URL=https://api.example.com
```

When the API path is selected, the action emits a `core.warning`:

```
Using experimental API-based deployment via @vercel/client. This is an internal
Vercel package without semver guarantees and may break across updates. Set
"experimental-api: false" or remove the input to use the stable CLI-based deployment.
```

> **Why is this experimental?** `@vercel/client` is an internal Vercel package published on npm under Apache-2.0 but without semver guarantees. Vercel may change its behavior or types between releases. The CLI is the supported, stable path; only opt in to API mode if you need the typed inputs and accept the upgrade risk.

### Mutual exclusion

`experimental-api: true` and `vercel-args` cannot be used together. The action fails fast at config parse time with a clear error explaining the conflict — choose one mode and remove the other input.

### CLI ↔ API input mapping

If you choose to opt in to experimental API mode, the typed inputs replace the equivalent CLI flags:

| CLI mode (`vercel-args`) | Experimental API mode |
|---|---|
| `--prod` | `target: production` |
| `--prebuilt` | `prebuilt: true` |
| `--force` | `force: true` |
| `--public` | `public: true` |
| `--env KEY=VALUE` | `env: KEY=VALUE` (multiline) |
| `--build-env KEY=VALUE` | `build-env: KEY=VALUE` (multiline) |
| `--regions iad1,sfo1` | `regions: iad1,sfo1` |
| `--archive=tgz` | `archive: tgz` |
| `--root-directory ./app` | `root-directory: ./app` |
| `scope: my-team` | `vercel-org-id: team_xxx` |

### API-only inputs

These inputs only take effect in experimental API mode (`experimental-api: true`):

- `auto-assign-custom-domains` — automatically assign custom domains (default: `true`)
- `custom-environment` — custom environment slug or ID
- `with-cache` — retain build cache from previous deployments
- `vercel-output-dir` — directory containing prebuilt output (relevant when `prebuilt: true`)

### Migrating from a previous version

Earlier `v42.x` releases routed to the API client by default whenever `vercel-args` was empty. Starting with this release, the CLI is the default in every case and the API path requires explicit opt-in.

If your workflow previously relied on the implicit API default (no `vercel-args`, no opt-in), you have two options:

1. **Stay on CLI (recommended).** Your workflow already does the right thing — no change required. If you previously set typed inputs like `target` or `force`, move those values into `vercel-args` (e.g. `vercel-args: --prod --force`).
2. **Keep using API mode.** Add `experimental-api: true` to your workflow inputs and accept the experimental warning. Typed inputs (`target`, `force`, `env`, …) continue to apply.

Workflows that already passed `vercel-args` are unaffected — they were on the CLI path before and remain on the CLI path now.

## Migration from v2

1. Change action name in `workflows` from `now-deployment` to `vercel-action`
   ```yaml
   - name: Vercel Action
     uses: amondnet/vercel-action@v42
   ```
2. Change input values.
    - `zeit-token` -> `vercel-token`
    - `now-org-id` -> `vercel-org-id`
    - `now-project-id` -> `vercel-project-id`
