# Plan: Improve GitHub Deployment Comments

## Overview

- **Source**: [spec.md](./spec.md)
- **Issue**: #319
- **Created**: 2026-03-29
- **Approach**: Pragmatic

## Purpose

After this change, users of vercel-action will see rich, well-structured HTML table deployment comments on their PRs and commits — showing project name, status, preview URL, commit SHA, alias domains, and inspect links at a glance. They can verify it works by deploying with `github-comment: true` and checking the PR comment format.

## Context

The current default comment template is plain text with minimal formatting: a simple "✅ Preview" line followed by the URL. Competing actions like Cloudflare Pages and Vercel's own bot produce rich HTML table comments with structured rows for each piece of deployment info, making them far more scannable and professional. The goal is to match that quality while preserving backward compatibility for users with custom templates.

Key constraints: the `github-comment` input accepts `true`, `false`, or a custom string template. When set to a custom string, the existing template variable substitution must continue working unchanged. The new HTML table format only applies when `github-comment: true`.

The comment prefix (`Deploy preview for _name_ ready!`) is used to find and update existing comments. This prefix must be updated to match the new format while ensuring that old comments on existing PRs can still be detected during the transition period.

Non-goals: markdown table format, configurable style toggle, custom branding images.

## Architecture Decision

The approach modifies the existing `buildCommentBody()` function in `utils.ts` to produce an HTML table when `githubComment === true`, while keeping the custom string path untouched. A new `buildHtmlTableComment()` function handles the HTML generation. The comment prefix is updated but old prefixes are also checked during comment detection for backward compatibility.

The inspect URL is derived from the deployment URL by constructing `https://vercel.com/{org}/{project}/{deployment-id}` pattern, or from the Vercel API response when available. This data flows through the existing function signatures with a new optional `inspectUrl` parameter.

## Tasks

- [x] T001 Add `inspectUrl` to types and config flow (file: src/types.ts)
- [x] T002 Build HTML table comment generator (file: src/utils.ts, depends on T001)
- [x] T003 Update comment prefix and detection logic (file: src/utils.ts, depends on T002)
- [x] T004 Wire inspect URL through deployment flow (file: src/index.ts, depends on T001)
- [x] T005 Update comment functions to pass new data (file: src/github-comments.ts, depends on T002, T003, T004)
- [x] T006 Update unit tests for HTML table comments (file: src/__tests__/utils.test.ts, depends on T002, T003)
- [x] T007 Update unit tests for comment functions (file: src/__tests__/github-comments.test.ts, depends on T005)
- [x] T008 [P] Update integration tests (file: src/__integration__/github-pr-comments.test.ts, depends on T005)

## Progress

- [x] (2026-03-29 17:30 KST) T001-T008 All tasks implemented in single pass
  Evidence: `npx vitest run --project unit` → 117 tests passed (22.15s), 0 lint errors

## Key Files

### Modify

- `src/types.ts` — Add optional `inspectUrl` field to relevant interfaces
- `src/utils.ts` — Add `buildHtmlTableComment()`, update `buildCommentPrefix()`, update `buildCommentBody()`
- `src/github-comments.ts` — Update function signatures to accept and pass inspect URL
- `src/index.ts` — Wire inspect URL from `vercelInspect` through to comment functions
- `src/__tests__/utils.test.ts` — Tests for new HTML template builder and updated prefix logic
- `src/__tests__/github-comments.test.ts` — Tests for updated comment creation

### Reuse

- `src/vercel-api.ts` — `VercelApiClient.inspect()` already calls `/v13/deployments/{id}`, may need to extract inspector URL from response
- `src/config.ts` — No changes needed, `getGithubCommentInput()` already handles boolean vs string

## Verification

### Automated Tests

- [ ] `buildHtmlTableComment()` renders correct HTML table with all fields
- [ ] `buildHtmlTableComment()` omits alias row when no aliases configured
- [ ] `buildHtmlTableComment()` omits inspect row when no inspect URL available
- [ ] `buildCommentBody()` uses HTML table when `githubComment === true`
- [ ] `buildCommentBody()` still uses custom template when `githubComment` is a string
- [ ] Comment prefix detection finds both old and new format comments
- [ ] Integration test verifies HTML comment on PR

### Observable Outcomes

- After deploying with `github-comment: true`, the PR comment shows an HTML table with Project, Status, Preview URL, and Commit rows
- Running `pnpm test` shows all existing + new tests passing

### Acceptance Criteria Check

- [ ] AC-1: Default comment renders as HTML table with all required fields
- [ ] AC-2: Custom template still works with template variables
- [ ] AC-3: Previous comments are correctly detected and updated
- [ ] AC-4: Alias domains appear as additional rows when configured
- [ ] AC-5: Inspect URL row appears when available
- [ ] AC-6: Comment works on both PR and commit contexts

## Decision Log

- Decision: Use HTML table format over markdown table
  Rationale: Better control over layout, no forced header row, key-value format suits single-project deployment info. Cloudflare Pages uses same approach.
  Date/Author: 2026-03-29 / Claude

- Decision: Dual prefix detection for backward compatibility
  Rationale: Existing PRs may have comments with old prefix format. Detecting both old and new ensures smooth transition without duplicate comments.
  Date/Author: 2026-03-29 / Claude
