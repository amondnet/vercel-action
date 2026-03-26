import type { ActionConfig, GitHubContext, OctokitClient } from './types';
export declare function createCommentOnCommit(octokit: OctokitClient, ctx: GitHubContext, config: ActionConfig, deploymentCommit: string, deploymentUrl: string, deploymentName: string): Promise<void>;
export declare function createCommentOnPullRequest(octokit: OctokitClient, ctx: GitHubContext, config: ActionConfig, deploymentCommit: string, deploymentUrl: string, deploymentName: string): Promise<void>;
