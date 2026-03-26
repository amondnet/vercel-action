import type { ActionConfig, DeploymentContext, VercelClient } from './types'
import * as core from '@actions/core'
import { HttpClient } from '@actions/http-client'

const DEFAULT_BASE_URL = 'https://api.vercel.com'

export class VercelApiClient implements VercelClient {
  private readonly http: HttpClient
  private readonly baseUrl: string
  private readonly token: string
  private readonly teamId?: string

  constructor(config: ActionConfig, baseUrl?: string) {
    this.token = config.vercelToken
    this.teamId = config.vercelScope
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
      url.searchParams.set('slug', this.teamId)
    }
    return url.toString()
  }

  async deploy(_config: ActionConfig, _deployContext: DeploymentContext): Promise<string> {
    throw new Error(
      'VercelApiClient.deploy() is not yet implemented. '
      + 'Use VercelCliClient for deployments.',
    )
  }

  async inspect(deploymentUrl: string): Promise<string | null> {
    const deploymentId = this.extractDeploymentId(deploymentUrl)
    const url = this.buildUrl(`/v13/deployments/${deploymentId}`)

    try {
      const response = await this.http.get(url)
      const statusCode = response.message.statusCode ?? 0

      if (statusCode < 200 || statusCode >= 300) {
        core.warning(`Vercel inspect API returned status ${statusCode}`)
        return null
      }

      const body = await response.readBody()
      const data = JSON.parse(body)
      return data.name ?? null
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      core.warning(`vercel inspect failed: ${message}`)
      return null
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
