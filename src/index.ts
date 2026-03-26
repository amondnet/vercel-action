import type { ActionConfig, DeploymentContext, OctokitClient, PullRequestPayload, ReleasePayload } from './types'
import { execSync } from 'node:child_process'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { createOctokitClient, getActionConfig, setVercelEnv } from './config'
import { createCommentOnCommit, createCommentOnPullRequest } from './github-comments'
import { isPullRequestType } from './utils'
import { aliasDomainsToDeployment, vercelDeploy, vercelInspect } from './vercel'

const { context } = github

function getGitCommitMessage(): string {
  try {
    return execSync('git log -1 --pretty=format:%B').toString().trim()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to retrieve git commit message: ${message}. `
      + 'Ensure this action runs in a git repository with at least one commit.',
    )
  }
}

function logContextDebug(): void {
  core.debug(`action : ${context.action}`)
  core.debug(`ref : ${context.ref}`)
  core.debug(`eventName : ${context.eventName}`)
  core.debug(`actor : ${context.actor}`)
  core.debug(`sha : ${context.sha}`)
  core.debug(`workflow : ${context.workflow}`)
}

async function getDeploymentContextForPullRequest(
  octokit: OctokitClient | undefined,
  commit: string,
): Promise<DeploymentContext | null> {
  const payload = context.payload as PullRequestPayload
  const pr = payload.pull_request || payload.pull_request_target

  if (!pr) {
    return null
  }

  core.debug(`head : ${pr.head}`)

  let commitOrg = context.repo.owner
  let commitRepo = context.repo.repo

  if (pr.head.repo) {
    commitOrg = pr.head.repo.owner.login
    commitRepo = pr.head.repo.name
  }
  else {
    core.warning('PR head repository not accessible, using base repository info')
  }

  core.debug(`The head ref is: ${pr.head.ref}`)
  core.debug(`The head sha is: ${pr.head.sha}`)
  core.debug(`The commit org is: ${commitOrg}`)
  core.debug(`The commit repo is: ${commitRepo}`)

  let finalCommit = commit
  if (octokit) {
    try {
      const { data: commitData } = await octokit.rest.git.getCommit({
        owner: commitOrg,
        repo: commitRepo,
        commit_sha: pr.head.sha,
      })
      finalCommit = commitData.message
      core.debug(`The head commit is: ${finalCommit}`)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      core.warning(`Failed to fetch commit message from GitHub API: ${message}`)
    }
  }

  return {
    ref: pr.head.ref,
    sha: pr.head.sha,
    commit: finalCommit,
    commitOrg,
    commitRepo,
  }
}

function getDeploymentContextForRelease(): Partial<DeploymentContext> {
  const payload = context.payload as ReleasePayload
  const tagName = payload.release?.tag_name

  if (tagName) {
    core.debug(`The release ref is: refs/tags/${tagName}`)
    return { ref: `refs/tags/${tagName}` }
  }

  return {}
}

async function getDeploymentContext(
  octokit: OctokitClient | undefined,
): Promise<DeploymentContext> {
  const baseContext: DeploymentContext = {
    ref: context.ref,
    sha: context.sha,
    commit: getGitCommitMessage(),
    commitOrg: context.repo.owner,
    commitRepo: context.repo.repo,
  }

  if (context.eventName === 'push') {
    const pushPayload = context.payload
    core.debug(`The head commit is: ${pushPayload.head_commit}`)
    return baseContext
  }

  if (isPullRequestType(context.eventName)) {
    const prContext = await getDeploymentContextForPullRequest(octokit, baseContext.commit)
    if (prContext) {
      return prContext
    }
    return baseContext
  }

  if (context.eventName === 'release') {
    const releaseContext = getDeploymentContextForRelease()
    return { ...baseContext, ...releaseContext }
  }

  return baseContext
}

async function handleDeploymentOutputs(
  config: ActionConfig,
  deploymentUrl: string,
): Promise<string | null> {
  if (deploymentUrl) {
    core.info('set preview-url output')
    if (config.aliasDomains.length > 0) {
      core.info('set preview-url output as first alias')
      core.setOutput('preview-url', `https://${config.aliasDomains[0]}`)
    }
    else {
      core.setOutput('preview-url', deploymentUrl)
    }
  }
  else {
    core.warning('Deployment completed but no preview URL was returned')
  }

  const deploymentName = config.vercelProjectName || await vercelInspect(config, deploymentUrl)
  if (deploymentName) {
    core.info('set preview-name output')
    core.setOutput('preview-name', deploymentName)
  }
  else {
    core.warning('Could not determine deployment name')
  }

  return deploymentName
}

async function handleAliasing(config: ActionConfig, deploymentUrl: string): Promise<void> {
  if (config.aliasDomains.length === 0) {
    return
  }

  core.info('alias domains to this deployment')
  try {
    await aliasDomainsToDeployment(config, deploymentUrl)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to configure alias domains: ${message}. `
      + 'The deployment succeeded but alias configuration failed.',
    )
  }
}

async function handleComments(
  octokit: OctokitClient,
  config: ActionConfig,
  sha: string,
  deploymentUrl: string,
  deploymentName: string,
): Promise<void> {
  if (context.issue.number) {
    core.info('this is related issue or pull_request')
    await createCommentOnPullRequest(octokit, config, sha, deploymentUrl, deploymentName)
  }
  else if (context.eventName === 'push') {
    core.info('this is push event')
    await createCommentOnCommit(octokit, config, sha, deploymentUrl, deploymentName)
  }
}

async function run(): Promise<void> {
  logContextDebug()

  const config = getActionConfig()
  const octokit = createOctokitClient(config.githubToken)

  setVercelEnv(config)

  const deploymentContext = await getDeploymentContext(octokit)
  const { sha } = deploymentContext

  const deploymentUrl = await vercelDeploy(config, deploymentContext)

  const deploymentName = await handleDeploymentOutputs(config, deploymentUrl)

  await handleAliasing(config, deploymentUrl)

  if (config.githubComment && octokit) {
    await handleComments(octokit, config, sha, deploymentUrl, deploymentName ?? '')
  }
  else {
    core.info('comment : disabled')
  }
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    core.setFailed(error.message)
  }
  else {
    core.setFailed('An unexpected error occurred')
  }
})
