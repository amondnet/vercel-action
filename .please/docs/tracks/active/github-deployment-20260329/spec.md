# GitHub Deployment Integration

> Track: github-deployment-20260329

## Overview

Integrate GitHub's Deployments API into the Vercel Action to provide native deployment tracking
within GitHub. When enabled, the action creates a GitHub Deployment record before deploying to
Vercel, updates its status throughout the deployment lifecycle, sets the environment URL to
the final deployment URL, and auto-deactivates previous deployments to the same environment.

This feature was originally prototyped in PR #45 (2020) and is now reimplemented on the current
TypeScript codebase with expanded capabilities.

## Requirements

### Functional Requirements

- [ ] FR-1: Add `github-deployment` boolean input (default: `false`). When `true`, create a
      GitHub Deployment via the GitHub API before running `vercel deploy`.
- [ ] FR-2: Add `github-deployment-environment` optional input. If not provided, auto-detect:
      `production` when `vercel-args` contains `--prod`, otherwise `preview`.
- [ ] FR-3: Create a GitHub Deployment with `auto_merge: false`, `required_contexts: []`,
      and the effective ref (PR head ref for pull_request events, context.ref otherwise).
- [ ] FR-4: Set deployment status to `in_progress` immediately after creating the deployment.
- [ ] FR-5: On successful Vercel deployment, update status to `success` with `log_url` set to
      the Vercel inspect URL and `environment_url` set to the final deployment URL (alias URL
      if configured, otherwise preview URL).
- [ ] FR-6: On Vercel deployment failure, update status to `failure` with an appropriate
      `description`.
- [ ] FR-7: Auto-deactivate previous deployments to the same environment by setting
      `transient_environment: true` or using the `auto_inactive` parameter.
- [ ] FR-8: Add `deployment-id` as a new action output so downstream steps can reference it.

### Non-functional Requirements

- [ ] NFR-1: GitHub Deployment operations must not block or fail the overall action — errors
      are logged as warnings and execution continues.
- [ ] NFR-2: GitHub Deployment requires `github-token` with `deployments: write` permission;
      if token is missing, skip silently with a debug message.
- [ ] NFR-3: All new code must follow existing TypeScript patterns (separate module, typed
      interfaces, unit tests).

## Acceptance Criteria

- [ ] AC-1: With `github-deployment: true`, a GitHub Deployment record appears in the repo's
      Environments tab after a successful action run.
- [ ] AC-2: The deployment status shows `success` with a clickable link to the Vercel preview URL.
- [ ] AC-3: With `--prod` in vercel-args, environment auto-detects as `production`; without it,
      environment auto-detects as `preview`.
- [ ] AC-4: Explicit `github-deployment-environment` input overrides auto-detection.
- [ ] AC-5: Previous deployments to the same environment are marked inactive.
- [ ] AC-6: If GitHub Deployment API call fails, the action still succeeds with a warning.
- [ ] AC-7: `deployment-id` output is set and usable by downstream steps.

## Out of Scope

- Automatic deletion/rollback of GitHub Deployments when Vercel deployments are rolled back
- Custom JSON payload support on GitHub Deployments
- Multiple environment deployments in a single action run
- GitHub Deployment protection rules integration

## Assumptions

- Users already provide `github-token` for PR comment features; the same token can be used
  for Deployments API if it has sufficient permissions.
- The `required_contexts: []` bypass is acceptable since CI status checks are managed
  separately in the user's workflow.
