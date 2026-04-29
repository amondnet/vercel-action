import type { ActionConfig, GitHubContext, OctokitClient } from './types';
export declare function createCommentOnCommit(octokit: OctokitClient, ctx: GitHubContext, config: ActionConfig, deploymentCommit: string, deploymentUrl: string, deploymentName: string, inspectUrl?: string | null): Promise<void>;
export declare function createBuildFailureCommentOnPullRequest(octokit: OctokitClient, ctx: GitHubContext, sha: string, exitCode: number, stderrTail: string): Promise<void>;
export declare function createBuildFailureCommentOnCommit(octokit: OctokitClient, ctx: GitHubContext, sha: string, exitCode: number, stderrTail: string): Promise<void>;
export declare function createCommentOnPullRequest(octokit: OctokitClient, ctx: GitHubContext, config: ActionConfig, deploymentCommit: string, deploymentUrl: string, deploymentName: string, inspectUrl?: string | null): Promise<void>;
