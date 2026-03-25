import type { ActionConfig } from './types'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import { addVercelMetadata, parseArgs, retry } from './utils'

const ALIAS_RETRY_COUNT = 2

export async function vercelDeploy(
  config: ActionConfig,
  ref: string,
  commit: string,
  sha: string,
  commitOrg: string,
  commitRepo: string,
): Promise<string> {
  let output = ''
  const options: exec.ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
        core.info(data.toString())
      },
      stderr: (data: Buffer) => {
        core.warning(data.toString())
      },
    },
  }

  if (config.workingDirectory) {
    options.cwd = config.workingDirectory
  }

  const args = buildDeployArgs(config, ref, commit, sha, commitOrg, commitRepo)

  await exec.exec('npx', [config.vercelBin, ...args], options)

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
  ref: string,
  commit: string,
  sha: string,
  commitOrg: string,
  commitRepo: string,
): string[] {
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
    ...addVercelMetadata('githubCommitMessage', `"${commit}"`, providedArgs),
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

  const args = ['-t', config.vercelToken]
  if (config.vercelScope) {
    core.info('using scope')
    args.push('--scope', config.vercelScope)
  }

  const promises = config.aliasDomains.map(domain =>
    retry(
      () => exec.exec('npx', [config.vercelBin, ...args, 'alias', deploymentUrl, domain]),
      ALIAS_RETRY_COUNT,
    ),
  )

  await Promise.all(promises)
  core.info('All alias domains configured successfully')
}
