# Product Guidelines: Vercel Action

## Code Style

- **ESLint**: Use `@antfu/eslint-config` (flat config) — enforces consistent formatting without Prettier
- **Commit Convention**: Follow `@commitlint/config-conventional` with Husky pre-commit hooks
- **Language**: JavaScript (CommonJS) — maintain consistency with existing codebase
- **Bundling**: All code must be bundled via `@vercel/ncc` into `dist/` for GitHub Actions distribution

## Documentation Style

- Write in clear, concise English
- Use markdown tables for input/output documentation
- Include workflow YAML examples for usage patterns
- Maintain backward compatibility notes in README

## UX Principles

- **Sensible Defaults**: Minimize required inputs; provide reasonable defaults where possible
- **Transparent Feedback**: Always surface deployment URLs and status through PR/commit comments
- **Graceful Degradation**: Handle missing optional inputs without failing the workflow
- **Clear Error Messages**: Provide actionable error messages when deployment or configuration fails

## Versioning & Releases

- Follow semantic versioning
- Use release-please for automated releases
- Maintain major version tags (e.g., `v41`) for GitHub Actions consumers

## Quality Gates

- All changes must pass ESLint (`pnpm lint`)
- All changes must pass tests (`pnpm test`)
- Distribution bundle must be rebuilt (`pnpm build`) and committed for releases
