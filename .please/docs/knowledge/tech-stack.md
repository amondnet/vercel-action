# Tech Stack: Vercel Action

## Runtime & Language

- **Node.js 22** — Development engine requirement
- **Node.js 20** — GitHub Actions runtime (`runs.using: node20` in action.yml)
- **JavaScript (CommonJS)** — Primary language; single entry point `index.js`

## Package Manager

- **pnpm 10.15.0** — Monorepo with workspace examples in `example/`

## Core Dependencies

| Package | Purpose |
|---|---|
| `@actions/core` | GitHub Actions toolkit (inputs, outputs, logging, secrets) |
| `@actions/exec` | Shell command execution for Vercel CLI (fallback) |
| `@actions/github` | GitHub API client (Octokit) for PR/commit comments |
| `@actions/http-client` (v2.2.3) | HTTP client for Vercel REST API (pinned to v2 for CJS/ncc compat) |
| `@vercel/client` (v17.2.65) | Programmatic deployment API — file upload, hashing, status polling |
| `axios` | HTTP requests for alias domain management |
| `vercel` (v50.0.0) | Vercel CLI — deployment engine (fallback when `vercel-args` provided) |
| `common-tags` | Template literal tag functions for comment formatting |
| `semver` | Normalizes `package.json` `engines.node` into Vercel's `NN.x` API enum (see #359) |

## Dev Tooling

| Tool | Purpose |
|---|---|
| `@antfu/eslint-config` | ESLint flat config (no Prettier) |
| `vitest` | Testing framework (unit + integration via Vitest Projects) |
| `@vercel/ncc` | Single-file bundler for `dist/` distribution |
| `husky` | Git hooks (pre-commit) |
| `@commitlint/cli` + `config-conventional` | Commit message validation |
| `emulate` | Local API emulator for Vercel/GitHub (integration tests) |
| `@octokit/rest` | Direct Octokit client for integration tests |
| `yaml` | YAML parser for emulate.dev seed config |

## CI/CD

- **GitHub Actions** — CI workflows for testing and deployment validation
- **release-please** — Automated semantic versioning and releases

## Build & Distribution

- Source: `index.js` (CommonJS entry point)
- Bundle: `pnpm build` → `@vercel/ncc` → `dist/index.js`
- The `dist/` folder must be committed for GitHub Actions to execute
