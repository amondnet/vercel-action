import type { ActionConfig, DeploymentContext, InspectResult, VercelClient } from './types';
export declare function createVercelClient(config: ActionConfig): VercelClient;
export declare function vercelDeploy(client: VercelClient, config: ActionConfig, deployContext: DeploymentContext): Promise<string>;
export declare function vercelInspect(client: VercelClient, deploymentUrl: string): Promise<InspectResult>;
export declare function aliasDomainsToDeployment(client: VercelClient, config: ActionConfig, deploymentUrl: string): Promise<void>;
