import { execSync } from 'node:child_process'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import { stripIndents } from 'common-tags'
import packageJSON from '../package.json'
import {
  addVercelMetadata,
  buildCommentBody,
  buildCommentPrefix,
  getGithubCommentInput,
  isPullRequestType,
  parseArgs,
  retry,
  slugify,
} from './utils'

type OctokitClient = ReturnType<typeof github.getOctokit>

interface PullRequestPayload {
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
  pull_request_target?: {
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

interface ReleasePayload {
  release?: {
    tag_name: string
  }
}

const { context } = github

const githubToken = core.getInput('github-token')
const githubComment = getGithubCommentInput(core.getInput('github-comment'))
const workingDirectory = core.getInput('working-directory')
const prNumberRegExp = /\{\{\s*PR_NUMBER\s*\}\}/g
const branchRegExp = /\{\{\s*BRANCH\s*\}\}/g

function getVercelBin(): string {
  const input = core.getInput('vercel-version')
  const fallback = packageJSON.dependencies.vercel
  return `vercel@${input || fallback}`
}

const vercelToken = core.getInput('vercel-token', { required: true })
const vercelArgs = core.getInput('vercel-args')
const vercelOrgId = core.getInput('vercel-org-id')
const vercelProjectId = core.getInput('vercel-project-id')
const vercelScope = core.getInput('scope')
const vercelProjectName = core.getInput('vercel-project-name')
const vercelBin = getVercelBin()
const aliasDomains = core
  .getInput('alias-domains')
  .split('\n')
  .filter(x => x !== '')
  .map((s) => {
    let url = s
    let branch = slugify(context.ref.replace('refs/heads/', ''))
    if (isPullRequestType(context.eventName)) {
      const payload = context.payload as PullRequestPayload
      const pr = payload.pull_request || payload.pull_request_target
      if (pr) {
        branch = slugify(pr.head.ref.replace('refs/heads/', ''))
        url = url.replace(prNumberRegExp, context.issue.number.toString())
      }
    }
    url = url.replace(branchRegExp, branch)

    return url
  })

let octokit: OctokitClient | undefined
if (githubToken) {
  octokit = github.getOctokit(githubToken)
}

async function setEnv(): Promise<void> {
  core.info('set environment for vercel cli')
  if (vercelOrgId) {
    core.info('set env variable : VERCEL_ORG_ID')
    core.exportVariable('VERCEL_ORG_ID', vercelOrgId)
  }
  if (vercelProjectId) {
    core.info('set env variable : VERCEL_PROJECT_ID')
    core.exportVariable('VERCEL_PROJECT_ID', vercelProjectId)
  }
}

async function vercelDeploy(
  ref: string,
  commit: string,
  sha: string,
  commitOrg: string,
  commitRepo: string,
): Promise<string> {
  let myOutput = ''
  let _myError = ''
  const options: exec.ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data: Buffer) => {
      _myError += data.toString()
      core.info(data.toString())
    },
  }
  if (workingDirectory) {
    options.cwd = workingDirectory
  }

  const providedArgs = parseArgs(vercelArgs)

  const args = [
    ...providedArgs,
    ...['-t', vercelToken],
    ...addVercelMetadata('githubCommitSha', sha, providedArgs),
    ...addVercelMetadata('githubCommitAuthorName', context.actor, providedArgs),
    ...addVercelMetadata(
      'githubCommitAuthorLogin',
      context.actor,
      providedArgs,
    ),
    ...addVercelMetadata('githubDeployment', 1, providedArgs),
    ...addVercelMetadata('githubOrg', context.repo.owner, providedArgs),
    ...addVercelMetadata('githubRepo', context.repo.repo, providedArgs),
    ...addVercelMetadata('githubCommitOrg', commitOrg, providedArgs),
    ...addVercelMetadata('githubCommitRepo', commitRepo, providedArgs),
    ...addVercelMetadata('githubCommitMessage', `"${commit}"`, providedArgs),
    ...addVercelMetadata(
      'githubCommitRef',
      ref.replace('refs/heads/', ''),
      providedArgs,
    ),
  ]

  if (vercelScope) {
    core.info('using scope')
    args.push('--scope', vercelScope)
  }

  await exec.exec('npx', [vercelBin, ...args], options)

  return myOutput
}

async function vercelInspect(deploymentUrl: string): Promise<string | null> {
  let _myOutput = ''
  let myError = ''
  const options: exec.ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      _myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data: Buffer) => {
      myError += data.toString()
      core.info(data.toString())
    },
  }
  if (workingDirectory) {
    options.cwd = workingDirectory
  }

  const args = [vercelBin, 'inspect', deploymentUrl, '-t', vercelToken]

  if (vercelScope) {
    core.info('using scope')
    args.push('--scope', vercelScope)
  }
  await exec.exec('npx', args, options)

  const match = myError.match(/^\s+name\s+(.+)$/m)
  return match && match.length ? match[1] ?? null : null
}

interface CommentData {
  id: number
  body?: string
}

async function findCommentsForEvent(): Promise<{ data: CommentData[] }> {
  if (!octokit) {
    return { data: [] }
  }
  core.debug('find comments for event')
  if (context.eventName === 'push') {
    core.debug('event is "commit", use "listCommentsForCommit"')
    return octokit.rest.repos.listCommentsForCommit({
      ...context.repo,
      commit_sha: context.sha,
    })
  }
  if (isPullRequestType(context.eventName)) {
    core.debug(`event is "${context.eventName}", use "listComments"`)
    return octokit.rest.issues.listComments({
      ...context.repo,
      issue_number: context.issue.number,
    })
  }
  core.error('not supported event_type')
  return { data: [] }
}

async function findPreviousComment(text: string): Promise<number | null> {
  if (!octokit) {
    return null
  }
  core.info('find comment')
  const { data: comments } = await findCommentsForEvent()

  const vercelPreviewURLComment = comments.find(comment =>
    comment.body?.startsWith(text),
  )
  if (vercelPreviewURLComment) {
    core.info('previous comment found')
    return vercelPreviewURLComment.id
  }
  core.info('previous comment not found')
  return null
}

const defaultCommentTemplate = stripIndents`
  ✅ Preview
  {{deploymentUrl}}

  Built with commit {{deploymentCommit}}.
  This pull request is being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)
`

async function createCommentOnCommit(
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
): Promise<void> {
  if (!octokit) {
    return
  }
  const commentId = await findPreviousComment(
    buildCommentPrefix(deploymentName),
  )

  const commentBody = buildCommentBody(
    deploymentCommit,
    deploymentUrl,
    deploymentName,
    githubComment,
    aliasDomains,
    defaultCommentTemplate,
  )

  if (!commentBody) {
    return
  }

  if (commentId) {
    await octokit.rest.repos.updateCommitComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody,
    })
  }
  else {
    await octokit.rest.repos.createCommitComment({
      ...context.repo,
      commit_sha: context.sha,
      body: commentBody,
    })
  }
}

async function createCommentOnPullRequest(
  deploymentCommit: string,
  deploymentUrl: string,
  deploymentName: string,
): Promise<void> {
  if (!octokit) {
    return
  }
  const commentId = await findPreviousComment(
    `Deploy preview for _${deploymentName}_ ready!`,
  )

  const commentBody = buildCommentBody(
    deploymentCommit,
    deploymentUrl,
    deploymentName,
    githubComment,
    aliasDomains,
    defaultCommentTemplate,
  )

  if (!commentBody) {
    return
  }

  if (commentId) {
    await octokit.rest.issues.updateComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody,
    })
  }
  else {
    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: commentBody,
    })
  }
}

async function aliasDomainsToDeployment(deploymentUrl: string): Promise<void> {
  if (!deploymentUrl) {
    core.error('deployment url is null')
    return
  }
  const args = ['-t', vercelToken]
  if (vercelScope) {
    core.info('using scope')
    args.push('--scope', vercelScope)
  }
  const promises = aliasDomains.map(domain =>
    retry(
      () =>
        exec.exec('npx', [vercelBin, ...args, 'alias', deploymentUrl, domain]),
      2,
    ),
  )

  await Promise.all(promises)
}

async function run(): Promise<void> {
  core.debug(`action : ${context.action}`)
  core.debug(`ref : ${context.ref}`)
  core.debug(`eventName : ${context.eventName}`)
  core.debug(`actor : ${context.actor}`)
  core.debug(`sha : ${context.sha}`)
  core.debug(`workflow : ${context.workflow}`)
  let { ref } = context
  let { sha } = context
  let commitOrg = context.repo.owner
  let commitRepo = context.repo.repo
  await setEnv()

  let commit = execSync('git log -1 --pretty=format:%B')
    .toString()
    .trim()
  if (github.context.eventName === 'push') {
    const pushPayload = github.context.payload
    core.debug(`The head commit is: ${pushPayload.head_commit}`)
  }
  else if (isPullRequestType(github.context.eventName)) {
    const pullRequestPayload = github.context.payload as PullRequestPayload
    const pr
      = pullRequestPayload.pull_request || pullRequestPayload.pull_request_target
    if (pr) {
      core.debug(`head : ${pr.head}`)

      ref = pr.head.ref
      sha = pr.head.sha
      if (pr.head.repo) {
        commitOrg = pr.head.repo.owner.login
        commitRepo = pr.head.repo.name
      }
      else {
        core.warning('PR head repository not accessible, using base repository info')
        commitOrg = context.repo.owner
        commitRepo = context.repo.repo
      }
      core.debug(`The head ref is: ${pr.head.ref}`)
      core.debug(`The head sha is: ${pr.head.sha}`)
      core.debug(`The commit org is: ${commitOrg}`)
      core.debug(`The commit repo is: ${commitRepo}`)

      if (octokit) {
        const { data: commitData } = await octokit.rest.git.getCommit({
          owner: commitOrg,
          repo: commitRepo,
          commit_sha: sha,
        })
        commit = commitData.message
        core.debug(`The head commit is: ${commit}`)
      }
    }
  }
  else if (context.eventName === 'release') {
    const releasePayload = context.payload as ReleasePayload
    const tagName = releasePayload.release?.tag_name
    ref = !tagName ? ref : `refs/tags/${tagName}`
    core.debug(`The release ref is: ${ref}`)
  }

  const deploymentUrl = await vercelDeploy(ref, commit, sha, commitOrg, commitRepo)

  if (deploymentUrl) {
    core.info('set preview-url output')
    if (aliasDomains && aliasDomains.length) {
      core.info('set preview-url output as first alias')
      core.setOutput('preview-url', `https://${aliasDomains[0]}`)
    }
    else {
      core.setOutput('preview-url', deploymentUrl)
    }
  }
  else {
    core.warning('get preview-url error')
  }

  const deploymentName
    = vercelProjectName || (await vercelInspect(deploymentUrl))
  if (deploymentName) {
    core.info('set preview-name output')
    core.setOutput('preview-name', deploymentName)
  }
  else {
    core.warning('get preview-name error')
  }

  if (aliasDomains.length) {
    core.info('alias domains to this deployment')
    await aliasDomainsToDeployment(deploymentUrl)
  }

  if (githubComment && githubToken) {
    if (context.issue.number) {
      core.info('this is related issue or pull_request')
      await createCommentOnPullRequest(sha, deploymentUrl, deploymentName ?? '')
    }
    else if (context.eventName === 'push') {
      core.info('this is push event')
      await createCommentOnCommit(sha, deploymentUrl, deploymentName ?? '')
    }
  }
  else {
    core.info('comment : disabled')
  }
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    core.setFailed(error.message)
  }
  else {
    core.setFailed('An unexpected error occurred')
  }
})
