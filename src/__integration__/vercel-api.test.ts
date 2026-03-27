import type { ActionConfig } from '../types'
import { beforeAll, describe, expect, it } from 'vitest'
import { VercelApiClient } from '../vercel-api'
import { TEST_PROJECT, TEST_TEAM, VERCEL_TOKEN, vercelFetch } from './helpers'

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    workingDirectory: '',
    vercelToken: VERCEL_TOKEN,
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: '',
    vercelProjectName: '',
    vercelBin: '',
    aliasDomains: [],
    vercelScope: TEST_TEAM,
    ...overrides,
  }
}

let aliasSupported = true

describe('vercelApiClient (integration)', () => {
  beforeAll(async () => {
    // Probe whether the alias endpoint is available in this emulator version
    const probeRes = await vercelFetch(`/v2/deployments/probe-alias-support/aliases`, {
      method: 'POST',
      body: JSON.stringify({ alias: 'probe.example.com' }),
    })
    if (probeRes.status === 404) {
      aliasSupported = false
    }
  })

  describe('inspect', () => {
    it('should return project name from a deployment', async () => {
      const createRes = await vercelFetch(`/v13/deployments?slug=${TEST_TEAM}`, {
        method: 'POST',
        body: JSON.stringify({
          name: TEST_PROJECT,
          target: 'preview',
          files: [{ file: 'index.html', data: '<h1>Hello</h1>' }],
        }),
      })
      const created = await createRes.json()

      const client = new VercelApiClient(createConfig(), process.env.EMULATE_VERCEL_URL)
      const name = await client.inspect(created.id)

      expect(name).toBe(TEST_PROJECT)
    })

    it('should return null for non-existent deployment', async () => {
      const client = new VercelApiClient(createConfig(), process.env.EMULATE_VERCEL_URL)
      const name = await client.inspect('non-existent-id')

      expect(name).toBeNull()
    })
  })

  describe('assignAlias', () => {
    it('should assign an alias to a deployment', async () => {
      if (!aliasSupported) {
        return
      }

      const createRes = await vercelFetch(`/v13/deployments?slug=${TEST_TEAM}`, {
        method: 'POST',
        body: JSON.stringify({
          name: TEST_PROJECT,
          target: 'preview',
          files: [{ file: 'index.html', data: '<h1>Hello</h1>' }],
        }),
      })
      const created = await createRes.json()

      const client = new VercelApiClient(createConfig(), process.env.EMULATE_VERCEL_URL)
      await client.assignAlias(created.id, 'my-alias.example.com')
    })
  })

  describe('deploy', () => {
    it('should throw not-implemented error', async () => {
      const client = new VercelApiClient(createConfig(), process.env.EMULATE_VERCEL_URL)

      await expect(
        client.deploy(createConfig(), {
          ref: 'main',
          sha: 'abc',
          commit: 'test',
          commitOrg: 'org',
          commitRepo: 'repo',
        }),
      ).rejects.toThrow('not yet implemented')
    })
  })
})
