import type { ActionConfig } from './types';
export declare class BuildFailedError extends Error {
    readonly exitCode: number;
    readonly stderrTail: string;
    constructor(message: string, exitCode: number, stderrTail: string);
    static fromOutput(command: string, exitCode: number, stdout: string, stderr: string, tailLines?: number): BuildFailedError;
}
export declare function runVercelPull(config: ActionConfig): Promise<void>;
export interface BuildStepResult {
    prebuilt: true;
    vercelOutputDir: string;
}
export declare function runBuildStep(config: ActionConfig): Promise<BuildStepResult>;
export declare function runVercelBuild(config: ActionConfig): Promise<void>;
