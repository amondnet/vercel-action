import type { DeploymentOptions, VercelClientOptions } from '@vercel/client'
import type { ActionConfig, DeploymentContext, InspectResult, VercelClient } from './types'
import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { HttpClient } from '@actions/http-client'
import { createDeployment } from '@vercel/client'
import { buildProjectConfig } from './project-config'

const DEFAULT_BASE_URL = 'https://api.vercel.com'

function buildGitMetadata(deployContext: DeploymentContext) {
  const { context } = github
  return {
    commitSha: deployContext.sha,
    commitMessage: deployContext.commit.replace(/[\r\n]+/g, ' ').replace(/"/g, ''),
    commitRef: deployContext.ref.replace('refs/heads/', ''),
    commitAuthorName: context.actor,
    remoteUrl: `https://github.com/${deployContext.commitOrg}/${deployContext.commitRepo}`,
  }
}

function buildClientOptions(config: ActionConfig, apiUrl?: string): VercelClientOptions {
  const options: VercelClientOptions = {
    token: config.vercelToken,
    path: config.workingDirectory || process.cwd(),
    debug: core.isDebug(),
  }

  // Always set apiUrl explicitly — @vercel/client uses it to select the
  // correct http/https agent for file uploads. When omitted, the agent
  // defaults to http even though the URL defaults to https://api.vercel.com,
  // causing ERR_INVALID_PROTOCOL errors.
  options.apiUrl = apiUrl ?? DEFAULT_BASE_URL
  if (config.vercelOrgId) {
    options.teamId = config.vercelOrgId
  }
  if (config.force) {
    options.force = true
  }
  if (config.prebuilt) {
    options.prebuilt = true
    const basePath = config.workingDirectory || process.cwd()
    options.vercelOutputDir = config.vercelOutputDir || path.join(basePath, '.vercel', 'output')
  }
  if (config.archive === 'tgz') {
    options.archive = 'tgz'
  }
  if (config.rootDirectory) {
    options.rootDirectory = config.rootDirectory
  }
  if (config.withCache) {
    options.withCache = true
  }
  if (config.vercelProjectName) {
    options.projectName = config.vercelProjectName
  }
  else if (config.vercelProjectId) {
    // Fall back to vercelProjectId as projectName when vercelProjectName is absent.
    // This ensures the client library has a valid project identifier for operations
    // such as file uploads in prebuilt deployments. See: #330
    options.projectName = config.vercelProjectId
  }
  options.skipAutoDetectionConfirmation = true

  return options
}

function buildDeploymentOptions(config: ActionConfig, deployContext: DeploymentContext): DeploymentOptions {
  const options: DeploymentOptions = {
    meta: {
      githubCommitSha: deployContext.sha,
      githubCommitAuthorName: github.context.actor,
      githubCommitAuthorLogin: github.context.actor,
      githubDeployment: '1',
      githubOrg: github.context.repo.owner,
      githubRepo: github.context.repo.repo,
      githubCommitOrg: deployContext.commitOrg,
      githubCommitRepo: deployContext.commitRepo,
      githubCommitMessage: deployContext.commit.replace(/[\r\n]+/g, ' ').replace(/"/g, ''),
      githubCommitRef: deployContext.ref.replace('refs/heads/', ''),
    },
    gitMetadata: buildGitMetadata(deployContext),
    autoAssignCustomDomains: config.autoAssignCustomDomains,
  }

  applyConditionalFlags(options, config)
  applyProjectConfig(options, config)

  return options
}

// Copy across the flat action-input flags that map 1:1 to DeploymentOptions.
// Kept separate from buildDeploymentOptions to honor the 50-LOC function limit
// (AGENTS.md) and to isolate the long if-chain from the main meta shape.
function applyConditionalFlags(options: DeploymentOptions, config: ActionConfig): void {
  if (config.target === 'production') {
    options.target = 'production'
  }
  if (Object.keys(config.env).length > 0) {
    options.env = config.env
  }
  if (Object.keys(config.buildEnv).length > 0) {
    options.build = { env: config.buildEnv }
  }
  if (config.regions.length > 0) {
    options.regions = config.regions
  }
  if (config.isPublic) {
    options.public = true
  }
  if (config.customEnvironment) {
    options.customEnvironmentSlugOrId = config.customEnvironment
  }
  if (config.vercelProjectName) {
    options.name = config.vercelProjectName
  }
  if (config.vercelProjectId) {
    // The Vercel REST API accepts `project` in the deployment body to target a
    // specific project by ID, but @vercel/client's DeploymentOptions type doesn't
    // declare it. Object.assign adds the field without explicit type casting.
    // See: #330
    Object.assign(options, { project: config.vercelProjectId })
  }
}

// Honor select `vercel.json` keys via `projectSettings` (buildCommand,
// installCommand, outputDirectory, framework, devCommand) plus a normalized
// `nodeVersion` from `package.json` engines.node. The Vercel REST API does
// not accept `nowConfig` as a top-level field — see #359.
function applyProjectConfig(options: DeploymentOptions, config: ActionConfig): void {
  const projectConfig = buildProjectConfig(config)
  if (projectConfig.projectSettings) {
    options.projectSettings = projectConfig.projectSettings
  }
}

export class VercelApiClient implements VercelClient {
  private readonly http: HttpClient
  private readonly baseUrl: string
  private readonly token: string
  private readonly teamId?: string

  constructor(config: ActionConfig, baseUrl?: string) {
    this.token = config.vercelToken
    this.teamId = config.vercelOrgId || undefined
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL
    this.http = new HttpClient('vercel-action', [], {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    })
  }

  private buildUrl(path: string): string {
    const url = new URL(path, this.baseUrl)
    if (this.teamId) {
      url.searchParams.set('teamId', this.teamId)
    }
    return url.toString()
  }

  async deploy(config: ActionConfig, deployContext: DeploymentContext): Promise<string> {
    const clientOptions = buildClientOptions(config, this.baseUrl)
    const deploymentOptions = buildDeploymentOptions(config, deployContext)

    core.info('Starting API-based deployment...')

    let deploymentUrl = ''

    for await (const event of createDeployment(clientOptions, deploymentOptions)) {
      switch (event.type) {
        case 'hashes-calculated':
          core.info(`Files hashed: ${Object.keys(event.payload).length} files`)
          break
        case 'file-count':
          core.info(`Files to upload: ${event.payload.total}, missing: ${event.payload.missing?.length ?? 0}`)
          break
        case 'file-uploaded':
          core.debug(`Uploaded: ${event.payload}`)
          break
        case 'created': {
          const url = event.payload?.url
          if (url) {
            deploymentUrl = url.startsWith('https://') ? url : `https://${url}`
            core.info(`Deployment created: ${deploymentUrl}`)
          }
          else {
            core.info('Deployment created (no URL provided yet)')
          }
          break
        }
        case 'building':
          core.info('Building deployment...')
          break
        case 'ready':
          core.info('Deployment is ready!')
          if (event.payload?.url && !deploymentUrl) {
            const url = event.payload.url
            deploymentUrl = url.startsWith('https://') ? url : `https://${url}`
          }
          break
        case 'alias-assigned':
          core.info(`Alias assigned: ${event.payload?.alias}`)
          break
        case 'warning':
          core.warning(`Deployment warning: ${JSON.stringify(event.payload)}`)
          break
        case 'error':
          throw new Error(`Deployment failed: ${JSON.stringify(event.payload)}`)
        default:
          core.debug(`Deployment event: ${event.type}`)
      }
    }

    if (!deploymentUrl) {
      throw new Error('Deployment completed but no URL was returned')
    }

    return deploymentUrl
  }

  async inspect(deploymentUrl: string): Promise<InspectResult> {
    const deploymentId = this.extractDeploymentId(deploymentUrl)
    const url = this.buildUrl(`/v13/deployments/${deploymentId}`)

    try {
      const response = await this.http.get(url)
      const statusCode = response.message.statusCode ?? 0

      if (statusCode < 200 || statusCode >= 300) {
        core.warning(`Vercel inspect API returned status ${statusCode}`)
        return { name: null, inspectUrl: null }
      }

      const body = await response.readBody()
      const data = JSON.parse(body)
      return {
        name: data.name ?? null,
        inspectUrl: data.inspectorUrl ?? null,
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      core.warning(`vercel inspect failed: ${message}`)
      return { name: null, inspectUrl: null }
    }
  }

  async assignAlias(deploymentUrl: string, domain: string): Promise<void> {
    const deploymentId = this.extractDeploymentId(deploymentUrl)
    const url = this.buildUrl(`/v2/deployments/${deploymentId}/aliases`)

    const response = await this.http.post(url, JSON.stringify({ alias: domain }))
    const statusCode = response.message.statusCode ?? 0

    if (statusCode < 200 || statusCode >= 300) {
      const body = await response.readBody()
      throw new Error(
        `Alias assignment failed for domain ${domain} with status ${statusCode}: ${body}`,
      )
    }
  }

  private extractDeploymentId(deploymentUrl: string): string {
    try {
      const url = new URL(deploymentUrl)
      return url.hostname
    }
    catch {
      return deploymentUrl
    }
  }
}
