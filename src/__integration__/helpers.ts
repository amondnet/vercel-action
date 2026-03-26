import * as github from '@actions/github'
import { Vercel } from '@vercel/sdk'

export const VERCEL_TOKEN = 'test-token'
export const GITHUB_TOKEN = 'test-token'

export const TEST_OWNER = 'test-user'
export const TEST_REPO = 'test-repo'
export const TEST_TEAM = 'test-team'
export const TEST_PROJECT = 'test-project'

export function createVercelClient(): Vercel {
  return new Vercel({
    bearerToken: VERCEL_TOKEN,
    serverURL: process.env.EMULATE_VERCEL_URL,
  })
}

export function createOctokitClient() {
  return github.getOctokit(GITHUB_TOKEN, {
    baseUrl: process.env.EMULATE_GITHUB_URL,
  })
}

export type TestOctokit = ReturnType<typeof createOctokitClient>
