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
        core.info(`retrying: attempt ${retryCount + 1} / ${retries + 1}`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
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
 * Builds the GitHub comment body for deployment notifications
 */
export function buildCommentBody(
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
  githubComment: boolean | string,
  aliasDomains: string[],
  defaultTemplate: string,
): string | undefined {
  if (!githubComment) {
    return undefined
  }
  const prefix = `${buildCommentPrefix(deploymentName)}\n\n`

  const rawGithubComment
    = prefix
      + (typeof githubComment === 'string'
        ? githubComment
        : defaultTemplate)

  return rawGithubComment
    .replace(/\{\{deploymentCommit\}\}/g, deploymentCommit)
    .replace(/\{\{deploymentName\}\}/g, deploymentName)
    .replace(
      /\{\{deploymentUrl\}\}/g,
      joinDeploymentUrls(deploymentUrl, aliasDomains),
    )
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
