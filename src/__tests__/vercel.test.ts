import type { ActionConfig, DeploymentContext } from '../types'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aliasDomainsToDeployment, vercelDeploy, vercelInspect } from '../vercel'

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
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: '',
    vercelScope: '',
    vercelProjectName: '',
    vercelBin: 'vercel@latest',
    aliasDomains: [],
    ...overrides,
  }
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

    const url = await vercelDeploy(
      createConfig(),
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

    const url = await vercelDeploy(
      createConfig(),
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
      vercelDeploy(createConfig(), createDeployContext()),
    ).rejects.toThrow('Failed to extract deployment URL')
  })

  it('throws when stdout is empty', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await expect(
      vercelDeploy(createConfig(), createDeployContext()),
    ).rejects.toThrow('Failed to extract deployment URL')
  })

  it('passes vercel token and metadata args to exec', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    await vercelDeploy(
      createConfig({ vercelToken: 'my-secret-token', vercelBin: 'vercel@30' }),
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

    await vercelDeploy(
      createConfig({ workingDirectory: '/custom/dir' }),
      createDeployContext(),
    )

    const options = vi.mocked(exec.exec).mock.calls[0][2]
    expect(options?.cwd).toBe('/custom/dir')
  })

  it('includes scope when provided', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    await vercelDeploy(
      createConfig({ vercelScope: 'my-team' }),
      createDeployContext(),
    )

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

    await vercelDeploy(
      createConfig(),
      createDeployContext(),
    )

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

    const url = await vercelDeploy(
      createConfig({ vercelProjectId: 'proj-123' }),
      createDeployContext(),
    )

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
      vercelDeploy(
        createConfig({ vercelProjectId: '' }),
        createDeployContext(),
      ),
    ).rejects.toThrow('no vercel-project-id was provided')
  })

  it('throws on non-zero exit code for non-scope errors', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('some other error'))
      return 1
    })

    await expect(
      vercelDeploy(createConfig(), createDeployContext()),
    ).rejects.toThrow('failed with exit code 1')
  })

  it('sanitizes commit message in metadata', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('https://deploy.vercel.app\n'))
      return 0
    })

    await vercelDeploy(
      createConfig(),
      createDeployContext({ commit: 'line1\nline2\r\n"quoted"' }),
    )

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

    const name = await vercelInspect(createConfig(), 'https://deploy.vercel.app')
    expect(name).toBe('my-project')
  })

  it('returns null when name not found in output', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('some other output\n'))
      return 0
    })

    const name = await vercelInspect(createConfig(), 'https://deploy.vercel.app')
    expect(name).toBeNull()
  })

  it('returns null and warns when exec fails', async () => {
    vi.mocked(exec.exec).mockRejectedValue(new Error('command failed'))

    const name = await vercelInspect(createConfig(), 'https://deploy.vercel.app')

    expect(name).toBeNull()
    expect(core.warning).toHaveBeenCalledWith(
      'vercel inspect failed: command failed',
    )
  })

  it('does not throw when exec fails', async () => {
    vi.mocked(exec.exec).mockRejectedValue(new Error('network error'))

    await expect(
      vercelInspect(createConfig(), 'https://deploy.vercel.app'),
    ).resolves.toBeNull()
  })

  it('passes correct args including token and inspect command', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await vercelInspect(
      createConfig({ vercelBin: 'vercel@30', vercelToken: 'tok' }),
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
      createConfig({ vercelScope: 'my-team' }),
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

    const name = await vercelInspect(createConfig(), 'https://deploy.vercel.app')
    expect(name).toBe('my-project-name')
  })
})

describe('aliasDomainsToDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when deploymentUrl is empty', async () => {
    await expect(
      aliasDomainsToDeployment(createConfig({ aliasDomains: ['example.com'] }), ''),
    ).rejects.toThrow('Deployment URL is required for aliasing domains')
  })

  it('calls exec for each alias domain', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await aliasDomainsToDeployment(
      createConfig({ aliasDomains: ['a.com', 'b.com'] }),
      'https://deploy.vercel.app',
    )

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

    await aliasDomainsToDeployment(
      createConfig({ aliasDomains: ['a.com'], vercelScope: 'my-team' }),
      'https://deploy.vercel.app',
    )

    const args = vi.mocked(exec.exec).mock.calls[0][1] as string[]
    expect(args).toContain('--scope')
    expect(args).toContain('my-team')
  })

  it('retries on failure', async () => {
    vi.mocked(exec.exec)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(0)

    await aliasDomainsToDeployment(
      createConfig({ aliasDomains: ['a.com'] }),
      'https://deploy.vercel.app',
    )

    expect(exec.exec).toHaveBeenCalledTimes(2)
  }, 15000)

  it('logs success message after all aliases configured', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)

    await aliasDomainsToDeployment(
      createConfig({ aliasDomains: ['a.com'] }),
      'https://deploy.vercel.app',
    )

    expect(core.info).toHaveBeenCalledWith('All alias domains configured successfully')
  })
})
