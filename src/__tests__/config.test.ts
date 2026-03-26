import * as core from '@actions/core'
import * as github from '@actions/github'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setSecret: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  exportVariable: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: {
    eventName: 'push',
    ref: 'refs/heads/main',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    issue: { number: 42 },
    payload: {},
  },
  getOctokit: vi.fn(() => ({})),
}))

vi.mock('../../package.json', () => ({
  default: { dependencies: { vercel: '30.0.0' } },
}))

describe('getActionConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('reads all inputs and returns config object', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-token': 'gh-token',
        'github-comment': 'true',
        'working-directory': '/app',
        'vercel-token': 'v-token',
        'vercel-args': '--prod',
        'vercel-org-id': 'org-123',
        'vercel-project-id': 'proj-456',
        'scope': 'my-team',
        'vercel-project-name': 'my-project',
        'vercel-version': '31.0.0',
        'alias-domains': '',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.githubToken).toBe('gh-token')
    expect(config.githubComment).toBe(true)
    expect(config.workingDirectory).toBe('/app')
    expect(config.vercelToken).toBe('v-token')
    expect(config.vercelArgs).toBe('--prod')
    expect(config.vercelOrgId).toBe('org-123')
    expect(config.vercelProjectId).toBe('proj-456')
    expect(config.vercelScope).toBe('my-team')
    expect(config.vercelProjectName).toBe('my-project')
    expect(config.vercelBin).toBe('vercel@31.0.0')
  })

  it('uses package.json vercel version as fallback', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'vercel-version')
        return ''
      if (name === 'alias-domains')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.vercelBin).toBe('vercel@30.0.0')
  })
})

describe('parseAliasDomains', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('replaces {{BRANCH}} with slugified branch name for push events', async () => {
    const ctx = github.context as { eventName: string, ref: string }
    ctx.eventName = 'push'
    ctx.ref = 'refs/heads/feature/my-branch'

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'alias-domains')
        return '{{BRANCH}}.example.com'
      if (name === 'vercel-version')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual(['featuremy-branch.example.com'])
  })

  it('replaces {{PR_NUMBER}} for pull_request events', async () => {
    const ctx = github.context as {
      eventName: string
      ref: string
      issue: { number: number }
      payload: Record<string, unknown>
    }
    ctx.eventName = 'pull_request'
    ctx.ref = 'refs/heads/main'
    ctx.issue = { number: 42 }
    ctx.payload = {
      pull_request: {
        head: {
          ref: 'refs/heads/feat/login',
          sha: 'abc123',
        },
      },
    }

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'alias-domains')
        return 'pr-{{PR_NUMBER}}.example.com'
      if (name === 'vercel-version')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual(['pr-42.example.com'])
  })

  it('replaces {{BRANCH}} with PR head ref for pull_request events', async () => {
    const ctx = github.context as {
      eventName: string
      ref: string
      issue: { number: number }
      payload: Record<string, unknown>
    }
    ctx.eventName = 'pull_request'
    ctx.ref = 'refs/heads/main'
    ctx.issue = { number: 10 }
    ctx.payload = {
      pull_request: {
        head: {
          ref: 'refs/heads/feat/login',
          sha: 'abc123',
        },
      },
    }

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'alias-domains')
        return '{{BRANCH}}.example.com'
      if (name === 'vercel-version')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual(['featlogin.example.com'])
  })

  it('handles multiple alias domains', async () => {
    const ctx = github.context as { eventName: string, ref: string }
    ctx.eventName = 'push'
    ctx.ref = 'refs/heads/main'

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'alias-domains')
        return 'a.example.com\nb.example.com'
      if (name === 'vercel-version')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual(['a.example.com', 'b.example.com'])
  })

  it('filters empty lines', async () => {
    const ctx = github.context as { eventName: string, ref: string }
    ctx.eventName = 'push'
    ctx.ref = 'refs/heads/main'

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'alias-domains')
        return 'a.com\n\nb.com\n'
      if (name === 'vercel-version')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual(['a.com', 'b.com'])
  })

  it('returns empty array when no alias domains configured', async () => {
    const ctx = github.context as { eventName: string, ref: string }
    ctx.eventName = 'push'
    ctx.ref = 'refs/heads/main'

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'alias-domains')
        return ''
      if (name === 'vercel-version')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual([])
  })
})

describe('createOctokitClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns undefined when no token provided', async () => {
    const { createOctokitClient } = await import('../config')
    const client = createOctokitClient('')
    expect(client).toBeUndefined()
  })

  it('returns octokit instance when token provided', async () => {
    const { createOctokitClient } = await import('../config')
    const client = createOctokitClient('test-token')
    expect(client).toBeDefined()
  })
})

describe('setVercelEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('always disables telemetry', async () => {
    const { setVercelEnv } = await import('../config')
    setVercelEnv({ vercelOrgId: '', vercelProjectId: '' } as any)

    expect(core.exportVariable).toHaveBeenCalledWith('VERCEL_TELEMETRY_DISABLED', '1')
  })

  it('exports both org and project IDs when both provided', async () => {
    const { setVercelEnv } = await import('../config')
    setVercelEnv({
      vercelOrgId: 'org-123',
      vercelProjectId: 'proj-456',
    } as any)

    expect(core.exportVariable).toHaveBeenCalledWith('VERCEL_ORG_ID', 'org-123')
    expect(core.exportVariable).toHaveBeenCalledWith('VERCEL_PROJECT_ID', 'proj-456')
  })

  it('warns and skips org ID when provided without project ID', async () => {
    const { setVercelEnv } = await import('../config')
    setVercelEnv({
      vercelOrgId: 'org-123',
      vercelProjectId: '',
    } as any)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('vercel-org-id was provided without vercel-project-id'),
    )
    expect(core.exportVariable).not.toHaveBeenCalledWith('VERCEL_ORG_ID', expect.anything())
  })

  it('warns and skips project ID when provided without org ID', async () => {
    const { setVercelEnv } = await import('../config')
    setVercelEnv({
      vercelOrgId: '',
      vercelProjectId: 'proj-456',
    } as any)

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('vercel-project-id was provided without vercel-org-id'),
    )
    expect(core.exportVariable).not.toHaveBeenCalledWith('VERCEL_PROJECT_ID', expect.anything())
  })

  it('only exports telemetry when neither provided', async () => {
    const { setVercelEnv } = await import('../config')
    setVercelEnv({
      vercelOrgId: '',
      vercelProjectId: '',
    } as any)

    expect(core.exportVariable).toHaveBeenCalledTimes(1)
    expect(core.exportVariable).toHaveBeenCalledWith('VERCEL_TELEMETRY_DISABLED', '1')
  })
})
