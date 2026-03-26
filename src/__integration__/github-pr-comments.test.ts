import { beforeAll, describe, expect, it } from 'vitest'
import { createOctokitClient, TEST_OWNER, TEST_REPO } from './helpers'

describe('github PR comment API', () => {
  let issueNumber: number

  beforeAll(async () => {
    const octokit = createOctokitClient()
    const { data: issue } = await octokit.rest.issues.create({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      title: 'Test PR for integration tests',
      body: 'This issue simulates a PR for comment testing.',
    })
    issueNumber = issue.number
  })

  it('should create a comment on an issue/PR', async () => {
    const octokit = createOctokitClient()

    const { data: comment } = await octokit.rest.issues.createComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      body: '✅ Preview: https://test-deploy.vercel.app',
    })

    expect(comment.id).toBeDefined()
    expect(comment.body).toBe('✅ Preview: https://test-deploy.vercel.app')
  })

  it('should list comments on an issue/PR', async () => {
    const octokit = createOctokitClient()

    await octokit.rest.issues.createComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      body: '✅ Preview comment for listing',
    })

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      per_page: 100,
    })

    expect(comments.length).toBeGreaterThan(0)

    const found = comments.find(c => c.body?.includes('Preview comment for listing'))
    expect(found).toBeDefined()
  })

  it('should update an existing comment', async () => {
    const octokit = createOctokitClient()

    const { data: created } = await octokit.rest.issues.createComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      body: '✅ Preview: https://old-deploy.vercel.app',
    })

    const { data: updated } = await octokit.rest.issues.updateComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      comment_id: created.id,
      body: '✅ Preview: https://new-deploy.vercel.app',
    })

    expect(updated.id).toBe(created.id)
    expect(updated.body).toBe('✅ Preview: https://new-deploy.vercel.app')
  })

  it('should find a previous comment by prefix (action pattern)', async () => {
    const octokit = createOctokitClient()
    const prefix = '**test-project**'

    await octokit.rest.issues.createComment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      body: `${prefix}\n✅ Preview: https://deploy-1.vercel.app`,
    })

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      per_page: 100,
    })

    const previousComment = comments.find(c => c.body?.startsWith(prefix))
    expect(previousComment).toBeDefined()
    expect(previousComment!.body).toContain('deploy-1.vercel.app')
  })
})
