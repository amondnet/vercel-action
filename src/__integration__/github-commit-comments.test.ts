import type { ActionConfig, GitHubContext } from '../types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCommentOnCommit } from '../github-comments'
import { createOctokitClient, TEST_OWNER, TEST_REPO } from './helpers'

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: 'test-token',
    githubComment: true,
    workingDirectory: '',
    vercelToken: 'v-token',
    vercelArgs: '',
    vercelOrgId: '',
    vercelProjectId: '',
    vercelProjectName: '',
    vercelBin: 'vercel@latest',
    aliasDomains: [],
    ...overrides,
  }
}

describe('createCommentOnCommit (integration)', () => {
  let commitSha: string
  let ctx: GitHubContext

  beforeAll(async () => {
    const octokit = createOctokitClient()

    const { data: blob } = await octokit.rest.git.createBlob({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      content: 'commit comment test',
      encoding: 'utf-8',
    })

    const { data: tree } = await octokit.rest.git.createTree({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      tree: [{ path: 'test.txt', mode: '100644', type: 'blob', sha: blob.sha }],
    })

    const { data: commit } = await octokit.rest.git.createCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      message: 'test commit',
      tree: tree.sha,
      parents: [],
    })

    commitSha = commit.sha

    ctx = {
      eventName: 'push',
      sha: commitSha,
      repo: { owner: TEST_OWNER, repo: TEST_REPO },
      issueNumber: 0,
    }
  })

  it('should create a new deployment comment on a commit', async () => {
    const octokit = createOctokitClient()

    await createCommentOnCommit(
      octokit as any,
      ctx,
      createConfig(),
      commitSha,
      'https://my-app-abc123.vercel.app',
      'my-app',
    )

    const { data: comments } = await octokit.rest.repos.listCommentsForCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      per_page: 100,
    })

    const found = comments.find(c => c.body?.includes('Deploy preview for _my-app_ ready!'))
    expect(found).toBeDefined()
    expect(found!.body).toContain('https://my-app-abc123.vercel.app')
  })

  it('should update existing comment instead of creating duplicate', async () => {
    const octokit = createOctokitClient()

    await createCommentOnCommit(
      octokit as any,
      ctx,
      createConfig(),
      commitSha,
      'https://my-app-def456.vercel.app',
      'my-app',
    )

    const { data: comments } = await octokit.rest.repos.listCommentsForCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      per_page: 100,
    })

    const matchingComments = comments.filter(c =>
      c.body?.startsWith('Deploy preview for _my-app_ ready!'),
    )
    expect(matchingComments).toHaveLength(1)
    expect(matchingComments[0].body).toContain('https://my-app-def456.vercel.app')
  })
})
