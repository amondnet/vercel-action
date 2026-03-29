import type { DeploymentContext, GitHubContext } from '../types'
import * as core from '@actions/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGitHubDeployment, updateGitHubDeploymentStatus } from '../github-deployment'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  setOutput: vi.fn(),
}))

const mockCreateDeployment = vi.fn()
const mockCreateDeploymentStatus = vi.fn()

function createMockOctokit() {
  return {
    rest: {
      repos: {
        createDeployment: mockCreateDeployment,
        createDeploymentStatus: mockCreateDeploymentStatus,
      },
    },
  } as any
}

function createGitHubContext(overrides: Partial<GitHubContext> = {}): GitHubContext {
  return {
    eventName: 'push',
    sha: 'abc123',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    issueNumber: 0,
    ...overrides,
  }
}

function createDeploymentContext(overrides: Partial<DeploymentContext> = {}): DeploymentContext {
  return {
    ref: 'refs/heads/main',
    sha: 'abc123',
    commit: 'test commit',
    commitOrg: 'test-owner',
    commitRepo: 'test-repo',
    ...overrides,
  }
}

describe('createGitHubDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a deployment with correct params', async () => {
    mockCreateDeployment.mockResolvedValue({ data: { id: 12345 } })

    const result = await createGitHubDeployment(
      createMockOctokit(),
      createGitHubContext(),
      createDeploymentContext({ ref: 'refs/heads/feature' }),
      'production',
    )

    expect(result).toEqual({ deploymentId: 12345 })
    expect(mockCreateDeployment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/heads/feature',
      environment: 'production',
      auto_merge: false,
      required_contexts: [],
      transient_environment: false,
      production_environment: true,
    })
  })

  it('sets transient_environment for non-production environments', async () => {
    mockCreateDeployment.mockResolvedValue({ data: { id: 12345 } })

    await createGitHubDeployment(
      createMockOctokit(),
      createGitHubContext(),
      createDeploymentContext(),
      'preview',
    )

    expect(mockCreateDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        transient_environment: true,
        production_environment: false,
      }),
    )
  })

  it('sets deployment status to in_progress after creation', async () => {
    mockCreateDeployment.mockResolvedValue({ data: { id: 12345 } })
    mockCreateDeploymentStatus.mockResolvedValue({})

    await createGitHubDeployment(
      createMockOctokit(),
      createGitHubContext(),
      createDeploymentContext(),
      'production',
    )

    expect(mockCreateDeploymentStatus).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 12345,
      state: 'in_progress',
      description: 'Deploying to Vercel...',
    })
  })

  it('sets deployment-id output', async () => {
    mockCreateDeployment.mockResolvedValue({ data: { id: 99999 } })
    mockCreateDeploymentStatus.mockResolvedValue({})

    await createGitHubDeployment(
      createMockOctokit(),
      createGitHubContext(),
      createDeploymentContext(),
      'production',
    )

    expect(core.setOutput).toHaveBeenCalledWith('deployment-id', 99999)
  })

  it('returns null when octokit is undefined', async () => {
    const result = await createGitHubDeployment(
      undefined,
      createGitHubContext(),
      createDeploymentContext(),
      'production',
    )

    expect(result).toBeNull()
    expect(mockCreateDeployment).not.toHaveBeenCalled()
  })

  it('logs warning and returns null on API error', async () => {
    mockCreateDeployment.mockRejectedValue(new Error('API rate limit'))

    const result = await createGitHubDeployment(
      createMockOctokit(),
      createGitHubContext(),
      createDeploymentContext(),
      'production',
    )

    expect(result).toBeNull()
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('API rate limit'),
    )
  })
})

describe('updateGitHubDeploymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates status to success with environment_url and log_url', async () => {
    mockCreateDeploymentStatus.mockResolvedValue({})

    await updateGitHubDeploymentStatus(
      createMockOctokit(),
      createGitHubContext(),
      12345,
      'success',
      {
        environmentUrl: 'https://my-app.vercel.app',
        logUrl: 'https://vercel.com/inspect/123',
        description: 'Deployment succeeded',
      },
    )

    expect(mockCreateDeploymentStatus).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 12345,
      state: 'success',
      environment_url: 'https://my-app.vercel.app',
      log_url: 'https://vercel.com/inspect/123',
      description: 'Deployment succeeded',
      auto_inactive: true,
    })
  })

  it('updates status to failure with description', async () => {
    mockCreateDeploymentStatus.mockResolvedValue({})

    await updateGitHubDeploymentStatus(
      createMockOctokit(),
      createGitHubContext(),
      12345,
      'failure',
      { description: 'Vercel deployment failed' },
    )

    expect(mockCreateDeploymentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'failure',
        description: 'Vercel deployment failed',
      }),
    )
  })

  it('skips when octokit is undefined', async () => {
    await updateGitHubDeploymentStatus(
      undefined,
      createGitHubContext(),
      12345,
      'success',
      {},
    )

    expect(mockCreateDeploymentStatus).not.toHaveBeenCalled()
  })

  it('logs warning on API error without throwing', async () => {
    mockCreateDeploymentStatus.mockRejectedValue(new Error('Network error'))

    await updateGitHubDeploymentStatus(
      createMockOctokit(),
      createGitHubContext(),
      12345,
      'success',
      {},
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Network error'),
    )
  })
})
