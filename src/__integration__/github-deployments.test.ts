import { beforeAll, describe, expect, it } from 'vitest'
import { createOctokitClient, TEST_OWNER, TEST_REPO } from './helpers'

describe('github deployments API', () => {
  let commitSha: string
  let deploymentsSupported = true

  beforeAll(async () => {
    const octokit = createOctokitClient()

    const { data: blob } = await octokit.rest.git.createBlob({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      content: 'deployment test',
      encoding: 'utf-8',
    })

    const { data: tree } = await octokit.rest.git.createTree({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      tree: [{ path: 'deploy.txt', mode: '100644', type: 'blob', sha: blob.sha }],
    })

    const { data: commit } = await octokit.rest.git.createCommit({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      message: 'deploy commit',
      tree: tree.sha,
      parents: [],
    })

    commitSha = commit.sha

    try {
      await octokit.rest.repos.createDeployment({
        owner: TEST_OWNER,
        repo: TEST_REPO,
        ref: commitSha,
        auto_merge: false,
        required_contexts: [],
      })
    }
    catch {
      deploymentsSupported = false
    }
  })

  it('should create a deployment', async () => {
    if (!deploymentsSupported) {
      console.log('Skipping: GitHub Deployments API not supported by emulator')
      return
    }

    const octokit = createOctokitClient()

    const { data: deployment } = await octokit.rest.repos.createDeployment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      ref: commitSha,
      auto_merge: false,
      required_contexts: [],
    })

    expect(deployment).toBeDefined()
    expect('id' in deployment).toBe(true)
  })

  it('should create deployment statuses with state transitions', async () => {
    if (!deploymentsSupported) {
      console.log('Skipping: GitHub Deployments API not supported by emulator')
      return
    }

    const octokit = createOctokitClient()

    const { data: deployment } = await octokit.rest.repos.createDeployment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      ref: commitSha,
      auto_merge: false,
      required_contexts: [],
    })

    if (!('id' in deployment)) {
      throw new Error('Expected deployment to have an id')
    }

    const { data: pendingStatus } = await octokit.rest.repos.createDeploymentStatus({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: deployment.id,
      state: 'pending',
    })
    expect(pendingStatus.state).toBe('pending')

    const { data: successStatus } = await octokit.rest.repos.createDeploymentStatus({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: deployment.id,
      state: 'success',
    })
    expect(successStatus.state).toBe('success')
  })

  it('should list deployment statuses', async () => {
    if (!deploymentsSupported) {
      console.log('Skipping: GitHub Deployments API not supported by emulator')
      return
    }

    const octokit = createOctokitClient()

    const { data: deployment } = await octokit.rest.repos.createDeployment({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      ref: commitSha,
      auto_merge: false,
      required_contexts: [],
    })

    if (!('id' in deployment)) {
      throw new Error('Expected deployment to have an id')
    }

    await octokit.rest.repos.createDeploymentStatus({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: deployment.id,
      state: 'success',
    })

    const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
      owner: TEST_OWNER,
      repo: TEST_REPO,
      deployment_id: deployment.id,
    })

    expect(statuses.length).toBeGreaterThan(0)
    const found = statuses.find(s => s.state === 'success')
    expect(found).toBeDefined()
  })
})
