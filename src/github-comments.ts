import type { ActionConfig, CommentData, OctokitClient } from './types'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { stripIndents } from 'common-tags'
import { buildCommentBody, buildCommentPrefix, isPullRequestType } from './utils'

const { context } = github

const DEFAULT_COMMENT_TEMPLATE = stripIndents`
  ✅ Preview
  {{deploymentUrl}}

  Built with commit {{deploymentCommit}}.
  This pull request is being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)
`

async function findCommentsForEvent(
  octokit: OctokitClient,
): Promise<{ data: CommentData[] }> {
  core.debug('find comments for event')

  if (context.eventName === 'push') {
    core.debug('event is "commit", use "listCommentsForCommit"')
    return octokit.rest.repos.listCommentsForCommit({
      ...context.repo,
      commit_sha: context.sha,
    })
  }

  if (isPullRequestType(context.eventName)) {
    core.debug(`event is "${context.eventName}", use "listComments"`)
    return octokit.rest.issues.listComments({
      ...context.repo,
      issue_number: context.issue.number,
    })
  }

  core.warning(
    `Event type "${context.eventName}" is not supported for GitHub comments. `
    + 'Supported events: push, pull_request, pull_request_target',
  )
  return { data: [] }
}

async function findPreviousComment(
  octokit: OctokitClient,
  text: string,
): Promise<number | null> {
  core.info('find comment')
  const { data: comments } = await findCommentsForEvent(octokit)

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
  config: ActionConfig,
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
): Promise<void> {
  const commentId = await findPreviousComment(
    octokit,
    buildCommentPrefix(deploymentName),
  )

  const commentBody = buildCommentBody(
    deploymentCommit,
    deploymentUrl,
    deploymentName,
    config.githubComment,
    config.aliasDomains,
    DEFAULT_COMMENT_TEMPLATE,
  )

  if (!commentBody) {
    return
  }

  try {
    if (commentId) {
      await octokit.rest.repos.updateCommitComment({
        ...context.repo,
        comment_id: commentId,
        body: commentBody,
      })
    }
    else {
      await octokit.rest.repos.createCommitComment({
        ...context.repo,
        commit_sha: context.sha,
        body: commentBody,
      })
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to ${commentId ? 'update' : 'create'} commit comment: ${message}. `
      + 'Ensure the github-token has write permissions to the repository.',
    )
  }
}

export async function createCommentOnPullRequest(
  octokit: OctokitClient,
  config: ActionConfig,
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
): Promise<void> {
  const commentId = await findPreviousComment(
    octokit,
    buildCommentPrefix(deploymentName),
  )

  const commentBody = buildCommentBody(
    deploymentCommit,
    deploymentUrl,
    deploymentName,
    config.githubComment,
    config.aliasDomains,
    DEFAULT_COMMENT_TEMPLATE,
  )

  if (!commentBody) {
    return
  }

  try {
    if (commentId) {
      await octokit.rest.issues.updateComment({
        ...context.repo,
        comment_id: commentId,
        body: commentBody,
      })
    }
    else {
      await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.issue.number,
        body: commentBody,
      })
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to ${commentId ? 'update' : 'create'} PR comment: ${message}. `
      + 'Ensure the github-token has write permissions to the repository.',
    )
  }
}
