import type { ActionConfig, DeploymentContext, InspectResult, VercelClient } from './types'
import * as core from '@actions/core'
import { retry } from './utils'
import { VercelApiClient } from './vercel-api'
import { VercelCliClient } from './vercel-cli'

const ALIAS_RETRY_COUNT = 2

export function createVercelClient(config: ActionConfig): VercelClient {
  switch (config.deployment.kind) {
    case 'experimental-api':
      core.warning(
        'Using experimental API-based deployment via @vercel/client. '
        + 'This is an internal Vercel package without semver guarantees and may break across updates. '
        + 'Set "experimental-api: false" or remove the input to use the stable CLI-based deployment.',
      )
      return new VercelApiClient(config)
    case 'cli':
      core.info('Using CLI-based deployment')
      return new VercelCliClient(config)
    default: {
      const exhaustive: never = config.deployment
      throw new Error(`Unhandled deployment mode: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export async function vercelDeploy(
  client: VercelClient,
  config: ActionConfig,
  deployContext: DeploymentContext,
): Promise<string> {
  return client.deploy(config, deployContext)
}

export async function vercelInspect(
  client: VercelClient,
  deploymentUrl: string,
): Promise<InspectResult> {
  return client.inspect(deploymentUrl)
}

export async function aliasDomainsToDeployment(
  client: VercelClient,
  config: ActionConfig,
  deploymentUrl: string,
): Promise<void> {
  if (!deploymentUrl) {
    throw new Error('Deployment URL is required for aliasing domains')
  }

  const promises = config.aliasDomains.map(domain =>
    retry(
      () => client.assignAlias(deploymentUrl, domain),
      ALIAS_RETRY_COUNT,
    ),
  )

  await Promise.all(promises)
  core.info('All alias domains configured successfully')
}
