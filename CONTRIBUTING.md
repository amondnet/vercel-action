# Contributing to Vercel Action

We welcome contributions to the Vercel Action project! This document provides guidelines and standards for contributing.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Run linter: `npm run lint`

## Commit Message Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. This leads to more readable messages and enables automatic generation of the changelog.

### Commit Message Format

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special format that includes a **type**, a **scope** and a **subject**:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Type

Must be one of the following:

- **build**: Changes that affect the build system or external dependencies
- **chore**: Other changes that don't modify src or test files
- **ci**: Changes to our CI configuration files and scripts
- **docs**: Documentation only changes
- **feat**: A new feature
- **fix**: A bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **revert**: Reverts a previous commit
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **test**: Adding missing tests or correcting existing tests

### Examples

```bash
# Feature with scope
feat(auth): add OAuth2 integration

# Bug fix
fix: resolve memory leak in deployment process

# Breaking change
feat: update to Vercel CLI v30

BREAKING CHANGE: Minimum Node.js version is now 18
```

### Commitlint

This repository uses [commitlint](https://commitlint.js.org/) to ensure all commit messages follow our convention. The commit-msg hook will automatically validate your commit messages.

If your commit is rejected, please review the message format and ensure it follows the convention above.

## Pull Request Process

1. Ensure your PR title follows the Conventional Commits format
2. Update the README.md with details of changes if needed
3. Ensure all tests pass and linting is clean
4. Request review from maintainers

## Code Style

- We use ESLint with the Antfu config for code formatting and linting
- Run `npm run lint` to check your code
- Run `npm run lint:fix` to automatically fix issues

## Testing

- Write tests for new features
- Ensure existing tests pass
- Run `npm test` before submitting PR

## Questions?

Feel free to open an issue for any questions about contributing!
