import type { ActionConfig, DeploymentContext } from './types'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import { addVercelMetadata, parseArgs, retry } from './utils'

const ALIAS_RETRY_COUNT = 2
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

export async function vercelDeploy(
  config: ActionConfig,
  deployContext: DeploymentContext,
): Promise<string> {
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
      const retryArgs = buildDeployArgs(config, deployContext)

      exitCode = await exec.exec('npx', [config.vercelBin, ...retryArgs], options)
    }

    if (exitCode !== 0) {
      throw new Error(`The process 'npx' failed with exit code ${exitCode}`)
    }
  }

  return extractDeploymentUrl(output)
}

function buildDeployArgs(
  config: ActionConfig,
  deployContext: DeploymentContext,
): string[] {
  const { ref, commit, sha, commitOrg, commitRepo } = deployContext
  const { context } = github
  const providedArgs = parseArgs(config.vercelArgs)

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

export async function vercelInspect(
  config: ActionConfig,
  deploymentUrl: string,
): Promise<string | null> {
  let errorOutput = ''
  const options: exec.ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        core.info(data.toString())
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString()
        core.warning(data.toString())
      },
    },
  }

  if (config.workingDirectory) {
    options.cwd = config.workingDirectory
  }

  const args = [config.vercelBin, 'inspect', deploymentUrl, '-t', config.vercelToken]

  if (config.vercelScope) {
    core.info('using scope')
    args.push('--scope', config.vercelScope)
  }

  try {
    await exec.exec('npx', args, options)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(`vercel inspect failed: ${message}`)
    return null
  }

  const match = errorOutput.match(/^\s+name\s+(.+)$/m)
  if (!match?.[1]) {
    core.debug(`Failed to extract project name from inspect output`)
    return null
  }
  return match[1]
}

export async function aliasDomainsToDeployment(
  config: ActionConfig,
  deploymentUrl: string,
): Promise<void> {
  if (!deploymentUrl) {
    throw new Error('Deployment URL is required for aliasing domains')
  }

  const promises = config.aliasDomains.map(domain =>
    retry(
      async () => {
        const args = [config.vercelBin, '-t', config.vercelToken]
        if (config.vercelScope) {
          core.info('using scope')
          args.push('--scope', config.vercelScope)
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
            const retryArgs = [config.vercelBin, '-t', config.vercelToken, 'alias', deploymentUrl, domain]
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
      },
      ALIAS_RETRY_COUNT,
    ),
  )

  await Promise.all(promises)
  core.info('All alias domains configured successfully')
}
