import type { ActionConfig } from './types';
export interface ProjectSettings {
    rootDirectory?: string | null;
    sourceFilesOutsideRootDirectory?: boolean;
    nodeVersion?: string;
}
export interface ProjectConfig {
    nowConfig?: Record<string, unknown>;
    projectSettings?: ProjectSettings;
}
export declare function readNodeVersion(workingDirectory: string): string | undefined;
export declare function readVercelJson(workingDirectory: string): Record<string, unknown> | null;
export declare function buildProjectConfig(config: ActionConfig): ProjectConfig;
