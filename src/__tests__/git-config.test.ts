import type { ActionConfig } from '../types'
import { execFileSync } from 'node:child_process'
import * as core from '@actions/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureGitAuthor } from '../git-config'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
}))

const RANDOM_EMAIL = 'qx7m2k@example.test'
const RANDOM_NAME = 'Yara Quinlan'

function buildConfig(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    vercelArgs: '--prod',
    gitUserEmail: '',
    gitUserName: '',
    ...overrides,
  } as ActionConfig
}

describe('configureGitAuthor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs git config and amend when both inputs and vercel-args are set', () => {
    configureGitAuthor(buildConfig({
      gitUserEmail: RANDOM_EMAIL,
      gitUserName: RANDOM_NAME,
    }))

    expect(execFileSync).toHaveBeenCalledTimes(3)
    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'git',
      ['config', 'user.email', RANDOM_EMAIL],
      expect.any(Object),
    )
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      'git',
      ['config', 'user.name', RANDOM_NAME],
      expect.any(Object),
    )
    expect(execFileSync).toHaveBeenNthCalledWith(
      3,
      'git',
      ['commit', '--amend', '--no-edit', '--reset-author'],
      expect.any(Object),
    )
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('skips silently when vercel-args is empty (API path)', () => {
    configureGitAuthor(buildConfig({
      vercelArgs: '',
      gitUserEmail: RANDOM_EMAIL,
      gitUserName: RANDOM_NAME,
    }))

    expect(execFileSync).not.toHaveBeenCalled()
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('skips and warns when only git-user-email is set', () => {
    configureGitAuthor(buildConfig({ gitUserEmail: RANDOM_EMAIL }))

    expect(execFileSync).not.toHaveBeenCalled()
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('git-user-email and git-user-name must be set together'),
    )
  })

  it('skips and warns when only git-user-name is set', () => {
    configureGitAuthor(buildConfig({ gitUserName: RANDOM_NAME }))

    expect(execFileSync).not.toHaveBeenCalled()
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('git-user-email and git-user-name must be set together'),
    )
  })

  it('skips silently when both inputs are empty', () => {
    configureGitAuthor(buildConfig())

    expect(execFileSync).not.toHaveBeenCalled()
    expect(core.warning).not.toHaveBeenCalled()
  })

  it('throws a descriptive error when git command fails', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('fatal: not a git repository')
    })

    expect(() => configureGitAuthor(buildConfig({
      gitUserEmail: RANDOM_EMAIL,
      gitUserName: RANDOM_NAME,
    }))).toThrow(/Failed to configure git author for Vercel deploy: fatal: not a git repository/)
  })
})
