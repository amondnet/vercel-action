import * as core from '@actions/core'
import * as github from '@actions/github'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock modules
vi.mock('@actions/core')
vi.mock('@actions/exec')
vi.mock('@actions/github')
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('test commit message'),
}))

// Mock package.json
vi.mock('../package.json', () => ({
  dependencies: {
    vercel: '32.0.0',
  },
}))

describe('vercel-action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    // Setup default mocks
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'vercel-token': 'test-token',
        'github-token': 'github-test-token',
        'vercel-org-id': 'test-org',
        'vercel-project-id': 'test-project',
        'vercel-args': '--prod',
        'github-comment': 'true',
        'working-directory': '',
        'scope': '',
        'vercel-project-name': 'test-project',
        'alias-domains': '',
        'vercel-version': '',
      }
      return inputs[name] || ''
    })

    // Mock GitHub context
    vi.mocked(github).context = {
      eventName: 'pull_request',
      sha: 'abc123',
      ref: 'refs/heads/feature-branch',
      workflow: 'test-workflow',
      action: 'test-action',
      actor: 'test-actor',
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      issue: {
        number: 42,
      },
      payload: {
        pull_request: {
          head: {
            ref: 'refs/heads/feature-branch',
            sha: 'abc123',
          },
        },
      },
    } as any
  })

  describe('utility functions', () => {
    describe('getGithubCommentInput', () => {
      it('should return true when input is "true"', async () => {
        vi.mocked(core.getInput).mockReturnValue('true')
        const module = await import('../src/index')
        const result = module.getGithubCommentInput()
        expect(result).toBe(true)
      })

      it('should return false when input is "false"', async () => {
        vi.mocked(core.getInput).mockReturnValue('false')
        const module = await import('../src/index')
        const result = module.getGithubCommentInput()
        expect(result).toBe(false)
      })

      it('should return the string value for custom templates', async () => {
        vi.mocked(core.getInput).mockReturnValue('Custom {{deploymentUrl}}')
        const module = await import('../src/index')
        const result = module.getGithubCommentInput()
        expect(result).toBe('Custom {{deploymentUrl}}')
      })
    })

    describe('isPullRequestType', () => {
      it('should return true for pull_request events', async () => {
        const module = await import('../src/index')
        expect(module.isPullRequestType('pull_request')).toBe(true)
        expect(module.isPullRequestType('pull_request_target')).toBe(true)
        expect(module.isPullRequestType('pull_request_review')).toBe(true)
      })

      it('should return false for non-pull_request events', async () => {
        const module = await import('../src/index')
        expect(module.isPullRequestType('push')).toBe(false)
        expect(module.isPullRequestType('workflow_dispatch')).toBe(false)
      })
    })

    describe('slugify', () => {
      it('should convert string to slug format', async () => {
        const module = await import('../src/index')
        expect(module.slugify('Feature Branch')).toBe('feature-branch')
        expect(module.slugify('test_branch')).toBe('test-branch')
        expect(module.slugify('UPPERCASE')).toBe('uppercase')
        expect(module.slugify('multiple   spaces')).toBe('multiple-spaces')
        expect(module.slugify('special!@#$%chars')).toBe('specialchars')
        expect(module.slugify('--leading-trailing--')).toBe('leading-trailing')
      })
    })

    describe('parseArgs', () => {
      it('should parse simple arguments', async () => {
        const module = await import('../src/index')
        expect(module.parseArgs('--prod --force')).toEqual(['--prod', '--force'])
        expect(module.parseArgs('--env foo=bar')).toEqual(['--env', 'foo=bar'])
      })

      it('should handle quoted arguments', async () => {
        const module = await import('../src/index')
        expect(module.parseArgs('"hello world" --flag')).toEqual(['hello world', '--flag'])
        expect(module.parseArgs('\'single quotes\' --test')).toEqual(['single quotes', '--test'])
      })

      it('should handle nested quotes', async () => {
        const module = await import('../src/index')
        expect(module.parseArgs(`'foo="bar baz"'`)).toEqual(['foo="bar baz"'])
        expect(module.parseArgs(`"foo='bar baz'"`)).toEqual(['foo=\'bar baz\''])
      })
    })

    describe('retry', () => {
      beforeEach(() => {
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('should succeed on first attempt', async () => {
        const module = await import('../src/index')
        const fn = vi.fn().mockResolvedValue('success')
        const result = await module.retry(fn, 3)
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(1)
      })

      it('should retry on failure and eventually succeed', async () => {
        const module = await import('../src/index')
        const fn = vi.fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success')

        const promise = module.retry(fn, 3)

        // Advance through the first retry
        await vi.advanceTimersByTimeAsync(3000)
        // Advance through the second retry
        await vi.advanceTimersByTimeAsync(3000)

        const result = await promise
        expect(result).toBe('success')
        expect(fn).toHaveBeenCalledTimes(3)
      })

      it('should throw after exhausting retries', async () => {
        const module = await import('../src/index')
        const fn = vi.fn().mockRejectedValue(new Error('fail'))

        const promise = module.retry(fn, 2).catch(e => e)

        // Advance through first retry
        await vi.advanceTimersByTimeAsync(3000)
        // Advance through second retry
        await vi.advanceTimersByTimeAsync(3000)

        const result = await promise
        expect(result).toBeInstanceOf(Error)
        expect(result.message).toBe('fail')
        expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
      })
    })
  })

  describe('vercel functions', () => {
    describe('getVercelBin', () => {
      it('should use specified version when provided', async () => {
        vi.mocked(core.getInput).mockImplementation((name: string) => {
          if (name === 'vercel-version')
            return '31.0.0'
          return ''
        })
        const module = await import('../src/index')
        expect(module.getVercelBin()).toBe('vercel@31.0.0')
      })

      it('should use package.json version as fallback', async () => {
        vi.mocked(core.getInput).mockImplementation((name: string) => {
          if (name === 'vercel-version')
            return ''
          return ''
        })
        const module = await import('../src/index')
        expect(module.getVercelBin()).toBe('vercel@32.0.0')
      })
    })

    describe('addVercelMetadata', () => {
      it('should add metadata when not already provided', async () => {
        const module = await import('../src/index')
        const result = module.addVercelMetadata('githubOrg', 'test-org', [])
        expect(result).toEqual(['-m', 'githubOrg=test-org'])
      })

      it('should not add metadata when already in args', async () => {
        const module = await import('../src/index')
        const result = module.addVercelMetadata('githubOrg', 'test-org', ['-m', 'githubOrg=existing'])
        expect(result).toEqual([])
      })
    })
  })

  describe('comment functions', () => {
    describe('joinDeploymentUrls', () => {
      it('should return single URL when no aliases', async () => {
        const module = await import('../src/index')
        const result = module.joinDeploymentUrls('https://test.vercel.app', [])
        expect(result).toBe('https://test.vercel.app')
      })

      it('should join multiple URLs with newlines', async () => {
        const module = await import('../src/index')
        const result = module.joinDeploymentUrls(
          'https://test.vercel.app',
          ['alias1.com', 'alias2.com'],
        )
        expect(result).toBe('https://test.vercel.app\nhttps://alias1.com\nhttps://alias2.com')
      })
    })

    describe('buildCommentPrefix', () => {
      it('should build correct comment prefix', async () => {
        const module = await import('../src/index')
        const result = module.buildCommentPrefix('my-project')
        expect(result).toBe('Deploy preview for _my-project_ ready!')
      })
    })

    describe('buildCommentBody', () => {
      it('should return undefined when githubComment is false', async () => {
        const module = await import('../src/index')
        const result = module.buildCommentBody(
          'abc123',
          'https://test.vercel.app',
          'test-project',
          false,
        )
        expect(result).toBeUndefined()
      })

      it('should use custom template when provided', async () => {
        const module = await import('../src/index')
        const result = module.buildCommentBody(
          'abc123',
          'https://test.vercel.app',
          'test-project',
          'Custom {{deploymentUrl}} for {{deploymentName}}',
          [],
        )
        expect(result).toContain('Custom https://test.vercel.app for test-project')
      })

      it('should use default template when githubComment is true', async () => {
        const module = await import('../src/index')
        const result = module.buildCommentBody(
          'abc123',
          'https://test.vercel.app',
          'test-project',
          true,
          [],
        )
        expect(result).toContain('Deploy preview for _test-project_ ready!')
        expect(result).toContain('https://test.vercel.app')
        expect(result).toContain('abc123')
      })
    })
  })

  describe('environment setup', () => {
    it('should set environment variables when org and project IDs are provided', async () => {
      const module = await import('../src/index')
      await module.setEnv()

      expect(core.exportVariable).toHaveBeenCalledWith('VERCEL_ORG_ID', 'test-org')
      expect(core.exportVariable).toHaveBeenCalledWith('VERCEL_PROJECT_ID', 'test-project')
    })
  })
})
