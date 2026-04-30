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
/**
 * Deployment dispatch shape — one of two mutually exclusive modes.
 *
 * - `cli` (default) carries the raw `vercel-args` passthrough string. The Vercel
 *   CLI is invoked under the hood and stable across releases.
 * - `experimental-api` opts in to the `@vercel/client` programmatic API. There
 *   is no `vercelArgs` field on this variant, which makes the (`experimental-api`,
 *   `vercel-args`) combination unrepresentable at the type level.
 *
 * The action input `experimental-api: true` together with a non-empty
 * `vercel-args` is rejected at config-parse time in `getActionConfig()`.
 */
export type DeploymentMode = {
    kind: 'cli';
    vercelArgs: string;
} | {
    kind: 'experimental-api';
};
export interface ActionConfig {
    githubToken: string;
    githubComment: boolean | string;
    githubDeployment: boolean;
    githubDeploymentEnvironment: string;
    workingDirectory: string;
    vercelToken: string;
    /** Mutually exclusive routing — see {@link DeploymentMode}. */
    deployment: DeploymentMode;
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
