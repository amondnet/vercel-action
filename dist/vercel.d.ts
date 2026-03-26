import type { ActionConfig, DeploymentContext } from './types';
export declare function vercelDeploy(config: ActionConfig, deployContext: DeploymentContext): Promise<string>;
export declare function vercelInspect(config: ActionConfig, deploymentUrl: string): Promise<string | null>;
export declare function aliasDomainsToDeployment(config: ActionConfig, deploymentUrl: string): Promise<void>;
