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

// Keys that must not pass through to `nowConfig`.
//   - `images`: the Vercel API rejects it; it is consumed locally by `vc build`.
//     Mirrors vercel@50.0.0 CLI at packages/cli/src/commands/deploy/index.ts:512-517.
//   - prototype-pollution gadgets: a crafted vercel.json could otherwise smuggle
//     them into downstream merge paths in @vercel/client. The rest spread we
//     previously used is CreateDataProperty-safe, but code we do not control
//     (e.g. request serializers) may forward the object via [[Set]].
const STRIPPED_NOW_CONFIG_KEYS = new Set(['images', '__proto__', 'constructor', 'prototype'])

function sanitizeNowConfig(vercelJson: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(vercelJson).filter(([key]) => !STRIPPED_NOW_CONFIG_KEYS.has(key)),
  )
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

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${filePath}: ${message}`)
  }

  // Guard against non-object JSON (arrays, strings, numbers, null, booleans).
  // Vercel expects an object at the top level; anything else would silently
  // produce an invalid nowConfig (e.g. `Object.entries([])` yields index keys).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid ${filePath}: expected a JSON object at the top level`)
  }

  return parsed as Record<string, unknown>
}

export function buildProjectConfig(config: ActionConfig): ProjectConfig {
  const vercelJson = readVercelJson(config.workingDirectory)
  const nodeVersion = readNodeVersion(config.workingDirectory)

  const result: ProjectConfig = {}

  if (vercelJson) {
    result.nowConfig = sanitizeNowConfig(vercelJson)
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
