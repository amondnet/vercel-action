/**
 * Integration test for the vercel-build flow.
 *
 * Strategy: pre-populate `.vercel/output` (the artifact `vercel build` would
 * produce), then drive the orchestration with a mocked exec so the test
 * validates the boundary between runBuildStep and the existing prebuilt
 * deploy path against the real emulator.
 */
import type { ActionConfig, DeploymentContext } from '../types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as exec from '@actions/exec'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VercelApiClient } from '../vercel-api'
import { runBuildStep } from '../vercel-build'
import { TEST_PROJECT, TEST_TEAM, VERCEL_TOKEN } from './helpers'

vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
}))

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

function createConfig(workingDirectory: string, overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory,
    vercelToken: VERCEL_TOKEN,
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: TEST_PROJECT,
    vercelProjectName: TEST_PROJECT,
    vercelBin: 'vercel@50.0.0',
    aliasDomains: [],
    vercelScope: TEST_TEAM,
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
  }
}

function createDeployContext(): DeploymentContext {
  return {
    ref: 'refs/heads/main',
    sha: 'sha-test',
    commit: 'integration test commit',
    commitOrg: 'test-owner',
    commitRepo: 'test-repo',
  }
}

function setupVercelOutput(workingDir: string): void {
  const outputDir = path.join(workingDir, '.vercel', 'output')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify({ version: 3, routes: [] }),
  )
  mkdirSync(path.join(outputDir, 'static'), { recursive: true })
  writeFileSync(path.join(outputDir, 'static', 'index.html'), '<html></html>')
}

describe('vercelBuild integration', () => {
  let workingDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    workingDir = mkdtempSync(path.join(tmpdir(), 'vercel-build-'))
  })

  afterEach(() => {
    rmSync(workingDir, { recursive: true, force: true })
  })

  it('runBuildStep produces config that points to the project .vercel/output', async () => {
    vi.mocked(exec.exec).mockImplementation(async () => {
      setupVercelOutput(workingDir)
      return 0
    })

    const config = createConfig(workingDir)
    const result = await runBuildStep(config)

    expect(result.prebuilt).toBe(true)
    expect(result.vercelOutputDir).toBe(path.join(workingDir, '.vercel', 'output'))
    expect(exec.exec).toHaveBeenCalledTimes(2)
    expect(vi.mocked(exec.exec).mock.calls[0][1]).toContain('pull')
    expect(vi.mocked(exec.exec).mock.calls[1][1]).toContain('build')
  })

  it('deploy through emulator using prebuilt output produced by build step', async () => {
    vi.mocked(exec.exec).mockImplementation(async () => {
      setupVercelOutput(workingDir)
      return 0
    })

    const config = createConfig(workingDir)
    const buildResult = await runBuildStep(config)

    const deployConfig: ActionConfig = {
      ...config,
      prebuilt: buildResult.prebuilt,
      vercelOutputDir: buildResult.vercelOutputDir,
    }

    const apiUrl = process.env.EMULATE_VERCEL_URL
    if (!apiUrl) {
      throw new Error('EMULATE_VERCEL_URL must be set by global-setup')
    }
    const client = new VercelApiClient(deployConfig, apiUrl)
    const deploymentUrl = await client.deploy(deployConfig, createDeployContext())

    expect(deploymentUrl).toMatch(/^https:\/\//)
  })

  it('runBuildStep fails fast and does not invoke build when pull fails', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options: any) => {
      options.listeners.stderr(Buffer.from('emulator pull error\n'))
      return 1
    })

    const config = createConfig(workingDir)

    await expect(runBuildStep(config)).rejects.toMatchObject({
      name: 'BuildFailedError',
      exitCode: 1,
    })
    expect(exec.exec).toHaveBeenCalledTimes(1)
  })
})
