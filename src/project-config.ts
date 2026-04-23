import type { ActionConfig } from './types'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Subset of @vercel/build-utils `ProjectSettings` covering the fields this
// action populates. Kept local so we do not depend on @vercel/build-utils
// directly (it is only reachable as a transitive dep of @vercel/client).
export interface ProjectSettings {
  rootDirectory?: string | null
  sourceFilesOutsideRootDirectory?: boolean
  nodeVersion?: string
}

export interface ProjectConfig {
  nowConfig?: Record<string, unknown>
  projectSettings?: ProjectSettings
}

function resolveWorkingDir(workingDirectory: string): string {
  return workingDirectory || process.cwd()
}

export function readNodeVersion(workingDirectory: string): string | undefined {
  const filePath = path.join(resolveWorkingDir(workingDirectory), 'package.json')

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  }
  catch {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as { engines?: { node?: unknown } }
    const node = parsed.engines?.node
    return typeof node === 'string' ? node : undefined
  }
  catch {
    return undefined
  }
}

export function readVercelJson(workingDirectory: string): Record<string, unknown> | null {
  const filePath = path.join(resolveWorkingDir(workingDirectory), 'vercel.json')

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${filePath}: ${message}`)
  }
}

export function buildProjectConfig(config: ActionConfig): ProjectConfig {
  const vercelJson = readVercelJson(config.workingDirectory)
  const nodeVersion = readNodeVersion(config.workingDirectory)

  const result: ProjectConfig = {}

  if (vercelJson) {
    // Strip `images` — the Vercel API rejects it; it is consumed locally by
    // `vc build`. Mirrors vercel@50.0.0 CLI deploy at
    // packages/cli/src/commands/deploy/index.ts:512-517.
    const { images: _images, ...rest } = vercelJson
    result.nowConfig = rest
  }

  const projectSettings: ProjectSettings = {}

  // Zero-config: only fill rootDirectory fields when vercel.json exists and
  // does not declare `builds`. Matches the CLI's `if (!localConfig.builds ||
  // localConfig.builds.length === 0)` guard.
  const builds = vercelJson?.builds
  const hasBuilds = Array.isArray(builds) && builds.length > 0
  if (vercelJson && !hasBuilds) {
    projectSettings.rootDirectory = config.rootDirectory || null
    projectSettings.sourceFilesOutsideRootDirectory = true
  }

  if (nodeVersion) {
    projectSettings.nodeVersion = nodeVersion
  }

  if (Object.keys(projectSettings).length > 0) {
    result.projectSettings = projectSettings
  }

  return result
}
