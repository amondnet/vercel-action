import type { ActionConfig, DeploymentContext, VercelClient } from './types';
export declare class VercelApiClient implements VercelClient {
    private readonly http;
    private readonly baseUrl;
    private readonly token;
    private readonly teamId?;
    constructor(config: ActionConfig, baseUrl?: string);
    private buildUrl;
    deploy(_config: ActionConfig, _deployContext: DeploymentContext): Promise<string>;
    inspect(deploymentUrl: string): Promise<string | null>;
    assignAlias(deploymentUrl: string, domain: string): Promise<void>;
    private extractDeploymentId;
}
