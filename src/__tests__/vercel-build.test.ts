import type { ActionConfig } from '../types'
import * as exec from '@actions/exec'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuildFailedError, runBuildStep, runVercelBuild, runVercelPull } from '../vercel-build'

vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
}))

function makeConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: true,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory: '/app',
    vercelToken: 'tok',
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: '',
    vercelScope: '',
    vercelProjectName: '',
    vercelBin: 'vercel@50.0.0',
    aliasDomains: [],
    target: 'preview',
    prebuilt: false,
    vercelBuild: true,
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
  } as ActionConfig
}

describe('BuildFailedError', () => {
  it('is an instance of Error', () => {
    const err = new BuildFailedError('build failed', 1, '')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(BuildFailedError)
  })

  it('exposes exitCode and stderrTail fields', () => {
    const err = new BuildFailedError('build failed', 137, 'last line of stderr')
    expect(err.exitCode).toBe(137)
    expect(err.stderrTail).toBe('last line of stderr')
  })

  it('captures only the last N lines of stderr (default 20)', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
    const stderr = lines.join('\n')

    const err = BuildFailedError.fromOutput('vercel build', 1, '', stderr)

    const tailLines = err.stderrTail.split('\n')
    expect(tailLines.length).toBe(20)
    expect(tailLines[0]).toBe('line 11')
    expect(tailLines[19]).toBe('line 30')
  })

  it('captures full stderr when fewer lines than the limit', () => {
    const stderr = 'one\ntwo\nthree'
    const err = BuildFailedError.fromOutput('vercel build', 1, '', stderr)
    expect(err.stderrTail).toBe('one\ntwo\nthree')
  })

  it('falls back to stdout tail when stderr is empty', () => {
    const err = BuildFailedError.fromOutput('vercel build', 1, 'stdout output', '')
    expect(err.stderrTail).toBe('stdout output')
  })

  it('builds a clear error message including command and exit code', () => {
    const err = BuildFailedError.fromOutput('vercel build', 137, 'stdout', 'stderr')
    expect(err.message).toContain('vercel build')
    expect(err.message).toContain('137')
  })

  it('preserves error name for instanceof checks', () => {
    const err = new BuildFailedError('m', 1, '')
    expect(err.name).toBe('BuildFailedError')
  })
})

describe('runVercelPull', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes "vercel pull" with --yes, --environment=preview by default', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ target: 'preview' })

    await runVercelPull(config)

    expect(exec.exec).toHaveBeenCalledOnce()
    const [cmd, args, opts] = vi.mocked(exec.exec).mock.calls[0]
    expect(cmd).toBe('npx')
    expect(args).toContain(config.vercelBin)
    expect(args).toContain('pull')
    expect(args).toContain('--yes')
    expect(args).toContain('--environment=preview')
    expect(opts?.cwd).toBe('/app')
  })

  it('passes token via VERCEL_TOKEN env var, never via argv', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ vercelToken: 'super-secret' })

    await runVercelPull(config)

    const [, args, opts] = vi.mocked(exec.exec).mock.calls[0]
    expect(args).not.toContain('-t')
    expect(args).not.toContain('--token')
    expect(args.join(' ')).not.toContain('super-secret')
    expect(opts?.env?.VERCEL_TOKEN).toBe('super-secret')
  })

  it('runs exec with silent: true to suppress [command] echo', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    await runVercelPull(makeConfig())
    const opts = vi.mocked(exec.exec).mock.calls[0][2]
    expect(opts?.silent).toBe(true)
  })

  it('uses --environment=production when target is production', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ target: 'production' })

    await runVercelPull(config)

    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    expect(args).toContain('--environment=production')
  })

  it('passes --scope when vercelScope is set', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ vercelScope: 'team-slug' })

    await runVercelPull(config)

    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    expect(args).toEqual(expect.arrayContaining(['--scope', 'team-slug']))
  })

  it('throws BuildFailedError when exit code is non-zero', async () => {
    const opts = { listeners: { stdout: vi.fn(), stderr: vi.fn() } }
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options: any) => {
      options.listeners.stderr(Buffer.from('cannot resolve project\n'))
      return 1
    })
    const config = makeConfig()

    await expect(runVercelPull(config)).rejects.toBeInstanceOf(BuildFailedError)
    void opts
  })
})

describe('runVercelBuild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes "vercel build" without --prod for preview', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ target: 'preview' })

    await runVercelBuild(config)

    const [cmd, args, opts] = vi.mocked(exec.exec).mock.calls[0]
    expect(cmd).toBe('npx')
    expect(args).toContain('build')
    expect(args).not.toContain('--prod')
    expect(opts?.cwd).toBe('/app')
  })

  it('passes token via VERCEL_TOKEN env var, never via argv', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ vercelToken: 'super-secret', buildEnv: { FOO: 'bar' } })

    await runVercelBuild(config)

    const [, args, opts] = vi.mocked(exec.exec).mock.calls[0]
    expect(args).not.toContain('-t')
    expect(args).not.toContain('--token')
    expect(args.join(' ')).not.toContain('super-secret')
    expect(opts?.env?.VERCEL_TOKEN).toBe('super-secret')
    expect(opts?.env?.FOO).toBe('bar')
  })

  it('runs exec with silent: true to suppress [command] echo', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    await runVercelBuild(makeConfig())
    const opts = vi.mocked(exec.exec).mock.calls[0][2]
    expect(opts?.silent).toBe(true)
  })

  it('passes --prod when target is production', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ target: 'production' })

    await runVercelBuild(config)

    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    expect(args).toContain('--prod')
  })

  it('passes vercelScope as --scope', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ vercelScope: 'team-slug' })

    await runVercelBuild(config)

    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    expect(args).toEqual(expect.arrayContaining(['--scope', 'team-slug']))
  })

  it('merges buildEnv into the exec environment', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ buildEnv: { FOO: 'bar', BAZ: 'qux' } })

    await runVercelBuild(config)

    const opts = vi.mocked(exec.exec).mock.calls[0][2]
    expect(opts?.env?.FOO).toBe('bar')
    expect(opts?.env?.BAZ).toBe('qux')
  })

  it('throws BuildFailedError carrying stderr tail on failure', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options: any) => {
      options.listeners.stderr(Buffer.from('Error: missing module\n'))
      return 2
    })
    const config = makeConfig()

    await expect(runVercelBuild(config)).rejects.toMatchObject({
      name: 'BuildFailedError',
      exitCode: 2,
      stderrTail: expect.stringContaining('Error: missing module'),
    })
  })

  it('caps captured stderr buffer when output is huge (no OOM)', async () => {
    // Simulate a 1 MB stderr stream. The captured buffer must not grow
    // unboundedly — it should retain only the trailing ~64 KB so the
    // BuildFailedError's stderrTail remains representative without
    // pinning megabytes of memory per build.
    const oneKb = 'x'.repeat(1024)
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options: any) => {
      for (let i = 0; i < 1024; i++) {
        options.listeners.stderr(Buffer.from(`${oneKb}\n`))
      }
      // Final marker so we can prove the tail is preserved.
      options.listeners.stderr(Buffer.from('FINAL_MARKER\n'))
      return 1
    })

    try {
      await runVercelBuild(makeConfig())
      throw new Error('expected runVercelBuild to throw')
    }
    catch (err: any) {
      expect(err.name).toBe('BuildFailedError')
      // Trailing marker is retained.
      expect(err.stderrTail).toContain('FINAL_MARKER')
      // Captured buffer is bounded; should be far under 1 MB.
      expect(err.stderrTail.length).toBeLessThan(128 * 1024)
    }
  })

  it('uses process.cwd() when workingDirectory is empty', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ workingDirectory: '' })

    await runVercelBuild(config)

    const opts = vi.mocked(exec.exec).mock.calls[0][2]
    expect(opts?.cwd).toBeUndefined()
  })

  it('omits --output when vercelOutputDir is empty', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    await runVercelBuild(makeConfig({ vercelOutputDir: '' }))
    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    expect(args).not.toContain('--output')
  })

  it('passes --output <absolute> when vercelOutputDir is an absolute path', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    await runVercelBuild(makeConfig({ vercelOutputDir: '/abs/out' }))
    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    const idx = args.indexOf('--output')
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe('/abs/out')
  })

  it('resolves relative vercelOutputDir against workingDirectory for --output', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    await runVercelBuild(makeConfig({
      workingDirectory: '/work',
      vercelOutputDir: 'custom/out',
    }))
    const args = vi.mocked(exec.exec).mock.calls[0][1] ?? []
    const idx = args.indexOf('--output')
    expect(args[idx + 1]).toBe('/work/custom/out')
  })
})

describe('runBuildStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs pull then build in order, both with success', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ workingDirectory: '/proj' })

    const result = await runBuildStep(config)

    expect(exec.exec).toHaveBeenCalledTimes(2)
    expect(vi.mocked(exec.exec).mock.calls[0][1]).toContain('pull')
    expect(vi.mocked(exec.exec).mock.calls[1][1]).toContain('build')
    expect(result.prebuilt).toBe(true)
    expect(result.vercelOutputDir).toBe('/proj/.vercel/output')
  })

  it('returns vercelOutputDir resolved against process.cwd() when workingDirectory is empty', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ workingDirectory: '' })

    const result = await runBuildStep(config)

    expect(result.prebuilt).toBe(true)
    expect(result.vercelOutputDir).toContain('.vercel/output')
  })

  it('returns user-supplied vercelOutputDir (absolute) instead of default', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ workingDirectory: '/proj', vercelOutputDir: '/custom/out' })

    const result = await runBuildStep(config)

    expect(result.vercelOutputDir).toBe('/custom/out')
  })

  it('resolves relative vercelOutputDir against workingDirectory in result', async () => {
    vi.mocked(exec.exec).mockResolvedValue(0)
    const config = makeConfig({ workingDirectory: '/proj', vercelOutputDir: 'custom/out' })

    const result = await runBuildStep(config)

    expect(result.vercelOutputDir).toBe('/proj/custom/out')
  })

  it('propagates BuildFailedError from pull (does not run build)', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options: any) => {
      options.listeners.stderr(Buffer.from('pull broken\n'))
      return 1
    })
    const config = makeConfig()

    await expect(runBuildStep(config)).rejects.toBeInstanceOf(BuildFailedError)
    expect(exec.exec).toHaveBeenCalledTimes(1)
  })

  it('propagates BuildFailedError from build', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, args: any, options: any) => {
      if (args.includes('build')) {
        options.listeners.stderr(Buffer.from('build broken\n'))
        return 2
      }
      return 0
    })
    const config = makeConfig()

    await expect(runBuildStep(config)).rejects.toMatchObject({
      name: 'BuildFailedError',
      exitCode: 2,
    })
    expect(exec.exec).toHaveBeenCalledTimes(2)
  })
})
