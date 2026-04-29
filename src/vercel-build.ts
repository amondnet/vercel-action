import type { ActionConfig } from './types'
import path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

const STDERR_TAIL_LINES = 20

export class BuildFailedError extends Error {
  public readonly exitCode: number
  public readonly stderrTail: string

  constructor(message: string, exitCode: number, stderrTail: string) {
    super(message)
    this.name = 'BuildFailedError'
    this.exitCode = exitCode
    this.stderrTail = stderrTail
  }

  static fromOutput(
    command: string,
    exitCode: number,
    stdout: string,
    stderr: string,
    tailLines: number = STDERR_TAIL_LINES,
  ): BuildFailedError {
    const source = stderr.trim().length > 0 ? stderr : stdout
    const stderrTail = takeLastLines(source, tailLines)
    const message = `${command} failed with exit code ${exitCode}`
    return new BuildFailedError(message, exitCode, stderrTail)
  }
}

function takeLastLines(text: string, count: number): string {
  if (!text) {
    return ''
  }
  const lines = text.split('\n')
  if (lines.length <= count) {
    return text
  }
  return lines.slice(lines.length - count).join('\n')
}

interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function execVercel(args: string[], cwd: string, env?: Record<string, string>): Promise<ExecResult> {
  let stdout = ''
  let stderr = ''
  const options: exec.ExecOptions = {
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk
        core.info(chunk)
      },
      stderr: (data: Buffer) => {
        const chunk = data.toString()
        stderr += chunk
        core.info(chunk)
      },
    },
  }
  if (cwd) {
    options.cwd = cwd
  }
  if (env) {
    options.env = { ...process.env, ...env } as Record<string, string>
  }

  const exitCode = await exec.exec('npx', args, options)
  return { exitCode, stdout, stderr }
}

function commonArgs(config: ActionConfig): string[] {
  const args: string[] = [config.vercelBin]
  return args
}

function appendScope(args: string[], config: ActionConfig): string[] {
  if (config.vercelScope) {
    args.push('--scope', config.vercelScope)
  }
  return args
}

export async function runVercelPull(config: ActionConfig): Promise<void> {
  const args = commonArgs(config)
  args.push('pull', '--yes', `--environment=${config.target}`, '-t', config.vercelToken)
  appendScope(args, config)

  core.info(`Running vercel pull (environment=${config.target})`)
  const result = await execVercel(args, config.workingDirectory)
  if (result.exitCode !== 0) {
    throw BuildFailedError.fromOutput('vercel pull', result.exitCode, result.stdout, result.stderr)
  }
}

export interface BuildStepResult {
  prebuilt: true
  vercelOutputDir: string
}

export async function runBuildStep(config: ActionConfig): Promise<BuildStepResult> {
  await runVercelPull(config)
  await runVercelBuild(config)
  const basePath = config.workingDirectory || process.cwd()
  return {
    prebuilt: true,
    vercelOutputDir: path.join(basePath, '.vercel', 'output'),
  }
}

export async function runVercelBuild(config: ActionConfig): Promise<void> {
  const args = commonArgs(config)
  args.push('build')
  if (config.target === 'production') {
    args.push('--prod')
  }
  args.push('-t', config.vercelToken)
  appendScope(args, config)

  core.info(`Running vercel build (target=${config.target})`)
  const buildEnv = Object.keys(config.buildEnv).length > 0 ? config.buildEnv : undefined
  const result = await execVercel(args, config.workingDirectory, buildEnv)
  if (result.exitCode !== 0) {
    throw BuildFailedError.fromOutput('vercel build', result.exitCode, result.stdout, result.stderr)
  }
}
