import type { ActionConfig, OctokitClient, PullRequestPayload } from './types'
import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import packageJSON from '../package.json'
import { getGithubCommentInput, isPullRequestType, parseKeyValueLines, slugify } from './utils'

const PR_NUMBER_REGEXP = /\{\{\s*PR_NUMBER\s*\}\}/g
const BRANCH_REGEXP = /\{\{\s*BRANCH\s*\}\}/g

function maskSecretValues(env: Record<string, string>): Record<string, string> {
  for (const value of Object.values(env)) {
    if (value) {
      core.setSecret(value)
    }
  }
  return env
}

function parseTarget(input: string): 'production' | 'preview' {
  const value = input || 'preview'
  if (value !== 'production' && value !== 'preview') {
    throw new Error(`Invalid target "${value}". Must be "production" or "preview".`)
  }
  return value
}

function parseArchive(input: string): '' | 'tgz' {
  if (input !== '' && input !== 'tgz') {
    throw new Error(`Invalid archive "${input}". Must be "" or "tgz".`)
  }
  return input
}

function parseWorkingDirectory(input: string): string {
  if (!input) {
    return ''
  }
  if (path.isAbsolute(input)) {
    return input
  }
  const base = process.env.GITHUB_WORKSPACE || process.cwd()
  return path.resolve(base, input)
}

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
        const pr = payload.pull_request
        if (pr) {
          branch = slugify(pr.head.ref.replace('refs/heads/', ''))
          url = url.replace(PR_NUMBER_REGEXP, context.issue.number.toString())
        }
      }
      url = url.replace(BRANCH_REGEXP, branch)
      return url
    })
}

export function resolveDeploymentEnvironment(explicitEnv: string, vercelArgs: string): string {
  if (explicitEnv) {
    return explicitEnv
  }
  return /(?:^|\s)--prod(?:uction)?(?:\s|$)/.test(vercelArgs) ? 'production' : 'preview'
}

export function getActionConfig(): ActionConfig {
  const vercelToken = core.getInput('vercel-token', { required: true })
  core.setSecret(vercelToken)

  const vercelArgs = core.getInput('vercel-args')
  const githubDeploymentEnvInput = core.getInput('github-deployment-environment')

  const prebuilt = core.getInput('prebuilt') === 'true'
  const vercelBuild = core.getInput('vercel-build') === 'true'
  if (prebuilt && vercelBuild) {
    throw new Error(
      'Inputs "vercel-build" and "prebuilt" are mutually exclusive. '
      + 'Set "vercel-build: true" to build inside the action, OR set "prebuilt: true" '
      + 'to deploy an already-built .vercel/output, but not both.',
    )
  }
  if (vercelBuild && vercelArgs.trim() !== '') {
    throw new Error(
      'Input "vercel-build" cannot be used together with a non-empty "vercel-args". '
      + '"vercel-build" builds locally and deploys the generated .vercel/output via '
      + 'the prebuilt/API path, while "vercel-args" routes the deployment through the '
      + 'Vercel CLI path which would ignore the local build output. '
      + 'Remove "vercel-args" to use "vercel-build", or disable "vercel-build" to deploy with CLI arguments.',
    )
  }

  return {
    githubToken: core.getInput('github-token'),
    githubComment: getGithubCommentInput(core.getInput('github-comment')),
    githubDeployment: core.getInput('github-deployment') === 'true',
    githubDeploymentEnvironment: resolveDeploymentEnvironment(githubDeploymentEnvInput, vercelArgs),
    workingDirectory: parseWorkingDirectory(core.getInput('working-directory')),
    vercelToken,
    vercelArgs,
    vercelOrgId: core.getInput('vercel-org-id'),
    vercelProjectId: core.getInput('vercel-project-id'),
    vercelScope: core.getInput('scope'),
    vercelProjectName: core.getInput('vercel-project-name'),
    vercelBin: getVercelBin(),
    aliasDomains: parseAliasDomains(),
    // API-based deployment inputs
    target: parseTarget(core.getInput('target')),
    prebuilt,
    vercelBuild,
    vercelOutputDir: core.getInput('vercel-output-dir'),
    force: core.getInput('force') === 'true',
    env: maskSecretValues(parseKeyValueLines(core.getInput('env'))),
    buildEnv: maskSecretValues(parseKeyValueLines(core.getInput('build-env'))),
    regions: core.getInput('regions').split(',').map(r => r.trim()).filter(r => r !== ''),
    archive: parseArchive(core.getInput('archive')),
    rootDirectory: core.getInput('root-directory'),
    autoAssignCustomDomains: core.getInput('auto-assign-custom-domains') !== 'false',
    customEnvironment: core.getInput('custom-environment'),
    isPublic: core.getInput('public') === 'true',
    withCache: core.getInput('with-cache') === 'true',
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
