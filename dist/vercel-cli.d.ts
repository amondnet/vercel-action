import type { ActionConfig, DeploymentContext, InspectResult, VercelClient } from './types';
export declare class VercelCliClient implements VercelClient {
    private readonly config;
    constructor(config: ActionConfig);
    private get effectiveScope();
    deploy(config: ActionConfig, deployContext: DeploymentContext): Promise<string>;
    inspect(deploymentUrl: string): Promise<InspectResult>;
    assignAlias(deploymentUrl: string, domain: string): Promise<void>;
}
