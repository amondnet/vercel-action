import * as github from '@actions/github'

export const VERCEL_TOKEN = 'test-token'
export const GITHUB_TOKEN = 'test-token'

export const TEST_OWNER = 'test-user'
export const TEST_REPO = 'test-repo'
export const TEST_TEAM = 'test-team'
export const TEST_PROJECT = 'test-project'

export function vercelFetch(path: string, options: RequestInit = {}) {
  const url = `${process.env.EMULATE_VERCEL_URL}${path}`
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export function createOctokitClient() {
  return github.getOctokit(GITHUB_TOKEN, {
    baseUrl: process.env.EMULATE_GITHUB_URL,
  })
}

export type TestOctokit = ReturnType<typeof createOctokitClient>
