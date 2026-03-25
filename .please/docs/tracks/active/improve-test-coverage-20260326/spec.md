# Spec: Improve Test Coverage

## Context

The vercel-action project has a minimal test suite — `index.test.js` is empty. The core deployment logic, PR commenting, alias domain management, and input handling have no automated test coverage. This makes it risky to refactor or add features.

## Goal

Add meaningful unit tests for the core functionality of the GitHub Action, covering:

1. **Input parsing** — Vercel token, project/org IDs, working directory, alias domains, backward-compatible "zeit-" inputs
2. **Vercel CLI execution** — Command construction with appropriate flags (--prod, --token, --scope, etc.)
3. **PR/Commit commenting** — Comment creation and update logic via GitHub API
4. **Alias domain management** — Template variable substitution (PR number, branch) and API calls
5. **Error handling** — Graceful failures for missing tokens, failed deployments, API errors

## Non-Goals

- Refactoring `index.js` (that's a separate track)
- End-to-end testing with real Vercel deployments
- Achieving 100% coverage immediately

## Success Criteria

- Unit tests cover the main code paths in `index.js`
- Tests pass deterministically in CI (`pnpm test`)
- Code coverage >80% for tested modules
- All external dependencies (GitHub API, Vercel CLI, axios) are properly mocked
