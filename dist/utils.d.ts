/**
 * Checks if the event name is a pull request type
 */
export declare function isPullRequestType(event: string): boolean;
/**
 * Converts a string to a URL-safe slug
 */
export declare function slugify(str: string): string;
/**
 * Parses a string of arguments, preserving quoted strings
 *
 * @example
 * parseArgs(`--env foo=bar "foo=bar baz" 'foo="bar baz"'`)
 * // => ['--env', 'foo=bar', 'foo=bar baz', 'foo="bar baz"']
 */
export declare function parseArgs(s: string): string[];
/**
 * Generic retry wrapper with exponential backoff
 */
export declare function retry<T>(fn: () => Promise<T>, retries: number): Promise<T>;
/**
 * Adds Vercel metadata arguments if not already provided by user
 */
export declare function addVercelMetadata(key: string, value: string | number, providedArgs: string[]): string[];
/**
 * Joins deployment URL with alias domains
 */
export declare function joinDeploymentUrls(deploymentUrl: string, aliasDomains: string[]): string;
/**
 * Builds the comment prefix for deployment notifications
 */
export declare function buildCommentPrefix(deploymentName: string): string;
/**
 * Escapes HTML special characters to prevent XSS in generated comments
 */
export declare function escapeHtml(s: string): string;
/**
 * Builds an HTML table comment for deployment notifications
 */
export declare function buildHtmlTableComment(deploymentCommit: string, deploymentUrl: string, deploymentName: string, aliasDomains: string[], inspectUrl?: string | null): string;
/**
 * Builds the GitHub comment body for deployment notifications
 */
export declare function buildCommentBody(deploymentCommit: string, deploymentUrl: string, deploymentName: string, githubComment: boolean | string, aliasDomains: string[], _defaultTemplate: string, inspectUrl?: string | null): string | undefined;
/**
 * Parses the github-comment input value
 */
export declare function getGithubCommentInput(input: string): boolean | string;
