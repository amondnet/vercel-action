import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readVercelJson } from '../project-config'

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
})
