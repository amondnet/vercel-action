import type { ActionConfig, OctokitClient } from './types';
export declare function createCommentOnCommit(octokit: OctokitClient, config: ActionConfig, deploymentCommit: string, deploymentUrl: string, deploymentName: string): Promise<void>;
export declare function createCommentOnPullRequest(octokit: OctokitClient, config: ActionConfig, deploymentCommit: string, deploymentUrl: string, deploymentName: string): Promise<void>;
