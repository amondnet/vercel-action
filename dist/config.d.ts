import type { ActionConfig, OctokitClient } from './types';
export declare function resolveDeploymentEnvironment(explicitEnv: string, vercelArgs: string): string;
export declare function getActionConfig(): ActionConfig;
export declare function createOctokitClient(githubToken: string): OctokitClient | undefined;
export declare function setVercelEnv(config: ActionConfig): void;
