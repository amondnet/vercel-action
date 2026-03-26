import type { ActionConfig, DeploymentContext, VercelClient } from './types';
export declare class VercelCliClient implements VercelClient {
    private readonly config;
    constructor(config: ActionConfig);
    deploy(config: ActionConfig, deployContext: DeploymentContext): Promise<string>;
    inspect(deploymentUrl: string): Promise<string | null>;
    assignAlias(deploymentUrl: string, domain: string): Promise<void>;
}
