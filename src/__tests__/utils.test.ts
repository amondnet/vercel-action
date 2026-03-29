import { describe, expect, it, vi } from 'vitest'
import {
  addVercelMetadata,
  buildCommentBody,
  buildCommentPrefix,
  buildHtmlTableComment,
  escapeHtml,
  getGithubCommentInput,
  isPullRequestType,
  joinDeploymentUrls,
  parseArgs,
  parseKeyValueLines,
  retry,
  slugify,
} from '../utils'

// Mock @actions/core
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
}))

describe('isPullRequestType', () => {
  it('returns true for pull_request', () => {
    expect(isPullRequestType('pull_request')).toBe(true)
  })

  it('returns true for pull_request_target', () => {
    expect(isPullRequestType('pull_request_target')).toBe(true)
  })

  it('returns false for push', () => {
    expect(isPullRequestType('push')).toBe(false)
  })

  it('returns false for release', () => {
    expect(isPullRequestType('release')).toBe(false)
  })
})

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('converts underscores to hyphens', () => {
    expect(slugify('hello_world')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('hello@world!')).toBe('helloworld')
  })

  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugify('-hello-world-')).toBe('hello-world')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world')
  })

  it('handles empty strings', () => {
    expect(slugify('')).toBe('')
  })

  it('handles already slugified strings', () => {
    expect(slugify('hello-world')).toBe('hello-world')
  })

  it('handles feature branch names', () => {
    expect(slugify('feature/add-login')).toBe('featureadd-login')
  })

  it('trims whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world')
  })
})

describe('parseArgs', () => {
  it('splits simple arguments', () => {
    expect(parseArgs('--env foo')).toEqual(['--env', 'foo'])
  })

  it('preserves single-quoted strings', () => {
    expect(parseArgs('\'hello world\'')).toEqual(['hello world'])
  })

  it('preserves double-quoted strings', () => {
    expect(parseArgs('"hello world"')).toEqual(['hello world'])
  })

  it('handles nested quotes in single quotes', () => {
    expect(parseArgs(`'foo="bar baz"'`)).toEqual(['foo="bar baz"'])
  })

  it('handles nested quotes in double quotes', () => {
    expect(parseArgs(`"foo='bar baz'"`)).toEqual([`foo='bar baz'`])
  })

  it('handles mixed arguments', () => {
    expect(parseArgs(`--env foo=bar "foo=bar baz" 'foo="bar baz"'`))
      .toEqual(['--env', 'foo=bar', 'foo=bar baz', 'foo="bar baz"'])
  })

  it('handles empty input', () => {
    expect(parseArgs('')).toEqual([])
  })

  it('handles multiple spaces between arguments', () => {
    expect(parseArgs('arg1    arg2')).toEqual(['arg1', 'arg2'])
  })
})

describe('retry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await retry(fn, 3)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')

    const result = await retry(fn, 3)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  }, 10000)

  it('throws after max retries', async () => {
    const error = new Error('persistent failure')
    const fn = vi.fn().mockRejectedValue(error)

    await expect(retry(fn, 2)).rejects.toThrow('persistent failure')
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  }, 15000)
})

describe('addVercelMetadata', () => {
  it('returns metadata args when key not provided', () => {
    expect(addVercelMetadata('githubCommitSha', 'abc123', ['--prod']))
      .toEqual(['-m', 'githubCommitSha=abc123'])
  })

  it('returns empty array when key already exists', () => {
    expect(addVercelMetadata('githubCommitSha', 'abc123', ['githubCommitSha=existing']))
      .toEqual([])
  })

  it('handles numeric values', () => {
    expect(addVercelMetadata('githubDeployment', 1, []))
      .toEqual(['-m', 'githubDeployment=1'])
  })

  it('is case-sensitive for key matching', () => {
    expect(addVercelMetadata('githubCommitSha', 'abc123', ['GITHUBCOMMITSHA=existing']))
      .toEqual(['-m', 'githubCommitSha=abc123'])
  })
})

describe('joinDeploymentUrls', () => {
  it('returns deployment URL when no aliases', () => {
    expect(joinDeploymentUrls('https://example.vercel.app', []))
      .toBe('https://example.vercel.app')
  })

  it('joins deployment URL with aliases', () => {
    const result = joinDeploymentUrls('https://example.vercel.app', ['custom.com', 'alias.com'])
    expect(result).toBe('https://example.vercel.app\nhttps://custom.com\nhttps://alias.com')
  })

  it('adds https protocol to alias domains', () => {
    const result = joinDeploymentUrls('https://example.vercel.app', ['custom.com'])
    expect(result).toContain('https://custom.com')
  })
})

describe('buildCommentPrefix', () => {
  it('builds correct prefix with deployment name', () => {
    expect(buildCommentPrefix('my-app'))
      .toBe('Deploy preview for _my-app_ ready!')
  })
})

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes quotes', () => {
    expect(escapeHtml('\'"')).toBe('&#39;&quot;')
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('https://example.vercel.app')).toBe('https://example.vercel.app')
  })
})

describe('buildHtmlTableComment', () => {
  it('renders HTML table with all fields', () => {
    const result = buildHtmlTableComment('abc123def', 'https://example.vercel.app', 'my-app', [])
    expect(result).toContain('<table>')
    expect(result).toContain('</table>')
    expect(result).toContain('<code>my-app</code>')
    expect(result).toContain('Deploy successful!')
    expect(result).toContain('href=\'https://example.vercel.app\'')
    expect(result).toContain('<code>abc123d</code>')
  })

  it('omits alias rows when no aliases configured', () => {
    const result = buildHtmlTableComment('abc123', 'https://example.vercel.app', 'my-app', [])
    expect(result).not.toContain('Alias')
  })

  it('escapes HTML special characters in all fields', () => {
    const result = buildHtmlTableComment('abc<123', 'https://example.com?x=\'><img>', 'app<xss>', [])
    expect(result).not.toContain('<xss>')
    expect(result).not.toContain('<img>')
    expect(result).toContain('&lt;xss&gt;')
    expect(result).toContain('&#39;&gt;&lt;img&gt;')
  })

  it('includes alias rows when configured', () => {
    const result = buildHtmlTableComment('abc123', 'https://example.vercel.app', 'my-app', ['custom.com', 'alias.com'])
    expect(result).toContain('https://custom.com')
    expect(result).toContain('https://alias.com')
    expect(result).toContain('Alias')
  })

  it('omits inspect row when no inspect URL', () => {
    const result = buildHtmlTableComment('abc123', 'https://example.vercel.app', 'my-app', [])
    expect(result).not.toContain('Inspect')
  })

  it('includes inspect row when URL provided', () => {
    const result = buildHtmlTableComment('abc123', 'https://example.vercel.app', 'my-app', [], 'https://vercel.com/team/project/dpl_123')
    expect(result).toContain('Inspect')
    expect(result).toContain('href=\'https://vercel.com/team/project/dpl_123\'')
    expect(result).toContain('View deployment')
  })
})

describe('buildCommentBody', () => {
  const defaultTemplate = `✅ Preview
{{deploymentUrl}}

Built with commit {{deploymentCommit}}.`

  it('returns undefined when githubComment is false', () => {
    expect(buildCommentBody('abc123', 'https://example.com', 'app', false, [], defaultTemplate))
      .toBeUndefined()
  })

  it('uses custom template when string provided', () => {
    const customTemplate = 'Custom: {{deploymentUrl}}'
    const result = buildCommentBody('abc123', 'https://example.com', 'app', customTemplate, [], defaultTemplate)
    expect(result).toContain('Custom: https://example.com')
  })

  it('uses HTML table when githubComment is true', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'app', true, [], defaultTemplate)
    expect(result).toContain('<table>')
    expect(result).toContain('https://example.com')
    expect(result).toContain('Deploy successful!')
  })

  it('includes all data in HTML table', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'my-app', true, [], defaultTemplate)
    expect(result).toContain('abc123')
    expect(result).toContain('https://example.com')
    expect(result).toContain('my-app')
  })

  it('includes alias domains in HTML table', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'app', true, ['custom.com'], defaultTemplate)
    expect(result).toContain('https://custom.com')
  })

  it('includes prefix with deployment name', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'my-app', true, [], defaultTemplate)
    expect(result).toContain('Deploy preview for _my-app_ ready!')
  })

  it('includes footer branding link', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'my-app', true, [], defaultTemplate)
    expect(result).toContain('Deployed with [vercel-action]')
    expect(result).toContain('github.com/marketplace/actions/vercel-action')
  })

  it('passes inspect URL to HTML table', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'my-app', true, [], defaultTemplate, 'https://vercel.com/inspect')
    expect(result).toContain('Inspect')
    expect(result).toContain('https://vercel.com/inspect')
  })

  it('custom template still uses variable substitution', () => {
    const result = buildCommentBody('abc123', 'https://example.com', 'my-app', '{{deploymentName}}: {{deploymentUrl}}', [], defaultTemplate)
    expect(result).toContain('my-app: https://example.com')
  })
})

describe('getGithubCommentInput', () => {
  it('returns true for "true" string', () => {
    expect(getGithubCommentInput('true')).toBe(true)
  })

  it('returns false for "false" string', () => {
    expect(getGithubCommentInput('false')).toBe(false)
  })

  it('returns custom string for other values', () => {
    expect(getGithubCommentInput('custom template')).toBe('custom template')
  })

  it('returns empty string as-is', () => {
    expect(getGithubCommentInput('')).toBe('')
  })
})

describe('parseKeyValueLines', () => {
  it('parses multiline KEY=VALUE pairs', () => {
    expect(parseKeyValueLines('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('returns empty object for empty input', () => {
    expect(parseKeyValueLines('')).toEqual({})
  })

  it('skips blank lines', () => {
    expect(parseKeyValueLines('A=1\n\nB=2\n')).toEqual({ A: '1', B: '2' })
  })

  it('skips lines without equals sign', () => {
    expect(parseKeyValueLines('A=1\ninvalid\nB=2')).toEqual({ A: '1', B: '2' })
  })

  it('handles values containing equals signs', () => {
    expect(parseKeyValueLines('URL=https://example.com?a=1&b=2')).toEqual({
      URL: 'https://example.com?a=1&b=2',
    })
  })

  it('trims whitespace from keys and values', () => {
    expect(parseKeyValueLines('  KEY  =  value  ')).toEqual({ KEY: 'value' })
  })

  it('handles empty values', () => {
    expect(parseKeyValueLines('KEY=')).toEqual({ KEY: '' })
  })

  it('ignores lines with empty keys', () => {
    expect(parseKeyValueLines('=value')).toEqual({})
  })
})
