import type { ActionConfig, OctokitClient, PullRequestPayload } from './types'
import * as core from '@actions/core'
import * as github from '@actions/github'
import packageJSON from '../package.json'
import { getGithubCommentInput, isPullRequestType, slugify } from './utils'

const PR_NUMBER_REGEXP = /\{\{\s*PR_NUMBER\s*\}\}/g
const BRANCH_REGEXP = /\{\{\s*BRANCH\s*\}\}/g

function getVercelBin(): string {
  const input = core.getInput('vercel-version')
  const fallback = packageJSON.dependencies.vercel
  return `vercel@${input || fallback}`
}

function parseAliasDomains(): string[] {
  const { context } = github
  return core
    .getInput('alias-domains')
    .split('\n')
    .filter(x => x !== '')
    .map((s) => {
      let url = s
      let branch = slugify(context.ref.replace('refs/heads/', ''))
      if (isPullRequestType(context.eventName)) {
        const payload = context.payload as PullRequestPayload
        const pr = payload.pull_request || payload.pull_request_target
        if (pr) {
          branch = slugify(pr.head.ref.replace('refs/heads/', ''))
          url = url.replace(PR_NUMBER_REGEXP, context.issue.number.toString())
        }
      }
      url = url.replace(BRANCH_REGEXP, branch)
      return url
    })
}

export function getActionConfig(): ActionConfig {
  const vercelToken = core.getInput('vercel-token', { required: true })
  core.setSecret(vercelToken)

  return {
    githubToken: core.getInput('github-token'),
    githubComment: getGithubCommentInput(core.getInput('github-comment')),
    workingDirectory: core.getInput('working-directory'),
    vercelToken,
    vercelArgs: core.getInput('vercel-args'),
    vercelOrgId: core.getInput('vercel-org-id'),
    vercelProjectId: core.getInput('vercel-project-id'),
    vercelScope: core.getInput('scope'),
    vercelProjectName: core.getInput('vercel-project-name'),
    vercelBin: getVercelBin(),
    aliasDomains: parseAliasDomains(),
  }
}

export function createOctokitClient(githubToken: string): OctokitClient | undefined {
  if (!githubToken) {
    core.debug('GitHub token not provided - GitHub API features disabled')
    return undefined
  }
  return github.getOctokit(githubToken)
}

export function setVercelEnv(config: ActionConfig): void {
  core.info('set environment for vercel cli')
  core.exportVariable('VERCEL_TELEMETRY_DISABLED', '1')

  if (config.vercelOrgId && config.vercelProjectId) {
    core.info('set env variable : VERCEL_ORG_ID')
    core.exportVariable('VERCEL_ORG_ID', config.vercelOrgId)
    core.info('set env variable : VERCEL_PROJECT_ID')
    core.exportVariable('VERCEL_PROJECT_ID', config.vercelProjectId)
  }
  else if (config.vercelOrgId) {
    core.warning(
      'vercel-org-id was provided without vercel-project-id. '
      + 'Vercel CLI v41+ requires both to be set together. '
      + 'Skipping VERCEL_ORG_ID to avoid deployment failure.',
    )
  }
  else if (config.vercelProjectId) {
    core.warning(
      'vercel-project-id was provided without vercel-org-id. '
      + 'Vercel CLI v41+ requires both to be set together. '
      + 'Skipping VERCEL_PROJECT_ID to avoid deployment failure.',
    )
  }
}
