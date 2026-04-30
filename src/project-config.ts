import type { ActionConfig } from './types'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as core from '@actions/core'
import semver from 'semver'

// Subset of @vercel/build-utils `ProjectSettings` covering the fields this
// action populates. Kept local so we do not depend on @vercel/build-utils
// directly (it is only reachable as a transitive dep of @vercel/client).
export interface ProjectSettings {
  rootDirectory?: string | null
  sourceFilesOutsideRootDirectory?: boolean
  nodeVersion?: string
  buildCommand?: string | null
  installCommand?: string | null
  outputDirectory?: string | null
  framework?: string | null
  devCommand?: string | null
}

export interface ProjectConfig {
  projectSettings?: ProjectSettings
}

// Vercel CLI parity: keys from vercel.json that map directly into
// projectSettings on the deployment payload. The Vercel REST API rejects
// nowConfig as an additional property, so we never forward it. See #359.
const PROJECT_SETTINGS_KEYS = [
  'buildCommand',
  'installCommand',
  'outputDirectory',
  'framework',
  'devCommand',
] as const

function resolveWorkingDir(workingDirectory: string): string {
  return workingDirectory || process.cwd()
}

// Vercel REST API enum for projectSettings.nodeVersion. Forwarding any other
// value (e.g. raw `engines.node` like ">=24.0.0") fails with HTTP 400. Order
// is highest-first to match Vercel CLI parity: `@vercel/build-utils`
// `getSupportedNodeVersion` iterates the same list in descending order and
// returns the first intersecting major. So `>=18` resolves to `24.x`, just as
// `vc deploy` would. See #359.
const VERCEL_NODE_VERSIONS = ['24.x', '22.x', '20.x'] as const

export function normalizeNodeVersion(input: string | undefined): string | undefined {
  if (!input)
    return undefined
  if ((VERCEL_NODE_VERSIONS as readonly string[]).includes(input))
    return input

  const range = semver.validRange(input)
  if (!range)
    return undefined

  for (const version of VERCEL_NODE_VERSIONS) {
    try {
      if (semver.intersects(range, version))
        return version
    }
    catch {
      // semver.intersects can throw on exotic inputs; treat as no match.
    }
  }
  return undefined
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
  // produce malformed projectSettings (e.g. `Object.entries([])` yields index keys).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid ${filePath}: expected a JSON object at the top level`)
  }

  return parsed as Record<string, unknown>
}

export function buildProjectConfig(config: ActionConfig): ProjectConfig {
  const vercelJson = readVercelJson(config.workingDirectory)
  const nodeVersion = readNodeVersion(config.workingDirectory)

  const result: ProjectConfig = {}
  const projectSettings: ProjectSettings = {}

  if (vercelJson) {
    for (const key of PROJECT_SETTINGS_KEYS) {
      if (Object.hasOwn(vercelJson, key)) {
        // Whitelist + own-property check keeps prototype-pollution gadgets
        // (`__proto__`, `constructor`, ...) out of projectSettings. The
        // value-type guard rejects unexpected shapes (numbers, booleans,
        // arrays) before the Vercel API validator sees them, surfacing a
        // local warning instead of a 400 from the deployment endpoint.
        const value = vercelJson[key]
        if (typeof value === 'string' || value === null) {
          projectSettings[key] = value
        }
        else {
          core.warning(
            `Ignoring vercel.json "${key}" — expected string or null, got ${typeof value === 'object' ? (Array.isArray(value) ? 'array' : 'object') : typeof value}.`,
          )
        }
      }
    }
  }

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
    const normalized = normalizeNodeVersion(nodeVersion)
    if (normalized) {
      projectSettings.nodeVersion = normalized
    }
    else {
      // Reached when `engines.node` is syntactically valid semver but does not
      // intersect any currently-supported Vercel major (e.g. `18.x` after Node
      // 18 is discontinued, or `>=99.0.0`), or when the value is not parseable.
      core.warning(
        `Ignoring engines.node="${nodeVersion}" — Vercel only supports Node majors ${VERCEL_NODE_VERSIONS.join(', ')}. Falling back to the project's default Node version.`,
      )
    }
  }

  if (Object.keys(projectSettings).length > 0) {
    result.projectSettings = projectSettings
  }

  return result
}
