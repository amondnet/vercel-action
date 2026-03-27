# Integration Tests with emulate.dev

> Track: emulate-integration-test-20260326

## Overview

Add integration tests for vercel-action using [emulate.dev](https://emulate.dev) — a local, stateful API emulator from Vercel Labs that provides production-fidelity Vercel and GitHub API emulation. This replaces the current approach of only having unit tests with mocked dependencies, enabling end-to-end validation of the action's core flows against realistic API responses.

## Requirements

### Functional Requirements

- [ ] FR-1: Set up emulate.dev as a dev dependency with Vitest globalSetup to start/stop the emulator
- [ ] FR-2: Integration tests for the Vercel deployment flow (create deployment, inspect, get URL)
- [ ] FR-3: Integration tests for alias domain assignment with template variables (`{{PR_NUMBER}}`, `{{BRANCH}}`)
- [ ] FR-4: Integration tests for GitHub PR/commit comment creation and updates via emulated GitHub API
- [ ] FR-5: Integration tests for GitHub Deployments API (deployment status creation/updates)
- [ ] FR-6: Integration tests run in CI via GitHub Actions workflow

### Non-functional Requirements

- [ ] NFR-1: Integration tests complete within 60 seconds
- [ ] NFR-2: No external network calls — all API interactions go through emulate.dev
- [ ] NFR-3: Tests are deterministic and isolated (emulator state resets between test suites)

## Acceptance Criteria

- [ ] AC-1: `pnpm test:integration` runs all integration tests using emulated Vercel API (port 4000) and GitHub API (port 4001)
- [ ] AC-2: Vercel deployment flow test creates a deployment and retrieves a valid deployment URL
- [ ] AC-3: Alias domain test assigns a custom domain with PR number/branch substitution
- [ ] AC-4: GitHub comment test creates and updates PR comments with deployment info
- [ ] AC-5: GitHub Deployments test creates deployment statuses with correct state transitions _(blocked: emulate.dev v0.2.0 does not support GitHub Deployments API; tests skip gracefully until emulator adds support)_
- [ ] AC-6: All integration tests pass in CI (added to `.github/workflows/ci.yml`)
- [ ] AC-7: Code coverage for integration tests is reported separately from unit tests

## Out of Scope

- Replacing existing unit tests (they remain as-is)
- Testing Vercel CLI command execution (the CLI itself is not emulated; tests target API interactions)
- Emulating Google API (not used by this action)
- Performance/load testing

## Assumptions

- emulate.dev (`npx emulate`) supports concurrent Vercel + GitHub API emulation
- The emulated APIs support the specific endpoint versions used by this action (v13 deployments, v2 user, etc.)
- emulate.dev can be installed as a dev dependency via npm/pnpm
