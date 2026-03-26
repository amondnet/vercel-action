import { Octokit } from '@octokit/rest';
export declare const VERCEL_TOKEN = "test-token";
export declare const GITHUB_TOKEN = "test-token";
export declare const TEST_OWNER = "test-user";
export declare const TEST_REPO = "test-repo";
export declare const TEST_TEAM = "test-team";
export declare const TEST_PROJECT = "test-project";
export declare function vercelFetch(path: string, options?: RequestInit): Promise<Response>;
export declare function createOctokitClient(): Octokit;
