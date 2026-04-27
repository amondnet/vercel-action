import type { ActionConfig, DeploymentContext } from '../types'

export function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory: '',
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
    sourceFilesOutsideRootDirectory: false,
    nodeVersion: '',
    autoAssignCustomDomains: true,
    customEnvironment: '',
    isPublic: false,
    withCache: false,
    ...overrides,
  }
}

export function createDeployContext(overrides: Partial<DeploymentContext> = {}): DeploymentContext {
  return {
    ref: 'refs/heads/main',
    sha: 'abc123',
    commit: 'test commit',
    commitOrg: 'test-owner',
    commitRepo: 'test-repo',
    ...overrides,
  }
}
