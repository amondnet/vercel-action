import type { ActionConfig } from './types';
export declare function vercelDeploy(config: ActionConfig, ref: string, commit: string, sha: string, commitOrg: string, commitRepo: string): Promise<string>;
export declare function vercelInspect(config: ActionConfig, deploymentUrl: string): Promise<string | null>;
export declare function aliasDomainsToDeployment(config: ActionConfig, deploymentUrl: string): Promise<void>;
