import type { DeploymentContext, GitHubContext, GitHubDeploymentResult, OctokitClient } from './types';
export interface DeploymentStatusOptions {
    environmentUrl?: string;
    logUrl?: string;
    description?: string;
}
export declare function createGitHubDeployment(octokit: OctokitClient | undefined, ctx: GitHubContext, deploymentContext: DeploymentContext, environment: string): Promise<GitHubDeploymentResult | null>;
export declare function updateGitHubDeploymentStatus(octokit: OctokitClient | undefined, ctx: GitHubContext, deploymentId: number, state: 'success' | 'failure' | 'error' | 'inactive', options: DeploymentStatusOptions): Promise<void>;
