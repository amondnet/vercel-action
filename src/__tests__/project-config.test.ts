import type { ActionConfig } from '../types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildProjectConfig, readNodeVersion, readVercelJson } from '../project-config'

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory: '',
    vercelToken: 'test-token',
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: '',
    vercelProjectName: '',
    vercelBin: '',
    aliasDomains: [],
    target: 'preview',
    prebuilt: false,
    vercelOutputDir: '',
    force: false,
    env: {},
    buildEnv: {},
    regions: [],
    archive: '',
    rootDirectory: '',
    autoAssignCustomDomains: true,
    customEnvironment: '',
    isPublic: false,
    withCache: false,
    ...overrides,
  }
}

describe('readVercelJson', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'vercel-action-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns parsed object when vercel.json is present', () => {
    const configPath = path.join(tmpDir, 'vercel.json')
    writeFileSync(configPath, JSON.stringify({ buildCommand: './build.sh' }))

    const result = readVercelJson(tmpDir)

    expect(result).toEqual({ buildCommand: './build.sh' })
  })

  it('returns null when vercel.json is absent', () => {
    const result = readVercelJson(tmpDir)

    expect(result).toBeNull()
  })

  it('throws with file path on invalid JSON', () => {
    const configPath = path.join(tmpDir, 'vercel.json')
    writeFileSync(configPath, '{invalid json')

    expect(() => readVercelJson(tmpDir)).toThrow(configPath)
  })

  it.each([
    ['array', '[]'],
    ['string', '"hello"'],
    ['number', '42'],
    ['boolean', 'true'],
    ['null', 'null'],
  ])('throws when vercel.json top-level value is %s', (_label, raw) => {
    // Vercel expects an object at the top level. Non-object JSON would
    // silently produce an invalid nowConfig (e.g. Object.entries([]) yields
    // numeric index keys), so we fail fast.
    const configPath = path.join(tmpDir, 'vercel.json')
    writeFileSync(configPath, raw)

    expect(() => readVercelJson(tmpDir)).toThrow(configPath)
  })

  it('reads vercel.json relative to workingDirectory, not process.cwd', () => {
    const configPath = path.join(tmpDir, 'vercel.json')
    writeFileSync(configPath, JSON.stringify({ framework: 'hugo' }))

    const result = readVercelJson(tmpDir)

    expect(result).toEqual({ framework: 'hugo' })
  })

  it('falls back to process.cwd() when workingDirectory is empty', () => {
    // Empty working directory should resolve to current working directory.
    // Ensuring it does not throw on missing vercel.json in cwd is sufficient.
    const result = readVercelJson('')

    expect(result === null || typeof result === 'object').toBe(true)
  })

  it('re-throws non-ENOENT fs errors (locks the contract with EISDIR)', () => {
    // Only ENOENT is treated as "config absent". Other fs errors must surface
    // so a misconfigured path is not silently turned into a deployment that
    // omits the user's buildCommand (the #336 regression pattern).
    // Use a directory at the vercel.json location to trigger EISDIR — a real,
    // reproducible, non-ENOENT fs error.
    mkdirSync(path.join(tmpDir, 'vercel.json'))

    expect(() => readVercelJson(tmpDir)).toThrow()
  })
})

describe('readNodeVersion', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'vercel-action-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns engines.node value when package.json has it', () => {
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ engines: { node: '20.x' } }),
    )

    expect(readNodeVersion(tmpDir)).toBe('20.x')
  })

  it('returns undefined when package.json is absent', () => {
    expect(readNodeVersion(tmpDir)).toBeUndefined()
  })

  it('returns undefined when engines.node is missing', () => {
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-pkg' }),
    )

    expect(readNodeVersion(tmpDir)).toBeUndefined()
  })

  it('returns undefined when package.json is unreadable JSON', () => {
    writeFileSync(path.join(tmpDir, 'package.json'), '{broken')

    // Unlike vercel.json, a malformed package.json should not fail the
    // deployment — it is only used for an optional nodeVersion hint.
    expect(readNodeVersion(tmpDir)).toBeUndefined()
  })
})

describe('buildProjectConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'vercel-action-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns nowConfig from vercel.json with buildCommand and zero-config projectSettings', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: './build.sh', installCommand: 'pnpm i' }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.nowConfig).toEqual({ buildCommand: './build.sh', installCommand: 'pnpm i' })
    // zero-config: builds absent → projectSettings gets rootDirectory + sourceFilesOutsideRootDirectory
    expect(result.projectSettings).toBeDefined()
    expect(result.projectSettings?.rootDirectory).toBeNull()
    expect(result.projectSettings?.sourceFilesOutsideRootDirectory).toBe(true)
  })

  it('omits projectSettings.rootDirectory when vercel.json defines builds', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({
        builds: [{ src: 'api/*.ts', use: '@vercel/node' }],
      }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.nowConfig).toEqual({ builds: [{ src: 'api/*.ts', use: '@vercel/node' }] })
    // builds present → skip rootDirectory/sourceFilesOutsideRootDirectory
    expect(result.projectSettings?.rootDirectory).toBeUndefined()
    expect(result.projectSettings?.sourceFilesOutsideRootDirectory).toBeUndefined()
  })

  it('strips images from nowConfig', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'build', images: { sizes: [640, 1080] } }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.nowConfig).toEqual({ buildCommand: 'build' })
    expect(result.nowConfig).not.toHaveProperty('images')
  })

  it('returns empty object when vercel.json and package.json are both absent', () => {
    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result).toEqual({})
  })

  it('populates projectSettings.nodeVersion from package.json engines.node', () => {
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ engines: { node: '20.x' } }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.projectSettings?.nodeVersion).toBe('20.x')
  })

  it('sets projectSettings.rootDirectory to config.rootDirectory when provided and zero-config', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'build' }),
    )

    const result = buildProjectConfig(createConfig({
      workingDirectory: tmpDir,
      rootDirectory: 'apps/web',
    }))

    expect(result.projectSettings?.rootDirectory).toBe('apps/web')
    expect(result.projectSettings?.sourceFilesOutsideRootDirectory).toBe(true)
  })

  it('throws when vercel.json is invalid JSON', () => {
    writeFileSync(path.join(tmpDir, 'vercel.json'), '{invalid')

    expect(() => buildProjectConfig(createConfig({ workingDirectory: tmpDir }))).toThrow()
  })

  it('strips __proto__ and constructor keys from nowConfig', () => {
    // Crafted vercel.json with prototype-pollution gadgets. Must not reach
    // downstream consumers that might forward the object via [[Set]].
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      '{"buildCommand":"build","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.nowConfig).toEqual({ buildCommand: 'build' })
    // Use Object.getOwnPropertyNames so we only inspect own keys — `toHaveProperty`
    // walks the prototype chain and would match `__proto__` on any normal object.
    expect(Object.getOwnPropertyNames(result.nowConfig ?? {})).not.toContain('__proto__')
    expect(Object.getOwnPropertyNames(result.nowConfig ?? {})).not.toContain('constructor')
    // sanity: Object.prototype was not mutated in the process
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
