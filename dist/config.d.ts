import type { ActionConfig, DeploymentMode, OctokitClient } from './types';
export declare function resolveDeploymentEnvironment(explicitEnv: string, deployment: DeploymentMode, target: 'production' | 'preview'): string;
export declare function getActionConfig(): ActionConfig;
export declare function createOctokitClient(githubToken: string): OctokitClient | undefined;
export declare function setVercelEnv(config: ActionConfig): void;
