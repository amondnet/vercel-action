import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    expect(config.deployment).toEqual({ kind: 'cli', vercelArgs: '--prod' })
    expect(config.vercelOrgId).toBe('org-123')
    expect(config.vercelProjectId).toBe('proj-456')
    expect(config.vercelScope).toBe('my-team')
    expect(config.vercelProjectName).toBe('my-project')
    expect(config.vercelBin).toBe('vercel@31.0.0')
  })

  it('uses package.json vercel version as fallback', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'vercel-version' || name === 'alias-domains' || name === 'target' || name === 'archive')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.vercelBin).toBe('vercel@30.0.0')
  })
})

describe('getActionConfig working-directory normalization', () => {
  const originalWorkspace = process.env.GITHUB_WORKSPACE

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    if (originalWorkspace === undefined) {
      delete process.env.GITHUB_WORKSPACE
    }
    else {
      process.env.GITHUB_WORKSPACE = originalWorkspace
    }
  })

  function mockWorkingDirectoryInput(value: string): void {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'working-directory')
        return value
      if (name === 'vercel-token')
        return 'v-token'
      return ''
    })
  }

  it('resolves relative path against GITHUB_WORKSPACE when set', async () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    mockWorkingDirectoryInput('public')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe(path.resolve('/github/workspace', 'public'))
  })

  it('falls back to process.cwd() when GITHUB_WORKSPACE is unset', async () => {
    delete process.env.GITHUB_WORKSPACE
    mockWorkingDirectoryInput('public')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe(path.resolve(process.cwd(), 'public'))
  })

  it('falls back to process.cwd() when GITHUB_WORKSPACE is empty string', async () => {
    process.env.GITHUB_WORKSPACE = ''
    mockWorkingDirectoryInput('public')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe(path.resolve(process.cwd(), 'public'))
  })

  it('passes absolute path through unchanged', async () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    mockWorkingDirectoryInput('/app')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe('/app')
  })

  it('leaves empty input as empty string', async () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    mockWorkingDirectoryInput('')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe('')
  })

  it('resolves nested relative paths against GITHUB_WORKSPACE', async () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    mockWorkingDirectoryInput('apps/web/public')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe(path.resolve('/github/workspace', 'apps/web/public'))
  })

  it('collapses parent-traversal segments via path.resolve', async () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace/repo'
    mockWorkingDirectoryInput('../sibling')

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.workingDirectory).toBe(path.resolve('/github/workspace/repo', '../sibling'))
  })
})

describe('resolveDeploymentEnvironment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns explicit environment when provided', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('staging', { kind: 'cli', vercelArgs: '--prod' }, 'preview')).toBe('staging')
  })

  it('returns "production" when CLI vercel-args contains --prod', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'cli', vercelArgs: '--prod' }, 'preview')).toBe('production')
  })

  it('returns "preview" when CLI vercel-args does not contain --prod', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'cli', vercelArgs: '' }, 'preview')).toBe('preview')
  })

  it('returns "production" when --prod is among other CLI args', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'cli', vercelArgs: '--force --prod --debug' }, 'preview')).toBe('production')
  })

  it('returns "production" when CLI args contain --production', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'cli', vercelArgs: '--production' }, 'preview')).toBe('production')
  })

  it('returns "production" in experimental-api mode when target is production', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'experimental-api' }, 'production')).toBe('production')
  })

  it('returns "preview" in experimental-api mode when target is preview', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('', { kind: 'experimental-api' }, 'preview')).toBe('preview')
  })

  it('explicit environment beats experimental-api target', async () => {
    const { resolveDeploymentEnvironment } = await import('../config')
    expect(resolveDeploymentEnvironment('staging', { kind: 'experimental-api' }, 'production')).toBe('staging')
  })
})

describe('getActionConfig - github deployment fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('parses githubDeployment as true when input is "true"', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-deployment': 'true',
        'github-deployment-environment': '',
        'vercel-args': '',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-token': 'test-token',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.githubDeployment).toBe(true)
  })

  it('parses githubDeployment as false when input is not "true"', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-deployment': 'false',
        'github-deployment-environment': '',
        'vercel-args': '',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-token': 'test-token',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.githubDeployment).toBe(false)
  })

  it('auto-detects production environment from --prod arg', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-deployment': 'true',
        'github-deployment-environment': '',
        'vercel-args': '--prod',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-token': 'test-token',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.githubDeploymentEnvironment).toBe('production')
  })

  it('auto-detects preview environment when no --prod', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-deployment': 'true',
        'github-deployment-environment': '',
        'vercel-args': '',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-token': 'test-token',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.githubDeploymentEnvironment).toBe('preview')
  })

  it('uses explicit environment over auto-detection', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'github-deployment': 'true',
        'github-deployment-environment': 'staging',
        'vercel-args': '--prod',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-token': 'test-token',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.githubDeploymentEnvironment).toBe('staging')
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
      if (name === 'vercel-version' || name === 'target' || name === 'archive')
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
      if (name === 'vercel-version' || name === 'target' || name === 'archive')
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
      if (name === 'vercel-version' || name === 'target' || name === 'archive')
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
      if (name === 'vercel-version' || name === 'target' || name === 'archive')
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
      if (name === 'vercel-version' || name === 'target' || name === 'archive')
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
      if (name === 'vercel-version' || name === 'target' || name === 'archive')
        return ''
      return 'test'
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.aliasDomains).toEqual([])
  })
})

describe('api deployment inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('parses all new API inputs with defaults', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.target).toBe('preview')
    expect(config.prebuilt).toBe(false)
    expect(config.force).toBe(false)
    expect(config.env).toEqual({})
    expect(config.buildEnv).toEqual({})
    expect(config.regions).toEqual([])
    expect(config.archive).toBe('')
    expect(config.rootDirectory).toBe('')
    expect(config.autoAssignCustomDomains).toBe(true)
    expect(config.customEnvironment).toBe('')
    expect(config.isPublic).toBe(false)
    expect(config.withCache).toBe(false)
  })

  it('parses production target', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'target')
        return 'production'
      if (name === 'vercel-token')
        return 'v-token'
      if (name === 'alias-domains' || name === 'vercel-version')
        return ''
      return ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.target).toBe('production')
  })

  it('parses boolean inputs correctly', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'prebuilt': 'true',
        'force': 'true',
        'auto-assign-custom-domains': 'false',
        'public': 'true',
        'with-cache': 'true',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.prebuilt).toBe(true)
    expect(config.force).toBe(true)
    expect(config.autoAssignCustomDomains).toBe(false)
    expect(config.isPublic).toBe(true)
    expect(config.withCache).toBe(true)
  })

  it('parses multiline env variables', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'env')
        return 'NODE_ENV=production\nAPI_URL=https://api.example.com'
      if (name === 'vercel-token')
        return 'v-token'
      if (name === 'alias-domains' || name === 'vercel-version')
        return ''
      return ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.env).toEqual({
      NODE_ENV: 'production',
      API_URL: 'https://api.example.com',
    })
  })

  it('parses comma-separated regions', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'regions')
        return 'iad1, sfo1, cdg1'
      if (name === 'vercel-token')
        return 'v-token'
      if (name === 'alias-domains' || name === 'vercel-version')
        return ''
      return ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.regions).toEqual(['iad1', 'sfo1', 'cdg1'])
  })
})

describe('vercel-build input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('defaults vercelBuild to false when input is empty', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'vercel-token')
        return 'v-token'
      if (name === 'alias-domains' || name === 'vercel-version')
        return ''
      return ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.vercelBuild).toBe(false)
  })

  it('parses vercelBuild as true when input is "true"', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'true',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.vercelBuild).toBe(true)
  })

  it('treats non-"true" values as false', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'yes',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.vercelBuild).toBe(false)
  })

  it('throws when both vercel-build and prebuilt are true', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'true',
        'prebuilt': 'true',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    expect(() => getActionConfig()).toThrow(
      /vercel-build.*prebuilt.*mutually exclusive/i,
    )
  })

  it('throws when vercel-build is true and vercel-args is non-empty', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'true',
        'vercel-args': '--prod',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    expect(() => getActionConfig()).toThrow(
      /vercel-build.*vercel-args/i,
    )
  })

  it('treats whitespace-only vercel-args as empty for mutex check', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'true',
        'vercel-args': '   ',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    expect(() => getActionConfig()).not.toThrow()
  })

  it('does not throw when only vercel-build is true', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'true',
        'prebuilt': 'false',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    expect(() => getActionConfig()).not.toThrow()
  })

  it('does not throw when only prebuilt is true', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'alias-domains': '',
        'vercel-version': '',
        'vercel-build': 'false',
        'prebuilt': 'true',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    expect(() => getActionConfig()).not.toThrow()
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

describe('getActionConfig - deployment mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('defaults deployment to cli mode with empty vercelArgs when no inputs are set', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'experimental-api': '',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.deployment).toEqual({ kind: 'cli', vercelArgs: '' })
  })

  it('defaults deployment to cli mode when experimental-api input is "false"', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'experimental-api': 'false',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.deployment).toEqual({ kind: 'cli', vercelArgs: '' })
  })

  it('returns experimental-api deployment when experimental-api is "true"', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'experimental-api': 'true',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.deployment).toEqual({ kind: 'experimental-api' })
  })

  it('returns cli deployment carrying vercelArgs when only vercel-args is set', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'vercel-args': '--prod',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.deployment).toEqual({ kind: 'cli', vercelArgs: '--prod' })
  })

  it('throws when experimental-api=true and vercel-args is non-empty', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'experimental-api': 'true',
        'vercel-args': '--prod',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')

    expect(() => getActionConfig()).toThrow(/mutually exclusive/i)
  })

  it('mutual-exclusion error names both inputs in the message', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'experimental-api': 'true',
        'vercel-args': '--force',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')

    expect(() => getActionConfig()).toThrow(/experimental-api/)
    expect(() => getActionConfig()).toThrow(/vercel-args/)
  })

  it('does NOT throw when experimental-api=true and vercel-args is whitespace-only', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'experimental-api': 'true',
        'vercel-args': '   \t  ',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    expect(() => getActionConfig()).not.toThrow()

    const config = getActionConfig()
    expect(config.deployment).toEqual({ kind: 'experimental-api' })
  })

  it('trims vercel-args whitespace when constructing the cli deployment variant', async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'v-token',
        'vercel-args': '  --prod  ',
      }
      return inputs[name] ?? ''
    })

    const { getActionConfig } = await import('../config')
    const config = getActionConfig()

    expect(config.deployment).toEqual({ kind: 'cli', vercelArgs: '--prod' })
  })
})
