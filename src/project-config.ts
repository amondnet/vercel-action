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

// Vercel REST API enum for projectSettings.nodeVersion. Forwarding any other
// value (e.g. raw `engines.node` like ">=24.0.0") fails with HTTP 400. Order
// matters: lowest first so `semver.intersects` picks the most compatible match
// for open-ended ranges like ">=18". See #359.
const VERCEL_NODE_VERSIONS = ['20.x', '22.x', '24.x'] as const

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
    const normalized = normalizeNodeVersion(nodeVersion)
    if (normalized) {
      projectSettings.nodeVersion = normalized
    }
    else {
      core.warning(
        `Ignoring engines.node="${nodeVersion}" — Vercel only accepts one of ${VERCEL_NODE_VERSIONS.join(', ')}. The deployment will use the project's default Node version.`,
      )
    }
  }

  if (Object.keys(projectSettings).length > 0) {
    result.projectSettings = projectSettings
  }

  return result
}
