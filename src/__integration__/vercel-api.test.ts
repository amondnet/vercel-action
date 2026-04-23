import type { ActionConfig } from '../types'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { VercelApiClient } from '../vercel-api'
import { TEST_PROJECT, TEST_TEAM, VERCEL_TOKEN, vercelFetch } from './helpers'

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: '',
    githubComment: false,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory: '',
    vercelToken: VERCEL_TOKEN,
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: '',
    vercelProjectName: '',
    vercelBin: '',
    aliasDomains: [],
    vercelScope: TEST_TEAM,
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

let aliasSupported = true
let teamUid = ''

describe('vercelApiClient (integration)', () => {
  beforeAll(async () => {
    // Resolve the team uid from the emulator via GET /v2/teams/:slug
    // This mirrors real usage where vercel-org-id comes from .vercel/project.json orgId
    const teamRes = await vercelFetch(`/v2/teams/${TEST_TEAM}`)
    if (!teamRes.ok) {
      throw new Error(`Failed to resolve team "${TEST_TEAM}": ${teamRes.status} ${teamRes.statusText}`)
    }
    const data = await teamRes.json()
    teamUid = data.team?.id
    if (!teamUid) {
      throw new Error(`Team "${TEST_TEAM}" resolved but has no id`)
    }

    // Probe whether the alias endpoint is available in this emulator version
    const probeRes = await vercelFetch(`/v2/deployments/probe-alias-support/aliases`, {
      method: 'POST',
      body: JSON.stringify({ alias: 'probe.example.com' }),
    })
    if (probeRes.status === 404) {
      aliasSupported = false
    }
  })

  function createTeamConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
    return createConfig({ vercelOrgId: teamUid, ...overrides })
  }

  describe('inspect', () => {
    it('should return project name from a deployment', async () => {
      const createRes = await vercelFetch(`/v13/deployments?teamId=${teamUid}`, {
        method: 'POST',
        body: JSON.stringify({
          name: TEST_PROJECT,
          target: 'preview',
          files: [{ file: 'index.html', data: '<h1>Hello</h1>' }],
        }),
      })
      const created = await createRes.json()

      const client = new VercelApiClient(createTeamConfig(), process.env.EMULATE_VERCEL_URL)
      const result = await client.inspect(created.id)

      expect(result.name).toBe(TEST_PROJECT)
    })

    it('should return null name for non-existent deployment', async () => {
      const client = new VercelApiClient(createTeamConfig(), process.env.EMULATE_VERCEL_URL)
      const result = await client.inspect('non-existent-id')

      expect(result.name).toBeNull()
    })
  })

  describe('assignAlias', () => {
    it('should assign an alias to a deployment', async () => {
      if (!aliasSupported) {
        return
      }

      const createRes = await vercelFetch(`/v13/deployments?teamId=${teamUid}`, {
        method: 'POST',
        body: JSON.stringify({
          name: TEST_PROJECT,
          target: 'preview',
          files: [{ file: 'index.html', data: '<h1>Hello</h1>' }],
        }),
      })
      const created = await createRes.json()

      const client = new VercelApiClient(createTeamConfig(), process.env.EMULATE_VERCEL_URL)
      await client.assignAlias(created.id, 'my-alias.example.com')
    })
  })

  describe('deploy', () => {
    it('should have deploy method implemented', () => {
      const client = new VercelApiClient(createTeamConfig(), process.env.EMULATE_VERCEL_URL)
      expect(typeof client.deploy).toBe('function')
    })

    describe('with vercel.json buildCommand', () => {
      let projectDir: string

      beforeEach(() => {
        projectDir = mkdtempSync(path.join(tmpdir(), 'vercel-action-int-'))
        writeFileSync(
          path.join(projectDir, 'vercel.json'),
          JSON.stringify({ buildCommand: './build.sh' }),
        )
        const buildScript = path.join(projectDir, 'build.sh')
        writeFileSync(buildScript, '#!/bin/sh\necho "building"\n')
        chmodSync(buildScript, 0o755)
        // Minimal content so the file manifest is not empty
        writeFileSync(path.join(projectDir, 'index.html'), '<h1>Hello</h1>')
      })

      afterEach(() => {
        rmSync(projectDir, { recursive: true, force: true })
      })

      it('does not crash when reading vercel.json from workingDirectory', async () => {
        // Regression guard for #336: the filesystem read path must not throw
        // against a realistic tmp project layout. The deploy itself may fail
        // at file upload time against the emulator (known limitation), which
        // is tolerated below — what matters is that the code reached upload.
        expect.hasAssertions()

        const client = new VercelApiClient(
          createTeamConfig({ workingDirectory: projectDir }),
          process.env.EMULATE_VERCEL_URL,
        )

        try {
          const url = await client.deploy(
            createTeamConfig({ workingDirectory: projectDir }),
            {
              ref: 'main',
              sha: 'abc',
              commit: 'test',
              commitOrg: 'org',
              commitRepo: 'repo',
            },
          )
          expect(url).toBeTruthy()
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          // Any regression would surface as a vercel.json parsing/resolution error.
          expect(message).not.toMatch(/vercel\.json/)
          // Known emulator limitations — not real failures.
          const emulatorErrors = [
            'fetch',
            'ECONNREFUSED',
            'network',
            'socket',
            'ERR_INVALID_PROTOCOL',
          ]
          const isEmulatorError = emulatorErrors.some(e => message.includes(e))
          if (!isEmulatorError) {
            throw error
          }
        }
      })
    })

    describe('with malformed vercel.json', () => {
      let projectDir: string

      beforeEach(() => {
        projectDir = mkdtempSync(path.join(tmpdir(), 'vercel-action-int-'))
        writeFileSync(path.join(projectDir, 'vercel.json'), '{not valid json')
      })

      afterEach(() => {
        rmSync(projectDir, { recursive: true, force: true })
      })

      it('fails fast with a message naming the file', async () => {
        const client = new VercelApiClient(
          createTeamConfig({ workingDirectory: projectDir }),
          process.env.EMULATE_VERCEL_URL,
        )

        await expect(client.deploy(
          createTeamConfig({ workingDirectory: projectDir }),
          { ref: 'main', sha: 'abc', commit: 'test', commitOrg: 'org', commitRepo: 'repo' },
        )).rejects.toThrow(/vercel\.json/)
      })
    })

    it('should attempt deployment via @vercel/client (may fail against emulator)', async () => {
      // @vercel/client createDeployment uses its own HTTP client to upload files,
      // which may not be compatible with the emulator. This test verifies that
      // deploy() no longer throws "not yet implemented" and instead attempts
      // a real deployment.
      expect.hasAssertions()

      const client = new VercelApiClient(createTeamConfig(), process.env.EMULATE_VERCEL_URL)

      try {
        const url = await client.deploy(createTeamConfig(), {
          ref: 'main',
          sha: 'abc',
          commit: 'test',
          commitOrg: 'org',
          commitRepo: 'repo',
        })
        expect(url).toBeTruthy()
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Should NOT be "not yet implemented" anymore
        expect(message).not.toContain('not yet implemented')
        // Known emulator limitations — not real failures
        const emulatorErrors = [
          'fetch',
          'ECONNREFUSED',
          'network',
          'socket',
          'ERR_INVALID_PROTOCOL', // agent/protocol mismatch in emulator
        ]
        const isEmulatorError = emulatorErrors.some(e => message.includes(e))
        if (!isEmulatorError) {
          throw error
        }
      }
    })
  })
})
