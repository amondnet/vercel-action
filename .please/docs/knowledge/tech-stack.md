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
| `@actions/exec` | Shell command execution for Vercel CLI |
| `@actions/github` | GitHub API client (Octokit) for PR/commit comments |
| `axios` | HTTP requests for alias domain management |
| `vercel` (v41.1.4) | Vercel CLI — deployment engine |
| `common-tags` | Template literal tag functions for comment formatting |

## Dev Tooling

| Tool | Purpose |
|---|---|
| `@antfu/eslint-config` | ESLint flat config (no Prettier) |
| `jest` | Testing framework |
| `@vercel/ncc` | Single-file bundler for `dist/` distribution |
| `husky` | Git hooks (pre-commit) |
| `@commitlint/cli` + `config-conventional` | Commit message validation |

## CI/CD

- **GitHub Actions** — CI workflows for testing and deployment validation
- **release-please** — Automated semantic versioning and releases

## Build & Distribution

- Source: `index.js` (CommonJS entry point)
- Bundle: `pnpm build` → `@vercel/ncc` → `dist/index.js`
- The `dist/` folder must be committed for GitHub Actions to execute
