import * as core from '@actions/core'

const RETRY_DELAY_MS = 3000

/**
 * Checks if the event name is a pull request type
 */
export function isPullRequestType(event: string): boolean {
  return event.startsWith('pull_request')
}

/**
 * Converts a string to a URL-safe slug
 */
export function slugify(str: string): string {
  const slug = str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  core.debug(`before slugify: "${str}"; after slugify: "${slug}"`)
  return slug
}

/**
 * Parses a string of arguments, preserving quoted strings
 *
 * @example
 * parseArgs(`--env foo=bar "foo=bar baz" 'foo="bar baz"'`)
 * // => ['--env', 'foo=bar', 'foo=bar baz', 'foo="bar baz"']
 */
export function parseArgs(s: string): string[] {
  const args: string[] = []

  for (const match of s.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)) {
    args.push((match[1] ?? match[2] ?? match[3])!)
  }
  return args
}

/**
 * Generic retry wrapper with exponential backoff
 */
export async function retry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  async function attempt(retryCount: number): Promise<T> {
    try {
      return await fn()
    }
    catch (error) {
      if (retryCount > retries) {
        throw error
      }
      else {
        const delay = RETRY_DELAY_MS * (2 ** (retryCount - 1))
        core.info(`retrying: attempt ${retryCount + 1} / ${retries + 1} in ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
        return attempt(retryCount + 1)
      }
    }
  }
  return attempt(1)
}

/**
 * Adds Vercel metadata arguments if not already provided by user
 */
export function addVercelMetadata(key: string, value: string | number, providedArgs: string[]): string[] {
  const pattern = `^${key}=.+`
  const metadataRegex = new RegExp(pattern, 'g')

  for (const arg of providedArgs) {
    if (arg.match(metadataRegex)) {
      return []
    }
  }

  return ['-m', `${key}=${value}`]
}

/**
 * Joins deployment URL with alias domains
 */
export function joinDeploymentUrls(deploymentUrl: string, aliasDomains: string[]): string {
  if (aliasDomains.length) {
    const aliasUrls = aliasDomains.map(domain => `https://${domain}`)
    return [deploymentUrl, ...aliasUrls].join('\n')
  }
  return deploymentUrl
}

/**
 * Builds the comment prefix for deployment notifications
 */
export function buildCommentPrefix(deploymentName: string): string {
  return `Deploy preview for _${deploymentName}_ ready!`
}

/**
 * Escapes HTML special characters to prevent XSS in generated comments
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds an HTML table comment for deployment notifications
 */
export function buildHtmlTableComment(
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
  aliasDomains: string[],
  inspectUrl: string | null = null,
): string {
  const rows: string[] = []
  const safeName = escapeHtml(deploymentName)
  const safeUrl = escapeHtml(deploymentUrl)
  const safeCommit = escapeHtml(deploymentCommit.substring(0, 7))

  rows.push(`<tr><td><strong>Project:</strong></td><td><code>${safeName}</code></td></tr>`)
  rows.push(`<tr><td><strong>Status:</strong></td><td>&nbsp;✅&nbsp; Deploy successful!</td></tr>`)
  rows.push(`<tr><td><strong>Preview URL:</strong></td><td><a href='${safeUrl}'>${safeUrl}</a></td></tr>`)
  rows.push(`<tr><td><strong>Latest Commit:</strong></td><td><code>${safeCommit}</code></td></tr>`)

  for (const domain of aliasDomains) {
    const safeAlias = escapeHtml(`https://${domain}`)
    rows.push(`<tr><td><strong>Alias:</strong></td><td><a href='${safeAlias}'>${safeAlias}</a></td></tr>`)
  }

  if (inspectUrl) {
    const safeInspect = escapeHtml(inspectUrl)
    rows.push(`<tr><td><strong>Inspect:</strong></td><td><a href='${safeInspect}'>View deployment</a></td></tr>`)
  }

  return `<table>\n${rows.join('\n')}\n</table>`
}

/**
 * Builds the GitHub comment body for deployment notifications
 */
export function buildCommentBody(
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
  githubComment: boolean | string,
  aliasDomains: string[],
  _defaultTemplate: string,
  inspectUrl: string | null = null,
): string | undefined {
  if (!githubComment) {
    return undefined
  }
  const prefix = `${buildCommentPrefix(deploymentName)}\n\n`

  if (typeof githubComment === 'string') {
    const rawGithubComment = prefix + githubComment
    return rawGithubComment
      .replace(/\{\{deploymentCommit\}\}/g, deploymentCommit)
      .replace(/\{\{deploymentName\}\}/g, deploymentName)
      .replace(
        /\{\{deploymentUrl\}\}/g,
        joinDeploymentUrls(deploymentUrl, aliasDomains),
      )
  }

  const htmlTable = buildHtmlTableComment(
    deploymentCommit,
    deploymentUrl,
    deploymentName,
    aliasDomains,
    inspectUrl,
  )

  const footer = '\n\nDeployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)'

  return prefix + htmlTable + footer
}

/**
 * Parses the github-comment input value
 */
export function getGithubCommentInput(input: string): boolean | string {
  if (input === 'true')
    return true
  if (input === 'false')
    return false
  return input
}
