import type { ActionConfig } from '../types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildProjectConfig, normalizeNodeVersion, readNodeVersion, readVercelJson } from '../project-config'

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory: '',
    vercelToken: 'test-token',
    deployment: { kind: 'cli', vercelArgs: '' },
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

describe('normalizeNodeVersion', () => {
  // Vercel REST API only accepts the canonical "NN.x" enum for
  // projectSettings.nodeVersion. Forwarding raw engines.node values like
  // ">=24.0.0" or "24.0.0" causes 400 bad_request (issue #359).
  it.each([
    ['24.x', '24.x'],
    ['22.x', '22.x'],
    ['20.x', '20.x'],
  ])('passes canonical %s through unchanged', (input, expected) => {
    expect(normalizeNodeVersion(input)).toBe(expected)
  })

  it.each([
    ['>=24.0.0', '24.x'],
    ['^20.0.0', '20.x'],
    ['24.0.0', '24.x'],
    // Highest-first iteration matches Vercel CLI parity (@vercel/build-utils
    // `getSupportedNodeVersion`) — open-ended ranges resolve to the newest
    // supported major.
    ['>=18', '24.x'],
    ['>=22.0.0', '24.x'],
  ])('normalizes range %s to %s', (input, expected) => {
    expect(normalizeNodeVersion(input)).toBe(expected)
  })

  it('returns undefined for a discontinued-but-valid major (e.g. 18.x)', () => {
    // 18.x parses cleanly as a range but does not intersect any currently
    // supported Vercel major. The action falls back to the project default
    // rather than sending an invalid value.
    expect(normalizeNodeVersion('18.x')).toBeUndefined()
  })

  it('returns undefined when the range matches no supported version', () => {
    expect(normalizeNodeVersion('>=99.0.0')).toBeUndefined()
  })

  it('returns undefined for invalid semver input', () => {
    expect(normalizeNodeVersion('not-a-version')).toBeUndefined()
  })

  it('returns undefined for empty input', () => {
    expect(normalizeNodeVersion(undefined)).toBeUndefined()
    expect(normalizeNodeVersion('')).toBeUndefined()
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

  it('copies vercel.json buildCommand and installCommand into projectSettings', () => {
    // The Vercel REST API rejects `nowConfig` as an undeclared additional
    // property; we mirror the CLI's parity behavior of copying select
    // vercel.json keys into projectSettings. See #359.
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: './build.sh', installCommand: 'pnpm i' }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result).not.toHaveProperty('nowConfig')
    expect(result.projectSettings?.buildCommand).toBe('./build.sh')
    expect(result.projectSettings?.installCommand).toBe('pnpm i')
    // zero-config: builds absent → projectSettings gets rootDirectory + sourceFilesOutsideRootDirectory
    expect(result.projectSettings?.rootDirectory).toBeNull()
    expect(result.projectSettings?.sourceFilesOutsideRootDirectory).toBe(true)
  })

  it('copies all whitelisted vercel.json keys: buildCommand, installCommand, outputDirectory, framework, devCommand', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({
        buildCommand: 'build',
        installCommand: 'install',
        outputDirectory: 'dist',
        framework: 'nextjs',
        devCommand: 'dev',
      }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.projectSettings?.buildCommand).toBe('build')
    expect(result.projectSettings?.installCommand).toBe('install')
    expect(result.projectSettings?.outputDirectory).toBe('dist')
    expect(result.projectSettings?.framework).toBe('nextjs')
    expect(result.projectSettings?.devCommand).toBe('dev')
  })

  it('omits projectSettings.rootDirectory when vercel.json defines builds', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({
        builds: [{ src: 'api/*.ts', use: '@vercel/node' }],
      }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    // `builds` is not in the projectSettings whitelist; presence of vercel.json
    // is enough to skip the zero-config branch.
    expect(result.projectSettings?.rootDirectory).toBeUndefined()
    expect(result.projectSettings?.sourceFilesOutsideRootDirectory).toBeUndefined()
  })

  it('preserves explicit null values for whitelisted keys (Vercel "use default" sentinel)', () => {
    // The Vercel REST API treats `null` and `undefined` differently: omission
    // means "keep current project setting", null means "explicit override to
    // no command". The action must preserve null verbatim.
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ buildCommand: null, framework: 'hugo' }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.projectSettings?.buildCommand).toBeNull()
    expect(result.projectSettings?.framework).toBe('hugo')
  })

  it('rejects non-string/non-null values for whitelisted keys without sending them to the API', () => {
    // Defensive guard: a user with a malformed vercel.json (e.g. `framework: 42`)
    // should get a local warning rather than a 400 from the deployment endpoint.
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({
        buildCommand: 42,
        installCommand: true,
        outputDirectory: ['dist'],
        framework: { name: 'nextjs' },
        devCommand: 'dev',
      }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.projectSettings).not.toHaveProperty('buildCommand')
    expect(result.projectSettings).not.toHaveProperty('installCommand')
    expect(result.projectSettings).not.toHaveProperty('outputDirectory')
    expect(result.projectSettings).not.toHaveProperty('framework')
    expect(result.projectSettings?.devCommand).toBe('dev')
  })

  it('does not copy images, redirects, or other non-whitelisted vercel.json keys into projectSettings', () => {
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({
        buildCommand: 'build',
        images: { sizes: [640, 1080] },
        redirects: [{ source: '/a', destination: '/b' }],
        rewrites: [{ source: '/c', destination: '/d' }],
        headers: [{ source: '/e', headers: [] }],
      }),
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.projectSettings?.buildCommand).toBe('build')
    expect(result.projectSettings).not.toHaveProperty('images')
    expect(result.projectSettings).not.toHaveProperty('redirects')
    expect(result.projectSettings).not.toHaveProperty('rewrites')
    expect(result.projectSettings).not.toHaveProperty('headers')
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

  it('does not let prototype-pollution gadgets reach projectSettings', () => {
    // The static whitelist (buildCommand, installCommand, outputDirectory,
    // framework, devCommand) excludes __proto__/constructor/prototype by
    // construction. Locking the contract.
    writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      '{"buildCommand":"build","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    )

    const result = buildProjectConfig(createConfig({ workingDirectory: tmpDir }))

    expect(result.projectSettings?.buildCommand).toBe('build')
    expect(Object.getOwnPropertyNames(result.projectSettings ?? {})).not.toContain('__proto__')
    expect(Object.getOwnPropertyNames(result.projectSettings ?? {})).not.toContain('constructor')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
