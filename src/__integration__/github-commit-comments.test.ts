import { beforeAll, describe, expect, it } from 'vitest'
import { createOctokitClient, TEST_OWNER, TEST_REPO } from './helpers'

describe('github commit comment API', () => {
  let commitSha: string

  beforeAll(async () => {
    const octokit = createOctokitClient()

    const { data: blob } = await octokit.rest.git.createBlob({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      content: 'Hello World',
      encoding: 'utf-8',
    })

    const { data: tree } = await octokit.rest.git.createTree({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }],
    })

    const { data: commit } = await octokit.rest.git.createCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      message: 'test commit for integration tests',
      tree: tree.sha,
      parents: [],
    })

    commitSha = commit.sha
  })

  it('should create a comment on a commit', async () => {
    const octokit = createOctokitClient()

    const { data: comment } = await octokit.rest.repos.createCommitComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      body: '✅ Preview: https://test-deploy.vercel.app',
    })

    expect(comment.id).toBeDefined()
    expect(comment.body).toBe('✅ Preview: https://test-deploy.vercel.app')
  })

  it('should list comments for a commit', async () => {
    const octokit = createOctokitClient()

    await octokit.rest.repos.createCommitComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      body: '✅ Commit comment for listing',
    })

    const { data: comments } = await octokit.rest.repos.listCommentsForCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      per_page: 100,
    })

    expect(comments.length).toBeGreaterThan(0)

    const found = comments.find(c => c.body?.includes('Commit comment for listing'))
    expect(found).toBeDefined()
  })

  it('should update a commit comment', async () => {
    const octokit = createOctokitClient()

    const { data: created } = await octokit.rest.repos.createCommitComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      body: '✅ Preview: https://old-deploy.vercel.app',
    })

    const { data: updated } = await octokit.rest.repos.updateCommitComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      comment_id: created.id,
      body: '✅ Preview: https://new-deploy.vercel.app',
    })

    expect(updated.id).toBe(created.id)
    expect(updated.body).toBe('✅ Preview: https://new-deploy.vercel.app')
  })

  it('should find a previous commit comment by prefix (action pattern)', async () => {
    const octokit = createOctokitClient()
    const prefix = '**test-project**'

    await octokit.rest.repos.createCommitComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      body: `${prefix}\n✅ Preview: https://deploy-1.vercel.app`,
    })

    const { data: comments } = await octokit.rest.repos.listCommentsForCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      commit_sha: commitSha,
      per_page: 100,
    })

    const previousComment = comments.find(c => c.body?.startsWith(prefix))
    expect(previousComment).toBeDefined()
    expect(previousComment!.body).toContain('deploy-1.vercel.app')
  })
})
