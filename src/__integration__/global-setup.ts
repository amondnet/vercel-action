import type { Emulator, SeedConfig } from 'emulate'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createEmulator } from 'emulate'
import { parse } from 'yaml'

let vercelEmulator: Emulator | undefined
let githubEmulator: Emulator | undefined

function loadSeedConfig(): SeedConfig {
  const configPath = resolve(process.cwd(), 'emulate.config.yaml')
  const content = readFileSync(configPath, 'utf-8')
  return parse(content) as SeedConfig
}

function getPortFromEnv(envVar: string, defaultPort: number): number {
  const value = process.env[envVar]
  if (!value) {
    return defaultPort
  }
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port value "${value}" for ${envVar}`)
  }
  return port
}

export async function setup(): Promise<void> {
  const seed = loadSeedConfig()

  vercelEmulator = await createEmulator({
    service: 'vercel',
    port: getPortFromEnv('EMULATE_VERCEL_PORT', 4000),
    seed,
  })

  try {
    githubEmulator = await createEmulator({
      service: 'github',
      port: getPortFromEnv('EMULATE_GITHUB_PORT', 4001),
      seed,
    })
  }
  catch (error) {
    await vercelEmulator.close()
    throw error
  }

  process.env.EMULATE_VERCEL_URL = vercelEmulator.url
  process.env.EMULATE_GITHUB_URL = githubEmulator.url
  process.env.GITHUB_API_URL = githubEmulator.url

  // GitHub Actions normally injects these; provide defaults so integration
  // tests also run locally. Do not overwrite values set by a real CI run.
  process.env.GITHUB_REPOSITORY ??= 'test-owner/test-repo'
  process.env.GITHUB_ACTOR ??= 'test-user'
}

export async function teardown(): Promise<void> {
  await vercelEmulator?.close()
  await githubEmulator?.close()
}
