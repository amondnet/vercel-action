import type * as github from '@actions/github'

export type OctokitClient = ReturnType<typeof github.getOctokit>

export interface PullRequestPayload {
  pull_request?: {
    head: {
      ref: string
      sha: string
      repo?: {
        owner: { login: string }
        name: string
      }
    }
  }
}

export interface ReleasePayload {
  release?: {
    tag_name: string
  }
}

export interface CommentData {
  id: number
  body?: string
}

export interface DeploymentContext {
  ref: string
  sha: string
  commit: string
  commitOrg: string
  commitRepo: string
}

export interface GitHubContext {
  eventName: string
  sha: string
  repo: { owner: string, repo: string }
  issueNumber: number
}

export interface ActionConfig {
  githubToken: string
  githubComment: boolean | string
  workingDirectory: string
  vercelToken: string
  vercelArgs: string
  vercelOrgId: string
  vercelProjectId: string
  vercelScope?: string
  vercelProjectName: string
  vercelBin: string
  aliasDomains: string[]
}
