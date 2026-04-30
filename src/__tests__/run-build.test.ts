/**
 * Integration tests for run() orchestration with vercelBuild: true.
 * Verifies that runBuildStep is invoked before deploy and that
 * BuildFailedError triggers the failure-comment path.
 */
import * as core from '@actions/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBuildFailureCommentOnCommit,
  createBuildFailureCommentOnPullRequest,
} from '../github-comments'
import { createVercelClient, vercelDeploy } from '../vercel'
import { BuildFailedError, runBuildStep } from '../vercel-build'

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  exportVariable: vi.fn(),
  isDebug: vi.fn(() => false),
}))

vi.mock('@actions/github', () => ({
  context: {
    eventName: 'pull_request',
    ref: 'refs/heads/feat/x',
    sha: 'sha-123',
    actor: 'tester',
    workflow: 'CI',
    action: 'vercel',
    repo: { owner: 'o', repo: 'r' },
    issue: { number: 7 },
    payload: {
      pull_request: { head: { ref: 'feat/x', sha: 'sha-123' } },
    },
  },
  getOctokit: vi.fn(() => ({
    rest: {
      repos: {
        listCommentsForCommit: vi.fn().mockResolvedValue({ data: [] }),
        createCommitComment: vi.fn().mockResolvedValue({}),
        updateCommitComment: vi.fn().mockResolvedValue({}),
      },
      issues: {
        listComments: vi.fn().mockResolvedValue({ data: [] }),
        createComment: vi.fn().mockResolvedValue({}),
        updateComment: vi.fn().mockResolvedValue({}),
      },
      git: {
        getCommit: vi.fn().mockResolvedValue({ data: { message: 'msg' } }),
      },
    },
  })),
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => Buffer.from('commit msg')),
}))

vi.mock('../vercel-build', () => ({
  BuildFailedError: class BuildFailedError extends Error {
    name = 'BuildFailedError'
    exitCode = 1
    stderrTail = 'stderr tail'
  },
  runBuildStep: vi.fn(),
}))

vi.mock('../vercel', () => ({
  createVercelClient: vi.fn(),
  vercelDeploy: vi.fn().mockResolvedValue('https://x.vercel.app'),
  vercelInspect: vi.fn().mockResolvedValue({ name: 'p', inspectUrl: null }),
  aliasDomainsToDeployment: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../github-deployment', () => ({
  createGitHubDeployment: vi.fn(),
  updateGitHubDeploymentStatus: vi.fn(),
}))

vi.mock('../github-comments', () => ({
  createBuildFailureCommentOnPullRequest: vi.fn().mockResolvedValue(undefined),
  createBuildFailureCommentOnCommit: vi.fn().mockResolvedValue(undefined),
  createCommentOnPullRequest: vi.fn().mockResolvedValue(undefined),
  createCommentOnCommit: vi.fn().mockResolvedValue(undefined),
}))

function setInputs(overrides: Record<string, string>) {
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    const defaults: Record<string, string> = {
      'vercel-token': 'tok',
      'github-token': 'gh-tok',
      'github-comment': 'true',
      'github-deployment': 'false',
      'working-directory': '',
      'vercel-args': '',
      'alias-domains': '',
      'vercel-version': '',
      'vercel-build': 'false',
      'prebuilt': 'false',
    }
    return overrides[name] ?? defaults[name] ?? ''
  })
}

describe('run() with vercel-build: true', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.mocked(createVercelClient).mockReturnValue({
      deploy: vi.fn().mockResolvedValue('https://x.vercel.app'),
      inspect: vi.fn().mockResolvedValue({ name: 'p', inspectUrl: null }),
      assignAlias: vi.fn().mockResolvedValue(undefined),
    } as any)
  })

  it('invokes runBuildStep before deploying when vercel-build is true', async () => {
    setInputs({ 'vercel-build': 'true' })
    vi.mocked(runBuildStep).mockResolvedValue({
      prebuilt: true,
      vercelOutputDir: '/proj/.vercel/output',
    })

    const { run } = await import('../index')
    await run()

    expect(runBuildStep).toHaveBeenCalledOnce()
    const passedConfig = vi.mocked(runBuildStep).mock.calls[0][0]
    expect(passedConfig.vercelBuild).toBe(true)

    const deployConfig = vi.mocked(vercelDeploy).mock.calls[0][1]
    expect(deployConfig.prebuilt).toBe(true)
    expect(deployConfig.vercelOutputDir).toBe('/proj/.vercel/output')
  })

  it('does not invoke runBuildStep when vercel-build is false', async () => {
    setInputs({ 'vercel-build': 'false' })

    const { run } = await import('../index')
    await run()

    expect(runBuildStep).not.toHaveBeenCalled()
  })

  it('rethrows BuildFailedError after attempting to post failure comment', async () => {
    setInputs({ 'vercel-build': 'true' })
    vi.mocked(runBuildStep).mockRejectedValue(new BuildFailedError())

    const { run } = await import('../index')
    await expect(run()).rejects.toBeInstanceOf(BuildFailedError)
  })

  it('posts a build-failure PR comment carrying exitCode and stderrTail', async () => {
    setInputs({ 'vercel-build': 'true', 'github-comment': 'true' })
    vi.mocked(runBuildStep).mockRejectedValue(new BuildFailedError())

    const { run } = await import('../index')
    await expect(run()).rejects.toBeInstanceOf(BuildFailedError)

    expect(createBuildFailureCommentOnPullRequest).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(createBuildFailureCommentOnPullRequest).mock.calls[0]
    expect(callArgs[2]).toBe('sha-123')
    expect(callArgs[3]).toBe(1)
    expect(callArgs[4]).toBe('stderr tail')
    expect(createBuildFailureCommentOnCommit).not.toHaveBeenCalled()
  })

  it('posts a build-failure commit comment for push events', async () => {
    setInputs({ 'vercel-build': 'true', 'github-comment': 'true' })
    vi.mocked(runBuildStep).mockRejectedValue(new BuildFailedError())

    const github = await import('@actions/github')
    const ctx = github.context as {
      eventName: string
      issue: { number: number }
      payload: Record<string, unknown>
    }
    const originalEvent = ctx.eventName
    const originalPayload = ctx.payload
    const originalIssue = ctx.issue
    ctx.eventName = 'push'
    ctx.payload = {}
    ctx.issue = { number: 0 }

    try {
      const { run } = await import('../index')
      await expect(run()).rejects.toBeInstanceOf(BuildFailedError)

      expect(createBuildFailureCommentOnCommit).toHaveBeenCalledOnce()
      const callArgs = vi.mocked(createBuildFailureCommentOnCommit).mock.calls[0]
      expect(callArgs[2]).toBe('sha-123')
      expect(callArgs[3]).toBe(1)
      expect(callArgs[4]).toBe('stderr tail')
      expect(createBuildFailureCommentOnPullRequest).not.toHaveBeenCalled()
    }
    finally {
      ctx.eventName = originalEvent
      ctx.payload = originalPayload
      ctx.issue = originalIssue
    }
  })

  it('does not post a build-failure comment when github-comment is false', async () => {
    setInputs({ 'vercel-build': 'true', 'github-comment': 'false' })
    vi.mocked(runBuildStep).mockRejectedValue(new BuildFailedError())

    const { run } = await import('../index')
    await expect(run()).rejects.toBeInstanceOf(BuildFailedError)

    expect(createBuildFailureCommentOnPullRequest).not.toHaveBeenCalled()
    expect(createBuildFailureCommentOnCommit).not.toHaveBeenCalled()
  })
})
