import type { Emulator, SeedConfig } from 'emulate'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createEmulator } from 'emulate'
import { parse } from 'yaml'

let vercelEmulator: Emulator
let githubEmulator: Emulator

function loadSeedConfig(): SeedConfig {
  const configPath = resolve(process.cwd(), 'emulate.config.yaml')
  const content = readFileSync(configPath, 'utf-8')
  return parse(content) as SeedConfig
}

export async function setup(): Promise<void> {
  const seed = loadSeedConfig()

  vercelEmulator = await createEmulator({
    service: 'vercel',
    port: 4000,
    seed,
  })

  try {
    githubEmulator = await createEmulator({
      service: 'github',
      port: 4001,
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
}

export async function teardown(): Promise<void> {
  await vercelEmulator?.close()
  await githubEmulator?.close()
}
