import type * as github from '@actions/github';
export type OctokitClient = ReturnType<typeof github.getOctokit>;
export interface PullRequestPayload {
    pull_request?: {
        head: {
            ref: string;
            sha: string;
            repo?: {
                owner: {
                    login: string;
                };
                name: string;
            };
        };
    };
}
export interface ReleasePayload {
    release?: {
        tag_name: string;
    };
}
export interface CommentData {
    id: number;
    body?: string;
}
export interface DeploymentContext {
    ref: string;
    sha: string;
    commit: string;
    commitOrg: string;
    commitRepo: string;
}
export interface GitHubContext {
    eventName: string;
    sha: string;
    repo: {
        owner: string;
        repo: string;
    };
    issueNumber: number;
}
export interface InspectResult {
    name: string | null;
    inspectUrl: string | null;
}
export interface VercelClient {
    deploy: (_config: ActionConfig, _deployContext: DeploymentContext) => Promise<string>;
    inspect: (_deploymentUrl: string) => Promise<InspectResult>;
    assignAlias: (_deploymentUrl: string, _domain: string) => Promise<void>;
}
export interface ActionConfig {
    githubToken: string;
    githubComment: boolean | string;
    githubDeployment: boolean;
    githubDeploymentEnvironment: string;
    workingDirectory: string;
    vercelToken: string;
    vercelArgs: string;
    vercelOrgId: string;
    vercelProjectId: string;
    vercelScope?: string;
    vercelProjectName: string;
    vercelBin: string;
    aliasDomains: string[];
    target: 'production' | 'preview';
    prebuilt: boolean;
    vercelBuild: boolean;
    vercelOutputDir: string;
    force: boolean;
    env: Record<string, string>;
    buildEnv: Record<string, string>;
    regions: string[];
    archive: '' | 'tgz';
    rootDirectory: string;
    autoAssignCustomDomains: boolean;
    customEnvironment: string;
    isPublic: boolean;
    withCache: boolean;
}
export interface GitHubDeploymentResult {
    deploymentId: number;
}
