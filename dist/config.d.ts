import type { ActionConfig, OctokitClient } from './types';
export declare function getActionConfig(): ActionConfig;
export declare function createOctokitClient(githubToken: string): OctokitClient | undefined;
export declare function setVercelEnv(config: ActionConfig): void;
