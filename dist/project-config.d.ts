import type { ActionConfig } from './types';
export interface ProjectSettings {
    rootDirectory?: string | null;
    sourceFilesOutsideRootDirectory?: boolean;
    nodeVersion?: string;
    buildCommand?: string | null;
    installCommand?: string | null;
    outputDirectory?: string | null;
    framework?: string | null;
    devCommand?: string | null;
}
export interface ProjectConfig {
    projectSettings?: ProjectSettings;
}
export declare function normalizeNodeVersion(input: string | undefined): string | undefined;
export declare function readNodeVersion(workingDirectory: string): string | undefined;
export declare function readVercelJson(workingDirectory: string): Record<string, unknown> | null;
export declare function buildProjectConfig(config: ActionConfig): ProjectConfig;
