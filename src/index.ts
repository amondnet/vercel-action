import type { ActionConfig, DeploymentContext, GitHubContext, GitHubDeploymentResult, OctokitClient, PullRequestPayload, ReleasePayload, VercelClient } from './types'
import { execSync } from 'node:child_process'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { createOctokitClient, getActionConfig, setVercelEnv } from './config'
import {
  createBuildFailureCommentOnCommit,
  createBuildFailureCommentOnPullRequest,
  createCommentOnCommit,
  createCommentOnPullRequest,
} from './github-comments'
import { createGitHubDeployment, updateGitHubDeploymentStatus } from './github-deployment'
import { isPullRequestType } from './utils'
import { aliasDomainsToDeployment, createVercelClient, vercelDeploy, vercelInspect } from './vercel'
import { BuildFailedError, runBuildStep } from './vercel-build'

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
  const pr = payload.pull_request

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
    core.debug(`The head commit is: ${JSON.stringify(pushPayload.head_commit)}`)
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
  vercel: VercelClient,
  config: ActionConfig,
  deploymentUrl: string,
): Promise<{ deploymentName: string | null, inspectUrl: string | null }> {
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

  let deploymentName: string | null = config.vercelProjectName || null
  let inspectUrl: string | null = null

  if (deploymentUrl) {
    const result = await vercelInspect(vercel, deploymentUrl)
    deploymentName = deploymentName || result.name
    inspectUrl = result.inspectUrl
  }

  if (deploymentName) {
    core.info('set preview-name output')
    core.setOutput('preview-name', deploymentName)
  }
  else {
    core.warning('Could not determine deployment name')
  }

  return { deploymentName, inspectUrl }
}

async function handleAliasing(vercel: VercelClient, config: ActionConfig, deploymentUrl: string): Promise<void> {
  if (config.aliasDomains.length === 0) {
    return
  }

  core.info('alias domains to this deployment')
  try {
    await aliasDomainsToDeployment(vercel, config, deploymentUrl)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to configure alias domains: ${message}. `
      + 'The deployment succeeded but alias configuration failed.',
    )
  }
}

function buildGitHubContext(): GitHubContext {
  return {
    eventName: context.eventName,
    sha: context.sha,
    repo: context.repo,
    issueNumber: context.issue.number,
  }
}

async function handleComments(
  octokit: OctokitClient,
  ctx: GitHubContext,
  config: ActionConfig,
  sha: string,
  deploymentUrl: string,
  deploymentName: string,
  inspectUrl: string | null,
): Promise<void> {
  if (ctx.issueNumber) {
    core.info('this is related issue or pull_request')
    await createCommentOnPullRequest(octokit, ctx, config, sha, deploymentUrl, deploymentName, inspectUrl)
  }
  else if (ctx.eventName === 'push') {
    core.info('this is push event')
    await createCommentOnCommit(octokit, ctx, config, sha, deploymentUrl, deploymentName, inspectUrl)
  }
}

async function handleGitHubDeploymentSuccess(
  octokit: OctokitClient | undefined,
  ctx: GitHubContext,
  deployment: GitHubDeploymentResult,
  deploymentUrl: string,
  inspectUrl: string | null,
  aliasDomains: string[],
): Promise<void> {
  const environmentUrl = aliasDomains.length > 0
    ? `https://${aliasDomains[0]}`
    : deploymentUrl

  await updateGitHubDeploymentStatus(
    octokit,
    ctx,
    deployment.deploymentId,
    'success',
    {
      environmentUrl,
      logUrl: inspectUrl ?? undefined,
      description: 'Vercel deployment succeeded',
    },
  )
}

async function postBuildFailureComment(
  octokit: OctokitClient | undefined,
  ctx: GitHubContext,
  sha: string,
  error: BuildFailedError,
): Promise<void> {
  if (!octokit) {
    return
  }
  if (isPullRequestType(ctx.eventName) && ctx.issueNumber) {
    await createBuildFailureCommentOnPullRequest(octokit, ctx, sha, error.exitCode, error.stderrTail)
    return
  }
  if (ctx.eventName === 'push') {
    await createBuildFailureCommentOnCommit(octokit, ctx, sha, error.exitCode, error.stderrTail)
  }
}

async function maybeRunVercelBuild(config: ActionConfig): Promise<ActionConfig> {
  if (!config.vercelBuild) {
    return config
  }
  const result = await runBuildStep(config)
  return {
    ...config,
    prebuilt: result.prebuilt,
    vercelOutputDir: result.vercelOutputDir,
  }
}

export async function run(): Promise<void> {
  logContextDebug()

  let config = getActionConfig()
  const octokit = createOctokitClient(config.githubToken)

  setVercelEnv(config)

  const deploymentContext = await getDeploymentContext(octokit)
  const { sha } = deploymentContext
  const ctx = buildGitHubContext()

  try {
    config = await maybeRunVercelBuild(config)
  }
  catch (error) {
    if (error instanceof BuildFailedError && config.githubComment !== false) {
      await postBuildFailureComment(octokit, ctx, sha, error)
    }
    throw error
  }

  let githubDeployment: GitHubDeploymentResult | null = null
  if (config.githubDeployment) {
    githubDeployment = await createGitHubDeployment(
      octokit,
      ctx,
      deploymentContext,
      config.githubDeploymentEnvironment,
    )
  }

  let deploymentUrl: string
  try {
    const vercelClient = createVercelClient(config)
    deploymentUrl = await vercelDeploy(vercelClient, config, deploymentContext)

    const { deploymentName, inspectUrl } = await handleDeploymentOutputs(vercelClient, config, deploymentUrl)

    await handleAliasing(vercelClient, config, deploymentUrl)

    if (githubDeployment) {
      await handleGitHubDeploymentSuccess(octokit, ctx, githubDeployment, deploymentUrl, inspectUrl, config.aliasDomains)
    }

    if (config.githubComment && octokit) {
      await handleComments(octokit, ctx, config, sha, deploymentUrl, deploymentName ?? '', inspectUrl)
    }
    else {
      core.info('comment : disabled')
    }
  }
  catch (error) {
    if (githubDeployment) {
      const message = error instanceof Error ? error.message : String(error)
      await updateGitHubDeploymentStatus(
        octokit,
        ctx,
        githubDeployment.deploymentId,
        'failure',
        { description: `Vercel deployment failed: ${message}` },
      )
    }
    throw error
  }
}

// Auto-invoke run() only inside the GitHub Actions runner.
// GITHUB_ACTIONS is the canonical, runner-set sentinel that is not
// user-controllable. Unit tests override this to '' in vitest.config.ts
// (via test.env) so that module imports during tests do not trigger
// auto-invocation.
if (process.env.GITHUB_ACTIONS === 'true') {
  run().catch((error: unknown) => {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
    else {
      core.setFailed('An unexpected error occurred')
    }
  })
}
