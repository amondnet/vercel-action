# Product Guide: Vercel Action

## Vision

Provide the most reliable and feature-rich GitHub Action for automating Vercel deployments, giving developers more control than Vercel's native GitHub integration.

## Target Users

- **Development teams** using GitHub Actions for CI/CD who deploy to Vercel
- **Open source maintainers** wanting automated preview deployments on pull requests
- **DevOps engineers** needing fine-grained control over Vercel deployment workflows

## Core Features

1. **Vercel Deployment** — Execute Vercel CLI deployments (preview and production) from GitHub Actions
2. **PR & Commit Comments** — Automatically comment deployment URLs on pull requests and commits
3. **GitHub Deployments** — Create GitHub Deployment records with environment tracking, status updates, and auto-deactivation
4. **Alias Domains** — Assign custom domains to deployments with template variables (PR number, branch name)
5. **Backward Compatibility** — Maintain support for legacy "zeit-" prefixed inputs
6. **Flexible Configuration** — Support working directories, team scopes, custom CLI arguments, and project name overrides

## Success Metrics

- Deployment success rate and reliability
- GitHub Marketplace adoption (stars, forks, usage)
- Community issue resolution time
- Backward compatibility maintenance across Vercel CLI versions

## Constraints

- Must run on Node.js 20 runtime (GitHub Actions requirement)
- Must bundle all dependencies into `dist/` via ncc for distribution
- Must maintain backward compatibility with deprecated "zeit-" prefixed inputs
- Vercel token and project/org IDs are required inputs
