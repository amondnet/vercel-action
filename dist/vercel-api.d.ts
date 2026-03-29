import type { ActionConfig, DeploymentContext, InspectResult, VercelClient } from './types';
export declare class VercelApiClient implements VercelClient {
    private readonly http;
    private readonly baseUrl;
    private readonly token;
    private readonly teamId?;
    constructor(config: ActionConfig, baseUrl?: string);
    private buildUrl;
    deploy(config: ActionConfig, deployContext: DeploymentContext): Promise<string>;
    inspect(deploymentUrl: string): Promise<InspectResult>;
    assignAlias(deploymentUrl: string, domain: string): Promise<void>;
    private extractDeploymentId;
}
