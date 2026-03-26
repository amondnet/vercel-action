import type { Emulator } from 'emulate'
import { createEmulator } from 'emulate'

const VERCEL_PORT = 4000
const GITHUB_PORT = 4001

let vercelEmulator: Emulator
let githubEmulator: Emulator

export async function setup(): Promise<void> {
  vercelEmulator = await createEmulator({
    service: 'vercel',
    port: VERCEL_PORT,
  })

  githubEmulator = await createEmulator({
    service: 'github',
    port: GITHUB_PORT,
  })

  process.env.EMULATE_VERCEL_URL = vercelEmulator.url
  process.env.EMULATE_GITHUB_URL = githubEmulator.url
}

export async function teardown(): Promise<void> {
  await vercelEmulator?.close()
  await githubEmulator?.close()
}
