# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that deploys projects to Vercel. It's an npm package that integrates with GitHub workflows to automate deployments, providing more control than Vercel's native GitHub integration.

## Essential Commands

### Development
```bash
npm install              # Install dependencies
npm start               # Run the action locally (node ./index.js)
npm run lint            # Run ESLint on index.js
npm run format          # Format code with Prettier
npm run format-check    # Check code formatting
npm test                # Run Jest tests
npm run all             # Run format, lint, package, and test in sequence
```

### Building for Distribution
```bash
npm run package         # Build the action with ncc (outputs to dist/)
```

**Important**: The `dist/` folder must be committed when creating releases. This contains the bundled action code that GitHub Actions will execute.

## Architecture

### Core Components

1. **index.js**: Main entry point that:
   - Reads GitHub Action inputs (vercel-token, github-token, etc.)
   - Executes Vercel CLI commands for deployment
   - Comments on PRs/commits with deployment URLs
   - Handles alias domain assignment
   - Manages environment variables for Vercel org/project

2. **action.yml**: Defines the GitHub Action interface:
   - Input parameters configuration
   - Output values (preview-url, preview-name)
   - Runtime environment (Node.js 20)

### Key Dependencies
- `@actions/core`: GitHub Actions toolkit for inputs/outputs
- `@actions/exec`: Execute shell commands
- `@actions/github`: GitHub API interactions
- `vercel`: CLI for deployments
- `axios`: HTTP requests for alias management

### Deployment Flow
1. Action reads configuration from inputs and environment
2. Sets up Vercel org/project IDs from `.vercel/` directory
3. Executes `vercel` command with appropriate flags
4. Parses deployment URL from output
5. Optionally assigns alias domains
6. Comments on GitHub PR/commit with deployment info

## Testing Approach

- Jest is configured but tests are minimal (index.test.js is empty)
- Manual testing through example projects in `example/` directory
- GitHub Actions workflows test different scenarios

## Important Conventions

1. **Vercel Configuration**: Projects must have `github.enabled: false` in vercel.json
2. **Project Linking**: The `.vercel/` directory with org/project IDs must be committed
3. **Build Process**: Builds should happen in GitHub Actions, not Vercel
4. **Backward Compatibility**: Maintain support for deprecated "zeit-" prefixed inputs
5. **Error Handling**: Use proper exit codes and clear error messages for CI/CD integration