import type { ActionConfig, CommentData, GitHubContext, OctokitClient } from './types'
import * as core from '@actions/core'
import { stripIndents } from 'common-tags'
import { buildCommentBody, buildCommentPrefix, isPullRequestType } from './utils'

const DEFAULT_COMMENT_TEMPLATE = stripIndents`
  ✅ Preview
  {{deploymentUrl}}

  Built with commit {{deploymentCommit}}.
  This pull request is being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)
`

async function findCommentsForEvent(
  octokit: OctokitClient,
  ctx: GitHubContext,
): Promise<{ data: CommentData[] }> {
  core.debug('find comments for event')

  if (ctx.eventName === 'push') {
    core.debug('event is "commit", use "listCommentsForCommit"')
    return octokit.rest.repos.listCommentsForCommit({
      ...ctx.repo,
      commit_sha: ctx.sha,
      per_page: 100,
    })
  }

  if (isPullRequestType(ctx.eventName)) {
    core.debug(`event is "${ctx.eventName}", use "listComments"`)
    return octokit.rest.issues.listComments({
      ...ctx.repo,
      issue_number: ctx.issueNumber,
      per_page: 100,
    })
  }

  core.warning(
    `Event type "${ctx.eventName}" is not supported for GitHub comments. `
    + 'Supported events: push, pull_request, pull_request_target',
  )
  return { data: [] }
}

async function findPreviousComment(
  octokit: OctokitClient,
  ctx: GitHubContext,
  text: string,
): Promise<number | null> {
  core.info('find comment')
  const { data: comments } = await findCommentsForEvent(octokit, ctx)

  const vercelPreviewURLComment = comments.find(comment =>
    comment.body?.startsWith(text),
  )

  if (vercelPreviewURLComment) {
    core.info('previous comment found')
    return vercelPreviewURLComment.id
  }

  core.info('previous comment not found')
  return null
}

export async function createCommentOnCommit(
  octokit: OctokitClient,
  ctx: GitHubContext,
  config: ActionConfig,
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
  inspectUrl: string | null = null,
): Promise<void> {
  try {
    const commentId = await findPreviousComment(
      octokit,
      ctx,
      buildCommentPrefix(deploymentName),
    )

    const commentBody = buildCommentBody(
      deploymentCommit,
      deploymentUrl,
      deploymentName,
      config.githubComment,
      config.aliasDomains,
      DEFAULT_COMMENT_TEMPLATE,
      inspectUrl,
    )

    if (!commentBody) {
      return
    }

    if (commentId) {
      await octokit.rest.repos.updateCommitComment({
        ...ctx.repo,
        comment_id: commentId,
        body: commentBody,
      })
    }
    else {
      await octokit.rest.repos.createCommitComment({
        ...ctx.repo,
        commit_sha: ctx.sha,
        body: commentBody,
      })
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to create or update commit comment: ${message}. `
      + 'Ensure the github-token has write permissions to the repository.',
    )
  }
}

// Backslash-escape any run of 3+ backticks so embedded ``` cannot close the
// Markdown fenced code block we wrap stderrTail in. Build output is
// untrusted text — a malicious dependency could print ``` to break out of
// the fence and inject Markdown into the PR comment.
function escapeFencedBlock(text: string): string {
  return text.replace(/`{3,}/g, match => match.replace(/`/g, '\\`'))
}

function buildBuildFailureBody(sha: string, exitCode: number, stderrTail: string): string {
  const truncatedTail = escapeFencedBlock(stderrTail || '(no output captured)')
  return stripIndents`
    ❌ Vercel build failed

    Build for commit \`${sha}\` exited with exit code ${exitCode}.

    \`\`\`
    ${truncatedTail}
    \`\`\`

    See the GitHub Actions log for the full output. This workflow run is
    being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action).
  `
}

export async function createBuildFailureCommentOnPullRequest(
  octokit: OctokitClient,
  ctx: GitHubContext,
  sha: string,
  exitCode: number,
  stderrTail: string,
): Promise<void> {
  try {
    await octokit.rest.issues.createComment({
      ...ctx.repo,
      issue_number: ctx.issueNumber,
      body: buildBuildFailureBody(sha, exitCode, stderrTail),
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to post build failure comment on pull request: ${message}. `
      + 'Ensure the github-token has write permissions to the repository.',
    )
  }
}

export async function createBuildFailureCommentOnCommit(
  octokit: OctokitClient,
  ctx: GitHubContext,
  sha: string,
  exitCode: number,
  stderrTail: string,
): Promise<void> {
  try {
    await octokit.rest.repos.createCommitComment({
      ...ctx.repo,
      commit_sha: sha,
      body: buildBuildFailureBody(sha, exitCode, stderrTail),
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to post build failure comment on commit: ${message}. `
      + 'Ensure the github-token has write permissions to the repository.',
    )
  }
}

export async function createCommentOnPullRequest(
  octokit: OctokitClient,
  ctx: GitHubContext,
  config: ActionConfig,
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
  inspectUrl: string | null = null,
): Promise<void> {
  try {
    const commentId = await findPreviousComment(
      octokit,
      ctx,
      buildCommentPrefix(deploymentName),
    )

    const commentBody = buildCommentBody(
      deploymentCommit,
      deploymentUrl,
      deploymentName,
      config.githubComment,
      config.aliasDomains,
      DEFAULT_COMMENT_TEMPLATE,
      inspectUrl,
    )

    if (!commentBody) {
      return
    }

    if (commentId) {
      await octokit.rest.issues.updateComment({
        ...ctx.repo,
        comment_id: commentId,
        body: commentBody,
      })
    }
    else {
      await octokit.rest.issues.createComment({
        ...ctx.repo,
        issue_number: ctx.issueNumber,
        body: commentBody,
      })
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to create or update PR comment: ${message}. `
      + 'Ensure the github-token has write permissions to the repository.',
    )
  }
}
