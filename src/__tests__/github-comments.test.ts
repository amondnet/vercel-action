import type { GitHubContext } from '../types'
import * as core from '@actions/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBuildFailureCommentOnCommit,
  createBuildFailureCommentOnPullRequest,
  createCommentOnCommit,
  createCommentOnPullRequest,
} from '../github-comments'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
}))

const mockListCommentsForCommit = vi.fn()
const mockCreateCommitComment = vi.fn()
const mockUpdateCommitComment = vi.fn()
const mockListComments = vi.fn()
const mockCreateComment = vi.fn()
const mockUpdateComment = vi.fn()

function createMockOctokit() {
  return {
    rest: {
      repos: {
        listCommentsForCommit: mockListCommentsForCommit,
        createCommitComment: mockCreateCommitComment,
        updateCommitComment: mockUpdateCommitComment,
      },
      issues: {
        listComments: mockListComments,
        createComment: mockCreateComment,
        updateComment: mockUpdateComment,
      },
    },
  } as any
}

function createContext(overrides: Partial<GitHubContext> = {}): GitHubContext {
  return {
    eventName: 'push',
    sha: 'abc123',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    issueNumber: 42,
    ...overrides,
  }
}

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    githubToken: 'test-token',
    githubComment: true as boolean | string,
    workingDirectory: '',
    vercelToken: 'v-token',
    deployment: { kind: 'cli', vercelArgs: '' },
    vercelOrgId: '',
    vercelProjectId: '',
    vercelScope: '',
    vercelProjectName: '',
    vercelBin: 'vercel@latest',
    aliasDomains: [] as string[],
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

describe('createCommentOnCommit', () => {
  const ctx = createContext({ eventName: 'push' })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new comment when no previous comment exists', async () => {
    mockListCommentsForCommit.mockResolvedValue({ data: [] })
    mockCreateCommitComment.mockResolvedValue({})

    await createCommentOnCommit(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(mockCreateCommitComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateCommitComment).not.toHaveBeenCalled()
    const body = mockCreateCommitComment.mock.calls[0][0].body
    expect(body).toContain('Deploy preview for _my-app_ ready!')
    expect(body).toContain('<table>')
    expect(body).toContain('https://deploy.vercel.app')
  })

  it('updates existing comment when previous comment found', async () => {
    mockListCommentsForCommit.mockResolvedValue({
      data: [
        { id: 99, body: 'Deploy preview for _my-app_ ready!\n\nold content' },
      ],
    })
    mockUpdateCommitComment.mockResolvedValue({})

    await createCommentOnCommit(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(mockUpdateCommitComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateCommitComment.mock.calls[0][0].comment_id).toBe(99)
    expect(mockCreateCommitComment).not.toHaveBeenCalled()
  })

  it('skips comment when githubComment is false', async () => {
    mockListCommentsForCommit.mockResolvedValue({ data: [] })

    await createCommentOnCommit(
      createMockOctokit(),
      ctx,
      createConfig({ githubComment: false }),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(mockListCommentsForCommit).toHaveBeenCalled()
    expect(mockCreateCommitComment).not.toHaveBeenCalled()
    expect(mockUpdateCommitComment).not.toHaveBeenCalled()
  })

  it('catches and warns on API errors from findPreviousComment', async () => {
    mockListCommentsForCommit.mockRejectedValue(new Error('API rate limit'))

    await createCommentOnCommit(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('API rate limit'),
    )
  })

  it('catches and warns on create comment errors', async () => {
    mockListCommentsForCommit.mockResolvedValue({ data: [] })
    mockCreateCommitComment.mockRejectedValue(new Error('403 Forbidden'))

    await createCommentOnCommit(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('403 Forbidden'),
    )
  })

  it('uses custom template when string provided', async () => {
    mockListCommentsForCommit.mockResolvedValue({ data: [] })
    mockCreateCommitComment.mockResolvedValue({})

    await createCommentOnCommit(
      createMockOctokit(),
      ctx,
      createConfig({ githubComment: 'Custom: {{deploymentUrl}}' }),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    const body = mockCreateCommitComment.mock.calls[0][0].body
    expect(body).toContain('Custom: https://deploy.vercel.app')
  })
})

describe('createCommentOnPullRequest', () => {
  const ctx = createContext({ eventName: 'pull_request' })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new PR comment when no previous comment exists', async () => {
    mockListComments.mockResolvedValue({ data: [] })
    mockCreateComment.mockResolvedValue({})

    await createCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(mockCreateComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateComment).not.toHaveBeenCalled()
    expect(mockCreateComment.mock.calls[0][0].issue_number).toBe(42)
  })

  it('updates existing PR comment when previous comment found', async () => {
    mockListComments.mockResolvedValue({
      data: [
        { id: 77, body: 'Deploy preview for _my-app_ ready!\n\nold' },
      ],
    })
    mockUpdateComment.mockResolvedValue({})

    await createCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(mockUpdateComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateComment.mock.calls[0][0].comment_id).toBe(77)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('catches and warns on findPreviousComment API errors', async () => {
    mockListComments.mockRejectedValue(new Error('network error'))

    await createCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('network error'),
    )
  })

  it('catches and warns on update comment errors', async () => {
    mockListComments.mockResolvedValue({
      data: [{ id: 77, body: 'Deploy preview for _my-app_ ready!' }],
    })
    mockUpdateComment.mockRejectedValue(new Error('422 Unprocessable'))

    await createCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('422 Unprocessable'),
    )
  })

  it('warns for unsupported event types', async () => {
    const unsupportedCtx = createContext({ eventName: 'workflow_dispatch' })

    mockCreateComment.mockResolvedValue({})

    await createCommentOnPullRequest(
      createMockOctokit(),
      unsupportedCtx,
      createConfig(),
      'abc123',
      'https://deploy.vercel.app',
      'my-app',
    )

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('not supported'),
    )
  })
})

describe('createBuildFailureCommentOnPullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts a PR comment with the build failure details', async () => {
    const ctx = createContext({ eventName: 'pull_request' })
    mockCreateComment.mockResolvedValue({})

    await createBuildFailureCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      'abc123',
      137,
      'fatal: cannot find module foo',
    )

    expect(mockCreateComment).toHaveBeenCalledOnce()
    const body = mockCreateComment.mock.calls[0][0].body as string
    expect(body).toContain('Vercel build failed')
    expect(body).toContain('exit code 137')
    expect(body).toContain('abc123')
    expect(body).toContain('fatal: cannot find module foo')
  })

  it('wraps stderr tail in a fenced code block', async () => {
    const ctx = createContext({ eventName: 'pull_request' })
    mockCreateComment.mockResolvedValue({})

    await createBuildFailureCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      'abc',
      1,
      'multi\nline\noutput',
    )

    const body = mockCreateComment.mock.calls[0][0].body as string
    expect(body).toMatch(/```[\s\S]*multi\nline\noutput[\s\S]*```/)
  })

  it('escapes triple-backticks in stderr tail to prevent fence breakout', async () => {
    const ctx = createContext({ eventName: 'pull_request' })
    mockCreateComment.mockResolvedValue({})

    await createBuildFailureCommentOnPullRequest(
      createMockOctokit(),
      ctx,
      'abc',
      1,
      'before\n```\n# Injected Heading\n[link](https://evil.example)\n```\nafter',
    )

    const body = mockCreateComment.mock.calls[0][0].body as string
    // The injected raw triple-backticks must be escaped (e.g. \`\`\`) so the
    // surrounding fence stays open and the markdown does not render.
    expect(body).not.toMatch(/^```\n# Injected Heading$/m)
    expect(body).toContain('\\`\\`\\`')
  })

  it('warns and does not throw when the API call fails', async () => {
    const ctx = createContext({ eventName: 'pull_request' })
    mockCreateComment.mockRejectedValue(new Error('forbidden'))

    await expect(
      createBuildFailureCommentOnPullRequest(
        createMockOctokit(),
        ctx,
        'abc',
        1,
        'tail',
      ),
    ).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('build failure comment'),
    )
  })
})

describe('createBuildFailureCommentOnCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts a commit comment with the build failure details', async () => {
    const ctx = createContext({ eventName: 'push' })
    mockCreateCommitComment.mockResolvedValue({})

    await createBuildFailureCommentOnCommit(
      createMockOctokit(),
      ctx,
      'abc123',
      2,
      'tail',
    )

    expect(mockCreateCommitComment).toHaveBeenCalledOnce()
    const body = mockCreateCommitComment.mock.calls[0][0].body as string
    expect(body).toContain('Vercel build failed')
    expect(body).toContain('exit code 2')
    expect(body).toContain('tail')
  })

  it('warns and does not throw when the API call fails', async () => {
    const ctx = createContext({ eventName: 'push' })
    mockCreateCommitComment.mockRejectedValue(new Error('forbidden'))

    await expect(
      createBuildFailureCommentOnCommit(
        createMockOctokit(),
        ctx,
        'abc',
        1,
        'tail',
      ),
    ).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('build failure comment'),
    )
  })
})
