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

// Cap captured output (per stream) at ~64 KB. Long `vercel build` runs can
// produce many MB of logs; we already stream them live through core.info, so
// the in-memory buffer only needs enough tail to populate BuildFailedError's
// stderrTail (last ~20 lines).
const MAX_CAPTURED_BYTES = 64 * 1024

function appendBounded(existing: string, chunk: string, maxBytes: number): string {
  const combined = existing + chunk
  if (combined.length <= maxBytes) {
    return combined
  }
  return combined.slice(combined.length - maxBytes)
}

async function execVercel(
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<ExecResult> {
  let stdout = ''
  let stderr = ''
  const options: exec.ExecOptions = {
    ignoreReturnCode: true,
    // Suppress @actions/exec's [command]... echo line on outStream so the
    // resolved argv (which historically included `-t <token>` in the legacy
    // CLI path) cannot land in raw stdout. Token is now passed via
    // VERCEL_TOKEN env, so this is defense-in-depth on top of `setSecret`.
    silent: true,
    env: { ...process.env, ...env } as Record<string, string>,
    listeners: {
      stdout: (data: Buffer) => {
        const chunk = data.toString()
        stdout = appendBounded(stdout, chunk, MAX_CAPTURED_BYTES)
        core.info(chunk)
      },
      stderr: (data: Buffer) => {
        const chunk = data.toString()
        stderr = appendBounded(stderr, chunk, MAX_CAPTURED_BYTES)
        core.info(chunk)
      },
    },
  }
  if (cwd) {
    options.cwd = cwd
  }

  const exitCode = await exec.exec('npx', args, options)
  return { exitCode, stdout, stderr }
}

function commonArgs(config: ActionConfig): string[] {
  return [config.vercelBin]
}

function appendScope(args: string[], config: ActionConfig): string[] {
  if (config.vercelScope) {
    args.push('--scope', config.vercelScope)
  }
  return args
}

function tokenEnv(config: ActionConfig): Record<string, string> {
  return { VERCEL_TOKEN: config.vercelToken }
}

export async function runVercelPull(config: ActionConfig): Promise<void> {
  const args = commonArgs(config)
  args.push('pull', '--yes', `--environment=${config.target}`)
  appendScope(args, config)

  core.info(`Running vercel pull (environment=${config.target})`)
  const result = await execVercel(args, config.workingDirectory, tokenEnv(config))
  if (result.exitCode !== 0) {
    throw BuildFailedError.fromOutput('vercel pull', result.exitCode, result.stdout, result.stderr)
  }
}

export interface BuildStepResult {
  prebuilt: true
  vercelOutputDir: string
}

function resolveOutputDir(config: ActionConfig): string {
  if (config.vercelOutputDir) {
    return path.isAbsolute(config.vercelOutputDir)
      ? config.vercelOutputDir
      : path.resolve(config.workingDirectory || process.cwd(), config.vercelOutputDir)
  }
  const basePath = config.workingDirectory || process.cwd()
  return path.join(basePath, '.vercel', 'output')
}

export async function runBuildStep(config: ActionConfig): Promise<BuildStepResult> {
  await runVercelPull(config)
  await runVercelBuild(config)
  return {
    prebuilt: true,
    vercelOutputDir: resolveOutputDir(config),
  }
}

export async function runVercelBuild(config: ActionConfig): Promise<void> {
  const args = commonArgs(config)
  args.push('build')
  if (config.target === 'production') {
    args.push('--prod')
  }
  appendScope(args, config)
  // When the user supplies a custom vercel-output-dir, tell `vercel build`
  // to write the artifact there so the subsequent prebuilt deploy reads
  // from the same directory. Without this, build defaults to .vercel/output
  // while deploy looks at config.vercelOutputDir — silently mismatched.
  if (config.vercelOutputDir) {
    args.push('--output', resolveOutputDir(config))
  }

  core.info(`Running vercel build (target=${config.target})`)
  const env = { ...tokenEnv(config), ...config.buildEnv }
  const result = await execVercel(args, config.workingDirectory, env)
  if (result.exitCode !== 0) {
    throw BuildFailedError.fromOutput('vercel build', result.exitCode, result.stdout, result.stderr)
  }
}
