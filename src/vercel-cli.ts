import type { ActionConfig, DeploymentContext, InspectResult, VercelClient } from './types'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import { addVercelMetadata, parseArgs } from './utils'

const PERSONAL_ACCOUNT_SCOPE_ERROR = 'You cannot set your Personal Account as the scope'

function extractDeploymentUrl(output: string): string {
  const deploymentUrl = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .pop()

  if (!deploymentUrl || !deploymentUrl.startsWith('https://')) {
    throw new Error(`Failed to extract deployment URL from vercel output: ${output}`)
  }

  return deploymentUrl
}

function buildDeployArgs(
  config: ActionConfig,
  deployContext: DeploymentContext,
): string[] {
  const { ref, commit, sha, commitOrg, commitRepo } = deployContext
  const { context } = github
  const vercelArgs = config.deployment.kind === 'cli' ? config.deployment.vercelArgs : ''
  const providedArgs = parseArgs(vercelArgs)

  const args = [
    ...providedArgs,
    '-t',
    config.vercelToken,
    ...addVercelMetadata('githubCommitSha', sha, providedArgs),
    ...addVercelMetadata('githubCommitAuthorName', context.actor, providedArgs),
    ...addVercelMetadata('githubCommitAuthorLogin', context.actor, providedArgs),
    ...addVercelMetadata('githubDeployment', 1, providedArgs),
    ...addVercelMetadata('githubOrg', context.repo.owner, providedArgs),
    ...addVercelMetadata('githubRepo', context.repo.repo, providedArgs),
    ...addVercelMetadata('githubCommitOrg', commitOrg, providedArgs),
    ...addVercelMetadata('githubCommitRepo', commitRepo, providedArgs),
    ...addVercelMetadata('githubCommitMessage', `"${commit.replace(/[\r\n]+/g, ' ').replace(/"/g, '')}"`, providedArgs),
    ...addVercelMetadata('githubCommitRef', ref.replace('refs/heads/', ''), providedArgs),
  ]

  if (config.vercelScope) {
    core.info('using scope')
    args.push('--scope', config.vercelScope)
  }

  return args
}

export class VercelCliClient implements VercelClient {
  private readonly config: ActionConfig

  constructor(config: ActionConfig) {
    this.config = config
  }

  async deploy(config: ActionConfig, deployContext: DeploymentContext): Promise<string> {
    let output = ''
    let errorOutput = ''
    const options: exec.ExecOptions = {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
          core.info(data.toString())
        },
        stderr: (data: Buffer) => {
          errorOutput += data.toString()
          core.info(data.toString())
        },
      },
    }

    if (config.workingDirectory) {
      options.cwd = config.workingDirectory
    }

    const args = buildDeployArgs(config, deployContext)

    let exitCode = await exec.exec('npx', [config.vercelBin, ...args], options)

    if (exitCode !== 0) {
      const combinedOutput = output + errorOutput
      if (combinedOutput.includes(PERSONAL_ACCOUNT_SCOPE_ERROR)) {
        if (!config.vercelProjectId) {
          throw new Error(
            'Vercel CLI rejected VERCEL_ORG_ID as a personal account scope, '
            + 'but no vercel-project-id was provided to use as a fallback. '
            + 'Either remove vercel-org-id or add vercel-project-id to your workflow.',
          )
        }
        core.warning(
          'Vercel CLI rejected the org ID as a personal account scope. '
          + 'Retrying without VERCEL_ORG_ID and VERCEL_PROJECT_ID.',
        )
        delete process.env.VERCEL_ORG_ID
        delete process.env.VERCEL_PROJECT_ID

        output = ''
        errorOutput = ''
        const retryConfig: ActionConfig = { ...config, vercelScope: undefined }
        const retryArgs = buildDeployArgs(retryConfig, deployContext)

        exitCode = await exec.exec('npx', [config.vercelBin, ...retryArgs], options)
      }

      if (exitCode !== 0) {
        throw new Error(`The process 'npx' failed with exit code ${exitCode}`)
      }
    }

    return extractDeploymentUrl(output)
  }

  async inspect(deploymentUrl: string): Promise<InspectResult> {
    let errorOutput = ''
    const options: exec.ExecOptions = {
      listeners: {
        stdout: (data: Buffer) => {
          core.info(data.toString())
        },
        stderr: (data: Buffer) => {
          errorOutput += data.toString()
          core.info(data.toString())
        },
      },
    }

    if (this.config.workingDirectory) {
      options.cwd = this.config.workingDirectory
    }

    const args = [this.config.vercelBin, 'inspect', deploymentUrl, '-t', this.config.vercelToken]

    if (this.config.vercelScope) {
      core.info('using scope')
      args.push('--scope', this.config.vercelScope)
    }

    try {
      await exec.exec('npx', args, options)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      core.warning(`vercel inspect failed: ${message}`)
      return { name: null, inspectUrl: null }
    }

    const nameMatch = errorOutput.match(/^\s+name\s+(.+)$/m)
    const inspectUrlMatch = errorOutput.match(/^\s+inspectorUrl\s+(.+)$/m)

    if (!nameMatch?.[1]) {
      core.debug(`Failed to extract project name from inspect output`)
    }

    return {
      name: nameMatch?.[1]?.trim() ?? null,
      inspectUrl: inspectUrlMatch?.[1]?.trim() ?? null,
    }
  }

  async assignAlias(deploymentUrl: string, domain: string): Promise<void> {
    const args = [this.config.vercelBin, '-t', this.config.vercelToken]
    if (this.config.vercelScope) {
      core.info('using scope')
      args.push('--scope', this.config.vercelScope)
    }
    args.push('alias', deploymentUrl, domain)

    let aliasOutput = ''
    let aliasError = ''
    const exitCode = await exec.exec('npx', args, {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => { aliasOutput += data.toString() },
        stderr: (data: Buffer) => { aliasError += data.toString() },
      },
    })

    if (exitCode !== 0) {
      const combinedOutput = aliasOutput + aliasError
      if (combinedOutput.includes(PERSONAL_ACCOUNT_SCOPE_ERROR)) {
        core.warning(
          'Vercel CLI rejected the scope for alias command. '
          + 'Retrying without --scope.',
        )
        const retryArgs = [this.config.vercelBin, '-t', this.config.vercelToken, 'alias', deploymentUrl, domain]
        let retryError = ''
        let retryOutput = ''
        const retryExitCode = await exec.exec('npx', retryArgs, {
          ignoreReturnCode: true,
          listeners: {
            stdout: (data: Buffer) => { retryOutput += data.toString() },
            stderr: (data: Buffer) => { retryError += data.toString() },
          },
        })
        if (retryExitCode !== 0) {
          const retryStderr = retryError ? `, stderr: ${retryError.trim()}` : ''
          const retryStdout = retryOutput ? `, stdout: ${retryOutput.trim()}` : ''
          throw new Error(
            `Alias command failed for domain ${domain} with exit code ${retryExitCode}${retryStderr}${retryStdout}`,
          )
        }
        return
      }
      throw new Error(
        `Alias command failed for domain ${domain} with exit code ${exitCode}: ${aliasError}`,
      )
    }
  }
}
