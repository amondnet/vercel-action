import type { ActionConfig, GitHubContext } from '../types'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCommentOnPullRequest } from '../github-comments'
import { createOctokitClient, TEST_OWNER, TEST_REPO } from './helpers'

function createConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    githubToken: 'test-token',
    githubComment: true,
    githubDeployment: false,
    githubDeploymentEnvironment: 'preview',
    workingDirectory: '',
    vercelToken: 'v-token',
    deployment: { kind: 'cli', vercelArgs: '' },
    vercelOrgId: '',
    vercelProjectId: '',
    vercelProjectName: '',
    vercelBin: 'vercel@latest',
    aliasDomains: [],
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

describe('createCommentOnPullRequest (integration)', () => {
  let issueNumber: number
  let ctx: GitHubContext

  beforeAll(async () => {
    const octokit = createOctokitClient()
    const { data: issue } = await octokit.rest.issues.create({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      title: 'PR comment integration test',
    })
    issueNumber = issue.number

    ctx = {
      eventName: 'pull_request',
      sha: 'abc123',
      repo: { owner: TEST_OWNER, repo: TEST_REPO },
      issueNumber,
    }
  })

  it('should create a new deployment comment on a PR', async () => {
    const octokit = createOctokitClient()

    await createCommentOnPullRequest(
      octokit as any,
      ctx,
      createConfig(),
      'abc123',
      'https://my-app-abc123.vercel.app',
      'my-app',
    )

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      per_page: 100,
    })

    const found = comments.find(c => c.body?.includes('Deploy preview for _my-app_ ready!'))
    expect(found).toBeDefined()
    expect(found!.body).toContain('https://my-app-abc123.vercel.app')
  })

  it('should update existing comment instead of creating duplicate', async () => {
    const octokit = createOctokitClient()

    // Create an isolated issue so this test does not depend on prior test state
    const { data: isolatedIssue } = await octokit.rest.issues.create({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      title: 'PR comment update test (isolated)',
    })
    const isolatedCtx: GitHubContext = {
      eventName: 'pull_request',
      sha: 'abc123',
      repo: { owner: TEST_OWNER, repo: TEST_REPO },
      issueNumber: isolatedIssue.number,
    }

    // First write — establishes the existing comment
    await createCommentOnPullRequest(
      octokit as any,
      isolatedCtx,
      createConfig(),
      'abc123',
      'https://my-app-abc123.vercel.app',
      'my-app',
    )

    // Second write — should update, not create a duplicate
    await createCommentOnPullRequest(
      octokit as any,
      isolatedCtx,
      createConfig(),
      'def456',
      'https://my-app-def456.vercel.app',
      'my-app',
    )

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: isolatedIssue.number,
      per_page: 100,
    })

    const matchingComments = comments.filter(c =>
      c.body?.startsWith('Deploy preview for _my-app_ ready!'),
    )
    expect(matchingComments).toHaveLength(1)
    expect(matchingComments[0].body).toContain('https://my-app-def456.vercel.app')
    expect(matchingComments[0].body).not.toContain('https://my-app-abc123.vercel.app')
  })

  it('should not create comment when githubComment is false', async () => {
    const octokit = createOctokitClient()

    const { data: beforeComments } = await octokit.rest.issues.listComments({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      per_page: 100,
    })
    const countBefore = beforeComments.length

    await createCommentOnPullRequest(
      octokit as any,
      ctx,
      createConfig({ githubComment: false }),
      'ghi789',
      'https://my-app-ghi789.vercel.app',
      'my-app',
    )

    const { data: afterComments } = await octokit.rest.issues.listComments({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      issue_number: issueNumber,
      per_page: 100,
    })

    expect(afterComments.length).toBe(countBefore)
  })
})
