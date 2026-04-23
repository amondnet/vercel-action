import type { ActionConfig, DeploymentContext } from '../types'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as core from '@actions/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VercelApiClient } from '../vercel-api'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  isDebug: vi.fn(() => false),
}))

vi.mock('@actions/github', () => ({
  context: {
    actor: 'test-user',
    repo: { owner: 'test-owner', repo: 'test-repo' },
  },
}))

const mockCreateDeployment = vi.fn()
vi.mock('@vercel/client', () => ({
  createDeployment: (...args: unknown[]) => mockCreateDeployment(...args),
}))

vi.mock('@actions/http-client', () => ({
  HttpClient: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
  })),
}))

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    workingDirectory: '/test/path',
    vercelToken: 'test-token',
    vercelArgs: '',
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

async function* fakeDeploymentEvents(events: Array<{ type: string, payload: unknown }>) {
  for (const event of events) {
    yield event
  }
}

describe('vercelApiClient.deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns deployment URL from created event', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'hashes-calculated', payload: { 'file1.js': 'sha1' } },
      { type: 'file-count', payload: { total: 1, missing: [] } },
      { type: 'created', payload: { url: 'https://my-app-abc123.vercel.app' } },
      { type: 'building', payload: {} },
      { type: 'ready', payload: {} },
    ]))

    const client = new VercelApiClient(createConfig())
    const url = await client.deploy(createConfig(), createDeployContext())

    expect(url).toBe('https://my-app-abc123.vercel.app')
  })

  it('prepends https:// when URL lacks protocol', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'my-app-abc123.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const client = new VercelApiClient(createConfig())
    const url = await client.deploy(createConfig(), createDeployContext())

    expect(url).toBe('https://my-app-abc123.vercel.app')
  })

  it('falls back to ready event URL when created has no URL', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: {} },
      { type: 'ready', payload: { url: 'https://ready-url.vercel.app' } },
    ]))

    const client = new VercelApiClient(createConfig())
    const url = await client.deploy(createConfig(), createDeployContext())

    expect(url).toBe('https://ready-url.vercel.app')
  })

  it('throws on error event', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'error', payload: { message: 'Build failed' } },
    ]))

    const client = new VercelApiClient(createConfig())
    await expect(client.deploy(createConfig(), createDeployContext()))
      .rejects
      .toThrow('Deployment failed')
  })

  it('throws when no URL is returned', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: {} },
      { type: 'ready', payload: {} },
    ]))

    const client = new VercelApiClient(createConfig())
    await expect(client.deploy(createConfig(), createDeployContext()))
      .rejects
      .toThrow('Deployment completed but no URL was returned')
  })

  it('logs deployment events', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'hashes-calculated', payload: { 'a.js': 'h1', 'b.js': 'h2' } },
      { type: 'file-count', payload: { total: 2, missing: ['a.js'] } },
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'building', payload: {} },
      { type: 'ready', payload: {} },
    ]))

    const client = new VercelApiClient(createConfig())
    await client.deploy(createConfig(), createDeployContext())

    expect(core.info).toHaveBeenCalledWith('Files hashed: 2 files')
    expect(core.info).toHaveBeenCalledWith('Files to upload: 2, missing: 1')
    expect(core.info).toHaveBeenCalledWith('Deployment created: https://test.vercel.app')
    expect(core.info).toHaveBeenCalledWith('Building deployment...')
    expect(core.info).toHaveBeenCalledWith('Deployment is ready!')
  })

  it('passes correct client options', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({
      vercelToken: 'my-token',
      workingDirectory: '/my/project',
      vercelOrgId: 'team_abc123',
      force: true,
      prebuilt: true,
      archive: 'tgz',
      withCache: true,
    })

    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const callArgs = mockCreateDeployment.mock.calls[0][0]
    expect(callArgs.token).toBe('my-token')
    expect(callArgs.path).toBe('/my/project')
    expect(callArgs.teamId).toBe('team_abc123')
    expect(callArgs.force).toBe(true)
    expect(callArgs.prebuilt).toBe(true)
    expect(callArgs.archive).toBe('tgz')
    expect(callArgs.withCache).toBe(true)
  })

  it('passes correct deployment options', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({
      target: 'production',
      env: { NODE_ENV: 'production' },
      buildEnv: { BUILD_VAR: 'value' },
      regions: ['iad1', 'sfo1'],
      isPublic: true,
      customEnvironment: 'staging',
      vercelProjectName: 'my-project',
    })

    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.target).toBe('production')
    expect(deployOpts.env).toEqual({ NODE_ENV: 'production' })
    expect(deployOpts.build).toEqual({ env: { BUILD_VAR: 'value' } })
    expect(deployOpts.regions).toEqual(['iad1', 'sfo1'])
    expect(deployOpts.public).toBe(true)
    expect(deployOpts.customEnvironmentSlugOrId).toBe('staging')
    expect(deployOpts.name).toBe('my-project')
  })

  it('includes gitMetadata from deploy context', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const client = new VercelApiClient(createConfig())
    await client.deploy(createConfig(), createDeployContext({
      sha: 'def456',
      ref: 'refs/heads/feature/auth',
      commit: 'add auth',
      commitOrg: 'org',
      commitRepo: 'repo',
    }))

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.gitMetadata).toEqual({
      commitSha: 'def456',
      commitMessage: 'add auth',
      commitRef: 'feature/auth',
      commitAuthorName: 'test-user',
      remoteUrl: 'https://github.com/org/repo',
    })
  })

  it('logs warning events', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'warning', payload: { message: 'No files found' } },
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const client = new VercelApiClient(createConfig())
    await client.deploy(createConfig(), createDeployContext())

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('No files found'))
  })

  it('passes project ID in deployment options when vercelProjectId is set', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({
      vercelProjectId: 'prj_abc123',
    })

    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.project).toBe('prj_abc123')
  })

  it('omits project field when vercelProjectId is empty', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({
      vercelProjectId: '',
    })

    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.project).toBeUndefined()
  })

  it('passes project ID alongside vercelProjectName', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({
      vercelProjectId: 'prj_abc123',
      vercelProjectName: 'my-project',
    })

    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.project).toBe('prj_abc123')
    expect(deployOpts.name).toBe('my-project')
  })

  it('uses cwd when workingDirectory is empty', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({ workingDirectory: '' })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const callArgs = mockCreateDeployment.mock.calls[0][0]
    expect(callArgs.path).toBe(process.cwd())
  })

  it('forwards an absolute path to @vercel/client to avoid the v42.2.0 regression', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({ workingDirectory: '/github/workspace/public' })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const callArgs = mockCreateDeployment.mock.calls[0][0]
    expect(path.isAbsolute(callArgs.path)).toBe(true)
    expect(callArgs.path).toBe('/github/workspace/public')
  })

  it('derives an absolute vercelOutputDir for prebuilt deployments', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({
      workingDirectory: '/github/workspace/app',
      prebuilt: true,
      vercelOutputDir: '',
    })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const callArgs = mockCreateDeployment.mock.calls[0][0]
    expect(path.isAbsolute(callArgs.vercelOutputDir)).toBe(true)
    expect(callArgs.vercelOutputDir).toBe(path.join('/github/workspace/app', '.vercel', 'output'))
  })
})

describe('vercelApiClient.deploy — nowConfig/projectSettings', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tmpDir = mkdtempSync(path.join(tmpdir(), 'vercel-action-api-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('includes nowConfig.buildCommand when vercel.json is present', async () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: './build.sh', framework: 'hugo' }),
    )

    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({ workingDirectory: tmpDir })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.nowConfig).toBeDefined()
    expect(deployOpts.nowConfig.buildCommand).toBe('./build.sh')
    expect(deployOpts.nowConfig.framework).toBe('hugo')
  })

  it('omits nowConfig when vercel.json is absent', async () => {
    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({ workingDirectory: tmpDir })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.nowConfig).toBeUndefined()
  })

  it('strips images from nowConfig', async () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'build', images: { sizes: [640] } }),
    )

    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({ workingDirectory: tmpDir })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.nowConfig).toEqual({ buildCommand: 'build' })
  })

  it('populates projectSettings.nodeVersion from package.json engines.node', async () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'build' }),
    )
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ engines: { node: '20.x' } }),
    )

    mockCreateDeployment.mockReturnValue(fakeDeploymentEvents([
      { type: 'created', payload: { url: 'https://test.vercel.app' } },
      { type: 'ready', payload: {} },
    ]))

    const config = createConfig({ workingDirectory: tmpDir })
    const client = new VercelApiClient(config)
    await client.deploy(config, createDeployContext())

    const deployOpts = mockCreateDeployment.mock.calls[0][1]
    expect(deployOpts.projectSettings?.nodeVersion).toBe('20.x')
  })

  it('fails fast when vercel.json is malformed', async () => {
    writeFileSync(path.join(tmpDir, 'vercel.json'), '{invalid')

    const config = createConfig({ workingDirectory: tmpDir })
    const client = new VercelApiClient(config)

    await expect(client.deploy(config, createDeployContext()))
      .rejects
      .toThrow(/vercel\.json/)
  })
})
