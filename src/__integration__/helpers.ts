import { Octokit } from '@octokit/rest'

export const VERCEL_TOKEN = 'test-token'
export const GITHUB_TOKEN = 'test-token'

export const TEST_OWNER = 'test-user'
export const TEST_REPO = 'test-repo'
export const TEST_TEAM = 'test-team'
export const TEST_PROJECT = 'test-project'

export function vercelFetch(path: string, options: RequestInit = {}) {
  const url = new URL(path, process.env.EMULATE_VERCEL_URL).toString()
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export function createOctokitClient(): Octokit {
  return new Octokit({
    auth: GITHUB_TOKEN,
    baseUrl: process.env.EMULATE_GITHUB_URL,
  })
}
