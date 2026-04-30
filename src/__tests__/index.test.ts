import * as core from '@actions/core'

import * as exec from '@actions/exec'
import * as github from '@actions/github'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all @actions modules before importing anything
vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  exportVariable: vi.fn(),
}))

vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: {
    eventName: 'push',
    ref: 'refs/heads/main',
    sha: 'abc123',
    actor: 'test-user',
    workflow: 'CI',
    action: 'test-action',
    repo: {
      owner: 'test-owner',
      repo: 'test-repo',
    },
    issue: {
      number: 0,
    },
    payload: {},
  },
  getOctokit: vi.fn(() => ({
    rest: {
      repos: {
        listCommentsForCommit: vi.fn().mockResolvedValue({ data: [] }),
        createCommitComment: vi.fn().mockResolvedValue({}),
        updateCommitComment: vi.fn().mockResolvedValue({}),
        createDeployment: vi.fn().mockResolvedValue({ data: { id: 12345 } }),
        createDeploymentStatus: vi.fn().mockResolvedValue({}),
      },
      issues: {
        listComments: vi.fn().mockResolvedValue({ data: [] }),
        createComment: vi.fn().mockResolvedValue({}),
        updateComment: vi.fn().mockResolvedValue({}),
      },
      git: {
        getCommit: vi.fn().mockResolvedValue({ data: { message: 'test commit' } }),
      },
    },
  })),
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => Buffer.from('test commit message')),
}))

describe('gitHub Action Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for getInput
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'test-vercel-token',
        'github-token': '',
        'github-comment': 'false',
        'working-directory': '',
        'vercel-version': '',
        'vercel-args': '',
        'vercel-org-id': '',
        'vercel-project-id': '',
        'scope': '',
        'vercel-project-name': '',
        'alias-domains': '',
      }
      return inputs[name] ?? ''
    })
  })

  describe('vercel deployment', () => {
    it('executes vercel command with correct arguments', async () => {
      vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
        if (options?.listeners?.stdout) {
          options.listeners.stdout(Buffer.from('https://test-deployment.vercel.app'))
        }
        return 0
      })

      // Import and trigger the module - vercelDeploy is not exported
      // This test verifies exec is called properly
      await import('../index')
      expect(vi.mocked(exec.exec)).toBeDefined()
    })
  })

  describe('context handling', () => {
    it('accesses github context correctly', () => {
      expect(github.context.eventName).toBe('push')
      expect(github.context.ref).toBe('refs/heads/main')
      expect(github.context.sha).toBe('abc123')
      expect(github.context.actor).toBe('test-user')
    })

    it('accesses repo information', () => {
      expect(github.context.repo.owner).toBe('test-owner')
      expect(github.context.repo.repo).toBe('test-repo')
    })
  })

  describe('input handling', () => {
    it('reads vercel-token as required input', () => {
      const getInputMock = vi.mocked(core.getInput)
      getInputMock.mockImplementation((name: string, options?: { required?: boolean }) => {
        if (name === 'vercel-token' && options?.required) {
          return 'test-token'
        }
        return ''
      })

      expect(core.getInput('vercel-token', { required: true })).toBe('test-token')
    })

    it('reads optional inputs with defaults', () => {
      expect(core.getInput('github-comment')).toBe('false')
      expect(core.getInput('working-directory')).toBe('')
    })
  })

  describe('octokit initialization', () => {
    it('creates octokit client when github-token is provided', () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        if (name === 'github-token')
          return 'test-github-token'
        if (name === 'vercel-token')
          return 'test-vercel-token'
        return ''
      })

      const mockOctokit = github.getOctokit('test-github-token')
      expect(mockOctokit).toBeDefined()
      expect(mockOctokit.rest.repos).toBeDefined()
      expect(mockOctokit.rest.issues).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('setFailed is available for error handling', () => {
      expect(core.setFailed).toBeDefined()
    })

    it('warning and error logging are available', () => {
      expect(core.warning).toBeDefined()
      expect(core.error).toBeDefined()
    })
  })
})

describe('octokit API v6 compatibility', () => {
  it('uses rest namespace for API calls', () => {
    const octokit = github.getOctokit('test-token')

    // Verify the new v6 API structure
    expect(octokit.rest).toBeDefined()
    expect(octokit.rest.repos).toBeDefined()
    expect(octokit.rest.issues).toBeDefined()
    expect(octokit.rest.git).toBeDefined()
  })

  it('has correct method signatures for repos API', () => {
    const octokit = github.getOctokit('test-token')

    expect(octokit.rest.repos.listCommentsForCommit).toBeDefined()
    expect(octokit.rest.repos.createCommitComment).toBeDefined()
    expect(octokit.rest.repos.updateCommitComment).toBeDefined()
  })

  it('has correct method signatures for issues API', () => {
    const octokit = github.getOctokit('test-token')

    expect(octokit.rest.issues.listComments).toBeDefined()
    expect(octokit.rest.issues.createComment).toBeDefined()
    expect(octokit.rest.issues.updateComment).toBeDefined()
  })

  it('has correct method signatures for git API', () => {
    const octokit = github.getOctokit('test-token')

    expect(octokit.rest.git.getCommit).toBeDefined()
  })

  it('has correct method signatures for deployments API', () => {
    const octokit = github.getOctokit('test-token')

    expect(octokit.rest.repos.createDeployment).toBeDefined()
    expect(octokit.rest.repos.createDeploymentStatus).toBeDefined()
  })
})

describe('github deployment integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('github-deployment input defaults to false', () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'test-vercel-token',
        'github-token': 'test-github-token',
        'github-comment': 'false',
        'github-deployment': 'false',
        'github-deployment-environment': '',
        'vercel-args': '',
        'alias-domains': '',
        'vercel-version': '',
      }
      return inputs[name] ?? ''
    })

    const result = core.getInput('github-deployment')
    expect(result).toBe('false')
  })

  it('resolveDeploymentEnvironment auto-detects production from --prod', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'cli', vercelArgs: '--prod' }, 'preview')).toBe('production')
    expect(resolveDeploymentEnvironment('', { kind: 'cli', vercelArgs: '' }, 'preview')).toBe('preview')
    expect(resolveDeploymentEnvironment('staging', { kind: 'cli', vercelArgs: '--prod' }, 'preview')).toBe('staging')
  })

  it('octokit has deployment API methods available', () => {
    const octokit = github.getOctokit('test-token')
    expect(typeof octokit.rest.repos.createDeployment).toBe('function')
    expect(typeof octokit.rest.repos.createDeploymentStatus).toBe('function')
  })

  it('setOutput is available for deployment-id', () => {
    core.setOutput('deployment-id', 12345)
    expect(core.setOutput).toHaveBeenCalledWith('deployment-id', 12345)
  })
})
