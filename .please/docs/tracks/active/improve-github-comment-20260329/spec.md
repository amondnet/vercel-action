# Improve GitHub Deployment Comments

> Track: improve-github-comment-20260329

## Overview

Redesign the GitHub PR/commit deployment comment from plain text to a rich HTML table format, similar to Cloudflare Pages and Vercel's native deployment bots. The new format provides better readability with structured key-value rows for deployment status, preview URLs, commit info, and inspection links.

## Requirements

### Functional Requirements

- [ ] FR-1: Replace the default plain-text comment template with an HTML `<table>` layout showing deployment information in key-value rows
- [ ] FR-2: Include the following fields in the HTML table:
  - **Project Name** — from `vercel-project-name` input or deployment name
  - **Status** — deployment status with emoji indicator (✅ success / ❌ failed)
  - **Preview URL** — clickable link to the deployment preview
  - **Latest Commit** — short SHA in `<code>` format
  - **Alias Domains** — show alias URLs when configured (conditional row)
  - **Inspect URL** — link to Vercel deployment inspector (conditional row)
- [ ] FR-3: Add a subtle footer line: `Deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)`
- [ ] FR-4: Maintain backward compatibility — when `github-comment` input is a custom string (not `true`/`false`), use the custom template instead of the new HTML format
- [ ] FR-5: Update comment prefix matching logic to correctly find/update previous comments with the new format
- [ ] FR-6: Support both PR comments and commit comments with the same HTML table format

### Non-functional Requirements

- [ ] NFR-1: The HTML must render correctly in GitHub's comment markdown renderer
- [ ] NFR-2: Comment body should be under 65535 characters (GitHub API limit)

## Acceptance Criteria

- [ ] AC-1: Default comment (`github-comment: true`) renders as HTML table with all required fields
- [ ] AC-2: Custom template (`github-comment: '<custom string>'`) still works with template variables
- [ ] AC-3: Previous comments are correctly detected and updated (no duplicate comments)
- [ ] AC-4: Alias domains appear as additional rows when configured
- [ ] AC-5: Inspect URL row appears when deployment inspection data is available
- [ ] AC-6: Comment renders correctly on both PR and commit comment contexts

## Out of Scope

- Markdown table format (decided: HTML table)
- Configurable comment style toggle (single format for simplicity)
- Custom branding/logo images
- Dark mode specific styling

## Assumptions

- GitHub's markdown renderer supports `<table>`, `<tr>`, `<td>`, `<strong>`, `<code>`, `<a>` HTML tags in comments
- Vercel deployment inspector URL can be derived from the deployment URL or obtained from the Vercel API
- The `{{deploymentUrl}}`, `{{deploymentCommit}}`, `{{deploymentName}}` template variables remain available for custom templates
