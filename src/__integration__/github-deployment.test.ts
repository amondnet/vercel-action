import type { DeploymentContext, GitHubContext } from '../types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createGitHubDeployment, updateGitHubDeploymentStatus } from '../github-deployment'
import { createOctokitClient, TEST_OWNER, TEST_REPO } from './helpers'

describe('GitHub Deployment (integration)', () => {
  let ctx: GitHubContext
  let deploymentContext: DeploymentContext
  let commitSha: string
  let deploymentsSupported = true

  beforeAll(async () => {
    const octokit = createOctokitClient()

    // Create a commit to use as a deployment ref
    const { data: blob } = await octokit.rest.git.createBlob({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      content: 'deployment integration test',
      encoding: 'utf-8',
    })

    const { data: tree } = await octokit.rest.git.createTree({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      tree: [{ path: 'deploy-test.txt', mode: '100644', type: 'blob', sha: blob.sha }],
    })

    const { data: commit } = await octokit.rest.git.createCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      message: 'deployment test commit',
      tree: tree.sha,
      parents: [],
    })

    commitSha = commit.sha

    ctx = {
      eventName: 'push',
      sha: commitSha,
      repo: { owner: TEST_OWNER, repo: TEST_REPO },
      issueNumber: 0,
    }

    deploymentContext = {
      ref: commitSha,
      sha: commitSha,
      commit: 'deployment test commit',
      commitOrg: TEST_OWNER,
      commitRepo: TEST_REPO,
    }

    // Probe whether the emulator supports the Deployments API
    try {
      await octokit.rest.repos.listDeployments({
        owner: TEST_OWNER,
        repo: TEST_REPO,
        per_page: 1,
      })
    }
    catch {
      deploymentsSupported = false
    }
  })

  it('should create a GitHub Deployment and set it to in_progress', async () => {
    if (!deploymentsSupported) {
      return
    }

    const octokit = createOctokitClient()

    const result = await createGitHubDeployment(
      octokit as any,
      ctx,
      deploymentContext,
      'preview',
    )

    expect(result).not.toBeNull()
    expect(result!.deploymentId).toBeTypeOf('number')

    // Verify the deployment exists
    const { data: deployment } = await octokit.rest.repos.getDeployment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: result!.deploymentId,
    })

    expect(deployment.environment).toBe('preview')

    // Verify in_progress status was set
    const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: result!.deploymentId,
    })

    expect(statuses.length).toBeGreaterThanOrEqual(1)
    expect(statuses[0].state).toBe('in_progress')
  })

  it('should update deployment status to success with environment_url', async () => {
    if (!deploymentsSupported) {
      return
    }

    const octokit = createOctokitClient()

    const result = await createGitHubDeployment(
      octokit as any,
      ctx,
      deploymentContext,
      'production',
    )

    expect(result).not.toBeNull()

    await updateGitHubDeploymentStatus(
      octokit as any,
      ctx,
      result!.deploymentId,
      'success',
      {
        environmentUrl: 'https://my-app.vercel.app',
        logUrl: 'https://vercel.com/inspect/123',
        description: 'Vercel deployment succeeded',
      },
    )

    const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: result!.deploymentId,
    })

    const successStatus = statuses.find(s => s.state === 'success')
    expect(successStatus).toBeDefined()
    expect(successStatus!.environment_url).toBe('https://my-app.vercel.app')
  })

  it('should update deployment status to failure', async () => {
    if (!deploymentsSupported) {
      return
    }

    const octokit = createOctokitClient()

    const result = await createGitHubDeployment(
      octokit as any,
      ctx,
      deploymentContext,
      'preview',
    )

    expect(result).not.toBeNull()

    await updateGitHubDeploymentStatus(
      octokit as any,
      ctx,
      result!.deploymentId,
      'failure',
      { description: 'Vercel deployment failed: build error' },
    )

    const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: result!.deploymentId,
    })

    const failureStatus = statuses.find(s => s.state === 'failure')
    expect(failureStatus).toBeDefined()
  })

  it('should return null when octokit is not provided', async () => {
    const result = await createGitHubDeployment(
      undefined,
      ctx,
      deploymentContext,
      'production',
    )

    expect(result).toBeNull()
  })

  it('should gracefully handle unsupported Deployments API', async () => {
    if (deploymentsSupported) {
      return
    }

    // When the emulator doesn't support deployments, createGitHubDeployment
    // should return null with a warning (non-blocking behavior)
    const octokit = createOctokitClient()

    const result = await createGitHubDeployment(
      octokit as any,
      ctx,
      deploymentContext,
      'production',
    )

    expect(result).toBeNull()
  })
})
