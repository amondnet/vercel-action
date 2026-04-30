import type { ActionConfig, DeploymentContext } from '../types'
import path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aliasDomainsToDeployment, createVercelClient, vercelDeploy, vercelInspect } from '../vercel'
import { VercelApiClient } from '../vercel-api'
import { VercelCliClient } from '../vercel-cli'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: {
    actor: 'test-user',
    repo: { owner: 'test-owner', repo: 'test-repo' },
  },
}))

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    workingDirectory: '',
    vercelToken: 'test-token',
    deployment: { kind: 'cli', vercelArgs: '' },
    vercelOrgId: '',
    vercelProjectId: '',
    vercelScope: '',
    vercelProjectName: '',
    vercelBin: 'vercel@latest',
    aliasDomains: [],
    target: 'preview',
    prebuilt: false,
    vercelOutputDir: '',
    force: false,
    env: {},
    buildEnv: {},
    regions: [],
    archive: '',
    rootDirectory: '',
    autoAssignCustomDomains: true,
    customEnvironment: '',
    isPublic: false,
    withCache: false,
    ...overrides,
  }
}

function createClient(config?: ActionConfig): VercelCliClient {
  return new VercelCliClient(config ?? createConfig())
}

function createDeployContext(overrides: Partial<DeploymentContext> = {}): DeploymentContext {
  return {
    ref: 'refs/heads/main',
    sha: 'abc123',
    commit: 'test commit',
    commitOrg: 'test-owner',
    commitRepo: 'test-repo',
    ...overrides,
  }
}

describe('vercelDeploy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts deployment URL from last line of stdout', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      const stdout = options?.listeners?.stdout
      if (stdout) {
        stdout(Buffer.from('Vercel CLI 30.0.0\n'))
        stdout(Buffer.from('Deploying...\n'))
        stdout(Buffer.from('https://my-app-abc123.vercel.app\n'))
      }
      return 0
    })

    const config = createConfig()
    const url = await vercelDeploy(
      createClient(config),
      config,
      createDeployContext(),
    )

    expect(url).toBe('https://my-app-abc123.vercel.app')
  })

  it('accumulates stdout from multiple chunks', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      const stdout = options?.listeners?.stdout
      if (stdout) {
        stdout(Buffer.from('https://my-'))
        stdout(Buffer.from('app.vercel.app'))
      }
      return 0
    })

    const config = createConfig()
    const url = await vercelDeploy(
      createClient(config),
      config,
      createDeployContext(),
    )

    expect(url).toBe('https://my-app.vercel.app')
  })

  it('throws when stdout contains no URL', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      const stdout = options?.listeners?.stdout
      if (stdout) {
        stdout(Buffer.from('Some error output\n'))
      }
      return 0
    })

    await expect(
      vercelDeploy(createClient(), createConfig(), createDeployContext()),
    ).rejects.toThrow('Failed to extract deployment URL')
  })

  it('throws when stdout is empty', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await expect(
      vercelDeploy(createClient(), createConfig(), createDeployContext()),
    ).rejects.toThrow('Failed to extract deployment URL')
  })

  it('passes vercel token and metadata args to exec', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    const cfg = createConfig({ vercelToken: 'my-secret-token', vercelBin: 'vercel@30' })
    await vercelDeploy(
      createClient(cfg),
      cfg,
      createDeployContext({ sha: 'sha123', commitOrg: 'org', commitRepo: 'repo' }),
    )

    const call = vi.mocked(exec.exec).mock.calls[0]
    expect(call[0]).toBe('npx')
    const args = call[1] as string[]
    expect(args[0]).toBe('vercel@30')
    expect(args).toContain('-t')
    expect(args).toContain('my-secret-token')
    expect(args).toContain('-m')
  })

  it('sets cwd when workingDirectory is provided', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    const cfg = createConfig({ workingDirectory: '/custom/dir' })
    await vercelDeploy(createClient(cfg), cfg, createDeployContext())

    const options = vi.mocked(exec.exec).mock.calls[0][2]
    expect(options?.cwd).toBe('/custom/dir')
  })

  it('forwards an absolute cwd to exec, matching the normalized API-mode value', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    const cfg = createConfig({ workingDirectory: '/github/workspace/public' })
    await vercelDeploy(createClient(cfg), cfg, createDeployContext())

    const options = vi.mocked(exec.exec).mock.calls[0][2]
    expect(options?.cwd).toBe('/github/workspace/public')
    expect(path.isAbsolute(options?.cwd as string)).toBe(true)
  })

  it('includes scope when provided', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    const cfg = createConfig({ vercelScope: 'my-team' })
    await vercelDeploy(createClient(cfg), cfg, createDeployContext())

    const args = vi.mocked(exec.exec).mock.calls[0][1] as string[]
    expect(args).toContain('--scope')
    expect(args).toContain('my-team')
  })

  it('routes stderr to core.info', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('warning message'))
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    await vercelDeploy(createClient(), createConfig(), createDeployContext())

    expect(core.info).toHaveBeenCalledWith('warning message')
  })

  it('retries without org ID on personal account scope error', async () => {
    let callCount = 0
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      callCount++
      if (callCount === 1) {
        options?.listeners?.stderr?.(
          Buffer.from('You cannot set your Personal Account as the scope'),
        )
        return 1
      }
      options?.listeners?.stdout?.(Buffer.from('https://retry-deploy.vercel.app\n'))
      return 0
    })

    const cfg = createConfig({ vercelProjectId: 'proj-123' })
    const url = await vercelDeploy(createClient(cfg), cfg, createDeployContext())

    expect(url).toBe('https://retry-deploy.vercel.app')
    expect(exec.exec).toHaveBeenCalledTimes(2)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Retrying without VERCEL_ORG_ID'),
    )
  })

  it('throws on personal account scope error without project ID', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(
        Buffer.from('You cannot set your Personal Account as the scope'),
      )
      return 1
    })

    await expect(
      vercelDeploy(createClient(), createConfig({ vercelProjectId: '' }), createDeployContext()),
    ).rejects.toThrow('no vercel-project-id was provided')
  })

  it('throws on non-zero exit code for non-scope errors', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('some other error'))
      return 1
    })

    await expect(
      vercelDeploy(createClient(), createConfig(), createDeployContext()),
    ).rejects.toThrow('failed with exit code 1')
  })

  it('sanitizes commit message in metadata', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    await vercelDeploy(createClient(), createConfig(), createDeployContext({ commit: 'line1\nline2\r\n"quoted"' }))

    const args = vi.mocked(exec.exec).mock.calls[0][1] as string[]
    const metaArgs = args.filter(a => a.startsWith('"'))
    for (const arg of metaArgs) {
      expect(arg).not.toMatch(/[\r\n]/)
    }
  })
})

describe('vercelInspect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts project name from stderr output', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('  name  my-project\n'))
      return 0
    })

    const result = await vercelInspect(createClient(), 'https://deploy.vercel.app')
    expect(result.name).toBe('my-project')
  })

  it('returns null name when name not found in output', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('some other output\n'))
      return 0
    })

    const result = await vercelInspect(createClient(), 'https://deploy.vercel.app')
    expect(result.name).toBeNull()
  })

  it('returns null values and warns when exec fails', async () => {
    vi.mocked(exec.exec).mockRejectedValue(new Error('command failed'))

    const result = await vercelInspect(createClient(), 'https://deploy.vercel.app')

    expect(result).toEqual({ name: null, inspectUrl: null })
    expect(core.warning).toHaveBeenCalledWith(
      'vercel inspect failed: command failed',
    )
  })

  it('does not throw when exec fails', async () => {
    vi.mocked(exec.exec).mockRejectedValue(new Error('network error'))

    const result = await vercelInspect(createClient(), 'https://deploy.vercel.app')
    expect(result).toEqual({ name: null, inspectUrl: null })
  })

  it('extracts inspectUrl from stderr when available', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('  name  my-project\n  inspectorUrl  https://vercel.com/team/project/dpl_123\n'))
      return 0
    })

    const result = await vercelInspect(createClient(), 'https://deploy.vercel.app')
    expect(result.name).toBe('my-project')
    expect(result.inspectUrl).toBe('https://vercel.com/team/project/dpl_123')
  })

  it('passes correct args including token and inspect command', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await vercelInspect(
      createClient(createConfig({ vercelBin: 'vercel@30', vercelToken: 'tok' })),
      'https://deploy.vercel.app',
    )

    const call = vi.mocked(exec.exec).mock.calls[0]
    expect(call[0]).toBe('npx')
    const args = call[1] as string[]
    expect(args).toContain('vercel@30')
    expect(args).toContain('inspect')
    expect(args).toContain('https://deploy.vercel.app')
    expect(args).toContain('-t')
    expect(args).toContain('tok')
  })

  it('includes scope in args when provided', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await vercelInspect(
      createClient(createConfig({ vercelScope: 'my-team' })),
      'https://deploy.vercel.app',
    )

    const args = vi.mocked(exec.exec).mock.calls[0][1] as string[]
    expect(args).toContain('--scope')
    expect(args).toContain('my-team')
  })

  it('extracts name with varying whitespace', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('    name    my-project-name\n'))
      return 0
    })

    const result = await vercelInspect(createClient(), 'https://deploy.vercel.app')
    expect(result.name).toBe('my-project-name')
  })
})

describe('aliasDomainsToDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when deploymentUrl is empty', async () => {
    await expect(
      aliasDomainsToDeployment(createClient(), createConfig({ aliasDomains: ['example.com'] }), ''),
    ).rejects.toThrow('Deployment URL is required for aliasing domains')
  })

  it('calls exec for each alias domain', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    const cfg = createConfig({ aliasDomains: ['a.com', 'b.com'] })
    await aliasDomainsToDeployment(createClient(cfg), cfg, 'https://deploy.vercel.app')

    expect(exec.exec).toHaveBeenCalledTimes(2)

    const firstCall = vi.mocked(exec.exec).mock.calls[0][1] as string[]
    expect(firstCall).toContain('alias')
    expect(firstCall).toContain('https://deploy.vercel.app')
    expect(firstCall).toContain('a.com')

    const secondCall = vi.mocked(exec.exec).mock.calls[1][1] as string[]
    expect(secondCall).toContain('b.com')
  })

  it('includes scope when provided', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    const cfg = createConfig({ aliasDomains: ['a.com'], vercelScope: 'my-team' })
    await aliasDomainsToDeployment(createClient(cfg), cfg, 'https://deploy.vercel.app')

    const args = vi.mocked(exec.exec).mock.calls[0][1] as string[]
    expect(args).toContain('--scope')
    expect(args).toContain('my-team')
  })

  it('retries on general failure', async () => {
    let callCount = 0
    vi.mocked(exec.exec).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('network error')
      }
      return 0
    })

    const cfg = createConfig({ aliasDomains: ['a.com'] })
    await aliasDomainsToDeployment(createClient(cfg), cfg, 'https://deploy.vercel.app')

    expect(exec.exec).toHaveBeenCalledTimes(2)
  }, 15000)

  it('retries without scope on personal account scope error', async () => {
    let callCount = 0
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      callCount++
      if (callCount === 1) {
        options?.listeners?.stderr?.(
          Buffer.from('You cannot set your Personal Account as the scope'),
        )
        return 1
      }
      return 0
    })

    const cfg = createConfig({ aliasDomains: ['a.com'], vercelScope: 'my-team' })
    await aliasDomainsToDeployment(createClient(cfg), cfg, 'https://deploy.vercel.app')

    expect(exec.exec).toHaveBeenCalledTimes(2)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Retrying without --scope'),
    )
    // Second call should NOT contain --scope
    const retryArgs = vi.mocked(exec.exec).mock.calls[1][1] as string[]
    expect(retryArgs).not.toContain('--scope')
  })

  it('throws when alias retry also fails', async () => {
    let callCount = 0
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      callCount++
      if (callCount === 1) {
        options?.listeners?.stderr?.(
          Buffer.from('You cannot set your Personal Account as the scope'),
        )
        return 1
      }
      options?.listeners?.stderr?.(Buffer.from('another error'))
      return 1
    })

    await expect(
      aliasDomainsToDeployment(createClient(), createConfig({ aliasDomains: ['a.com'] }), 'https://deploy.vercel.app'),
    ).rejects.toThrow('Alias command failed for domain a.com')
  })

  it('throws on non-scope alias failure', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('permission denied'))
      return 1
    })

    await expect(
      aliasDomainsToDeployment(createClient(), createConfig({ aliasDomains: ['a.com'] }), 'https://deploy.vercel.app'),
    ).rejects.toThrow('Alias command failed for domain a.com')
  })

  it('logs success message after all aliases configured', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    const cfg = createConfig({ aliasDomains: ['a.com'] })
    await aliasDomainsToDeployment(createClient(cfg), cfg, 'https://deploy.vercel.app')

    expect(core.info).toHaveBeenCalledWith('All alias domains configured successfully')
  })
})

describe('createVercelClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Routing matrix (spec AC-1):
  // deployment.kind = 'cli', vercelArgs=""    → VercelCliClient
  // deployment.kind = 'cli', vercelArgs="..." → VercelCliClient
  // deployment.kind = 'experimental-api'      → VercelApiClient (with warning)
  // ('experimental-api', vercel-args="...")   → mutual-exclusion error
  //   (enforced upstream in getActionConfig — the discriminated union makes
  //    this state unrepresentable here)

  it('returns VercelCliClient by default (deployment.kind = "cli", vercelArgs="")', () => {
    const config = createConfig({ deployment: { kind: 'cli', vercelArgs: '' } })
    const client = createVercelClient(config)

    expect(client).toBeInstanceOf(VercelCliClient)
    expect(core.info).toHaveBeenCalledWith('Using CLI-based deployment')
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('returns VercelCliClient when vercelArgs is provided', () => {
    const config = createConfig({ deployment: { kind: 'cli', vercelArgs: '--prod' } })
    const client = createVercelClient(config)

    expect(client).toBeInstanceOf(VercelCliClient)
    expect(core.info).toHaveBeenCalledWith('Using CLI-based deployment')
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('returns VercelApiClient when deployment.kind = "experimental-api" and emits a warning', () => {
    const config = createConfig({ deployment: { kind: 'experimental-api' } })
    const client = createVercelClient(config)

    expect(client).toBeInstanceOf(VercelApiClient)
    expect(core.warning).toHaveBeenCalledTimes(1)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('experimental'),
    )
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('@vercel/client'),
    )
  })
})
