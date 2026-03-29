import type { DeploymentContext, GitHubContext, GitHubDeploymentResult, OctokitClient } from './types'
import * as core from '@actions/core'

export interface DeploymentStatusOptions {
  environmentUrl?: string
  logUrl?: string
  description?: string
}

export async function createGitHubDeployment(
  octokit: OctokitClient | undefined,
  ctx: GitHubContext,
  deploymentContext: DeploymentContext,
  environment: string,
): Promise<GitHubDeploymentResult | null> {
  if (!octokit) {
    core.debug('GitHub token not provided — skipping GitHub Deployment creation')
    return null
  }

  try {
    const isProduction = environment === 'production'

    core.debug(`Creating GitHub Deployment for environment: ${environment}`)
    const { data: deployment } = await octokit.rest.repos.createDeployment({
      ...ctx.repo,
      ref: deploymentContext.ref,
      environment,
      auto_merge: false,
      required_contexts: [],
      transient_environment: !isProduction,
      production_environment: isProduction,
    })

    const deploymentId = (deployment as { id?: number }).id
    if (!deploymentId) {
      const msg = (deployment as { message?: string }).message ?? 'unknown reason'
      core.warning(
        `GitHub Deployment creation was rejected: ${msg}. `
        + 'The Vercel deployment will continue without GitHub Deployment tracking.',
      )
      return null
    }

    core.debug(`Created GitHub Deployment: ${deploymentId}`)
    core.setOutput('deployment-id', deploymentId)

    try {
      await octokit.rest.repos.createDeploymentStatus({
        ...ctx.repo,
        deployment_id: deploymentId,
        state: 'in_progress',
        description: 'Deploying to Vercel...',
      })
    }
    catch (statusError) {
      const msg = statusError instanceof Error ? statusError.message : String(statusError)
      core.warning(
        `GitHub Deployment ${deploymentId} was created but could not be set to "in_progress": ${msg}. `
        + 'Deployment tracking will continue but the initial status may be inaccurate.',
      )
    }

    return { deploymentId }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to create GitHub Deployment: ${message}. `
      + 'The Vercel deployment will continue without GitHub Deployment tracking.',
    )
    return null
  }
}

export async function updateGitHubDeploymentStatus(
  octokit: OctokitClient | undefined,
  ctx: GitHubContext,
  deploymentId: number,
  state: 'success' | 'failure' | 'error' | 'inactive',
  options: DeploymentStatusOptions,
): Promise<void> {
  if (!octokit) {
    return
  }

  try {
    core.debug(`Updating GitHub Deployment ${deploymentId} status to: ${state}`)
    await octokit.rest.repos.createDeploymentStatus({
      ...ctx.repo,
      deployment_id: deploymentId,
      state,
      environment_url: options.environmentUrl,
      log_url: options.logUrl,
      description: options.description,
      auto_inactive: true,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const outcome = state === 'success' ? 'succeeded' : 'failed'
    core.warning(
      `Failed to update GitHub Deployment status: ${message}. `
      + `The deployment ${outcome} but the GitHub Deployment status was not updated.`,
    )
  }
}
