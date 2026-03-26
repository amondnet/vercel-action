const { execSync } = require('node:child_process')
const core = require('@actions/core')
const exec = require('@actions/exec')
const github = require('@actions/github')
const { stripIndents } = require('common-tags')
const packageJSON = require('./package.json')

function getGithubCommentInput() {
  const input = core.getInput('github-comment')
  if (input === 'true')
    return true
  if (input === 'false')
    return false
  return input
}

const { context } = github

const githubToken = core.getInput('github-token')
const githubComment = getGithubCommentInput()
const workingDirectory = core.getInput('working-directory')
const prNumberRegExp = /\{\{\s*PR_NUMBER\s*\}\}/g
const branchRegExp = /\{\{\s*BRANCH\s*\}\}/g

function isPullRequestType(event) {
  return event.startsWith('pull_request')
}

function slugify(str) {
  const slug = str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  core.debug(`before slugify: "${str}"; after slugify: "${slug}"`)
  return slug
}

function retry(fn, retries) {
  async function attempt(retry) {
    try {
      return await fn()
    }
    catch (error) {
      if (retry > retries) {
        throw error
      }
      else {
        core.info(`retrying: attempt ${retry + 1} / ${retries + 1}`)
        await new Promise(resolve => setTimeout(resolve, 3000))
        return attempt(retry + 1)
      }
    }
  }
  return attempt(1)
}

// Vercel
function getVercelBin() {
  const input = core.getInput('vercel-version')
  const fallback = packageJSON.dependencies.vercel
  return `vercel@${input || fallback}`
}

const vercelToken = core.getInput('vercel-token', { required: true })
core.setSecret(vercelToken)
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
      const pr
        = context.payload.pull_request || context.payload.pull_request_target
      branch = slugify(pr.head.ref.replace('refs/heads/', ''))
      url = url.replace(prNumberRegExp, context.issue.number.toString())
    }
    url = url.replace(branchRegExp, branch)

    return url
  })

let octokit
if (githubToken) {
  octokit = new github.GitHub(githubToken)
}

async function setEnv() {
  core.info('set environment for vercel cli')
  core.exportVariable('VERCEL_TELEMETRY_DISABLED', '1')
  if (vercelOrgId && vercelProjectId) {
    core.info('set env variable : VERCEL_ORG_ID')
    core.exportVariable('VERCEL_ORG_ID', vercelOrgId)
    core.info('set env variable : VERCEL_PROJECT_ID')
    core.exportVariable('VERCEL_PROJECT_ID', vercelProjectId)
  }
  else if (vercelOrgId) {
    core.warning(
      'vercel-org-id was provided without vercel-project-id. '
      + 'Vercel CLI v41+ requires both to be set together. '
      + 'Skipping VERCEL_ORG_ID to avoid deployment failure.',
    )
  }
  else if (vercelProjectId) {
    core.warning(
      'vercel-project-id was provided without vercel-org-id. '
      + 'Vercel CLI v41+ requires both to be set together. '
      + 'Skipping VERCEL_PROJECT_ID to avoid deployment failure.',
    )
  }
}

function addVercelMetadata(key, value, providedArgs) {
  // returns a list for the metadata commands if key was not supplied by user in action parameters
  // returns an empty list if key was provided by user
  const pattern = `^${key}=.+`
  const metadataRegex = new RegExp(pattern, 'g')

  for (const arg of providedArgs) {
    if (arg.match(metadataRegex)) {
      return []
    }
  }

  return ['-m', `${key}=${value}`]
}

/**
 *
 * The following regex is used to split the vercelArgs string into an array of arguments.
 * It conserves strings wrapped in simple / double quotes, with nested different quotes, as a single argument.
 *
 * Example:
 *
 * parseArgs(`--env foo=bar "foo=bar baz" 'foo="bar baz"'`) => ['--env', 'foo=bar', 'foo=bar baz', 'foo="bar baz"']
 */
function parseArgs(s) {
  const args = []

  for (const match of s.matchAll(/'([^']*)'|"([^"]*)"|\S+/g)) {
    args.push(match[1] ?? match[2] ?? match[0])
  }
  return args
}

const PERSONAL_ACCOUNT_SCOPE_ERROR = 'You cannot set your Personal Account as the scope'

function buildDeployArgs(providedArgs, ref, commit, sha, commitOrg, commitRepo) {
  return [
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
    ...addVercelMetadata('githubCommitMessage', `"${commit.replace(/[\r\n]+/g, ' ').replace(/"/g, '')}"`, providedArgs),
    ...addVercelMetadata(
      'githubCommitRef',
      ref.replace('refs/heads/', ''),
      providedArgs,
    ),
  ]
}

async function vercelDeploy(ref, commit, sha, commitOrg, commitRepo) {
  let myOutput = ''
  let myError = ''
  const options = {
    ignoreReturnCode: true,
  }
  options.listeners = {
    stdout: (data) => {
      myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data) => {
      myError += data.toString()
      core.info(data.toString())
    },
  }
  if (workingDirectory) {
    options.cwd = workingDirectory
  }

  const providedArgs = parseArgs(vercelArgs)

  const args = buildDeployArgs(providedArgs, ref, commit, sha, commitOrg, commitRepo)

  if (vercelScope) {
    core.info('using scope')
    args.push('--scope', vercelScope)
  }

  let exitCode = await exec.exec('npx', [vercelBin, ...args], options)

  if (exitCode !== 0) {
    const combinedOutput = myOutput + myError
    if (combinedOutput.includes(PERSONAL_ACCOUNT_SCOPE_ERROR)) {
      if (!vercelProjectId) {
        throw new Error(
          'Vercel CLI rejected VERCEL_ORG_ID as a personal account scope, '
          + 'but no vercel-project-id was provided to use as a fallback. '
          + 'Either remove vercel-org-id or add vercel-project-id to your workflow.',
        )
      }
      core.warning(
        'Vercel CLI rejected the org ID as a personal account scope. '
        + 'Retrying without VERCEL_ORG_ID and VERCEL_PROJECT_ID.',
      )
      delete process.env.VERCEL_ORG_ID
      delete process.env.VERCEL_PROJECT_ID

      const originalOutput = myOutput
      const originalError = myError
      myOutput = ''
      myError = ''
      const retryArgs = buildDeployArgs(providedArgs, ref, commit, sha, commitOrg, commitRepo)
      // Don't re-add --scope on retry — it may have caused the personal account error

      exitCode = await exec.exec('npx', [vercelBin, ...retryArgs], options)

      if (exitCode !== 0) {
        core.error(`Original attempt output:\n${originalOutput}`)
        core.error(`Original attempt errors:\n${originalError}`)
      }
    }

    if (exitCode !== 0) {
      throw new Error(`The process 'npx' failed with exit code ${exitCode}`)
    }
  }

  return myOutput
}

async function vercelInspect(deploymentUrl) {
  let _myOutput = ''
  let myError = ''
  const options = {}
  options.listeners = {
    stdout: (data) => {
      _myOutput += data.toString()
      core.info(data.toString())
    },
    stderr: (data) => {
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
  return match && match.length ? match[1] : null
}

async function findCommentsForEvent() {
  core.debug('find comments for event')
  if (context.eventName === 'push') {
    core.debug('event is "commit", use "listCommentsForCommit"')
    return octokit.repos.listCommentsForCommit({
      ...context.repo,
      commit_sha: context.sha,
    })
  }
  if (isPullRequestType(context.eventName)) {
    core.debug(`event is "${context.eventName}", use "listComments"`)
    return octokit.issues.listComments({
      ...context.repo,
      issue_number: context.issue.number,
    })
  }
  core.error('not supported event_type')
  return []
}

async function findPreviousComment(text) {
  if (!octokit) {
    return null
  }
  core.info('find comment')
  const { data: comments } = await findCommentsForEvent()

  const vercelPreviewURLComment = comments.find(comment =>
    comment.body.startsWith(text),
  )
  if (vercelPreviewURLComment) {
    core.info('previous comment found')
    return vercelPreviewURLComment.id
  }
  core.info('previous comment not found')
  return null
}

function joinDeploymentUrls(deploymentUrl, aliasDomains_) {
  if (aliasDomains_.length) {
    const aliasUrls = aliasDomains_.map(domain => `https://${domain}`)
    return [deploymentUrl, ...aliasUrls].join('\n')
  }
  return deploymentUrl
}

function buildCommentPrefix(deploymentName) {
  return `Deploy preview for _${deploymentName}_ ready!`
}

function buildCommentBody(deploymentCommit, deploymentUrl, deploymentName) {
  if (!githubComment) {
    return undefined
  }
  const prefix = `${buildCommentPrefix(deploymentName)}\n\n`

  const rawGithubComment
    = prefix
      + (typeof githubComment === 'string' || githubComment instanceof String
        ? githubComment
        : stripIndents`
      ✅ Preview
      {{deploymentUrl}}
      
      Built with commit {{deploymentCommit}}.
      This pull request is being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)
    `)

  return rawGithubComment
    .replace(/\{\{deploymentCommit\}\}/g, deploymentCommit)
    .replace(/\{\{deploymentName\}\}/g, deploymentName)
    .replace(
      /\{\{deploymentUrl\}\}/g,
      joinDeploymentUrls(deploymentUrl, aliasDomains),
    )
}

async function createCommentOnCommit(
  deploymentCommit,
  deploymentUrl,
  deploymentName,
) {
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
  )

  if (commentId) {
    await octokit.repos.updateCommitComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody,
    })
  }
  else {
    await octokit.repos.createCommitComment({
      ...context.repo,
      commit_sha: context.sha,
      body: commentBody,
    })
  }
}

async function createCommentOnPullRequest(
  deploymentCommit,
  deploymentUrl,
  deploymentName,
) {
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
  )

  if (commentId) {
    await octokit.issues.updateComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody,
    })
  }
  else {
    await octokit.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: commentBody,
    })
  }
}

async function aliasDomainsToDeployment(deploymentUrl) {
  if (!deploymentUrl) {
    core.error('deployment url is null')
    return
  }

  const promises = aliasDomains.map(domain =>
    retry(
      async () => {
        const args = [vercelBin, '-t', vercelToken]
        if (vercelScope) {
          core.info('using scope')
          args.push('--scope', vercelScope)
        }
        args.push('alias', deploymentUrl, domain)

        let myOutput = ''
        let myError = ''
        const exitCode = await exec.exec('npx', args, {
          ignoreReturnCode: true,
          listeners: {
            stdout: (data) => {
              myOutput += data.toString()
            },
            stderr: (data) => {
              myError += data.toString()
            },
          },
        })

        if (exitCode !== 0) {
          const combinedOutput = myOutput + myError
          if (combinedOutput.includes(PERSONAL_ACCOUNT_SCOPE_ERROR)) {
            core.warning(
              'Vercel CLI rejected the scope for alias command. '
              + 'Retrying without --scope.',
            )
            const retryArgs = [vercelBin, '-t', vercelToken, 'alias', deploymentUrl, domain]
            let retryError = ''
            const retryExitCode = await exec.exec('npx', retryArgs, {
              ignoreReturnCode: true,
              listeners: {
                stderr: (data) => {
                  retryError += data.toString()
                },
              },
            })
            if (retryExitCode !== 0) {
              throw new Error(
                `Alias command failed for domain ${domain} with exit code ${retryExitCode}: ${retryError}`,
              )
            }
            return
          }
          throw new Error(
            `Alias command failed for domain ${domain} with exit code ${exitCode}: ${myError}`,
          )
        }
      },
      2,
    ),
  )

  await Promise.all(promises)
}

async function run() {
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
    const pullRequestPayload = github.context.payload
    const pr
      = pullRequestPayload.pull_request || pullRequestPayload.pull_request_target
    core.debug(`head : ${pr.head}`)

    ref = pr.head.ref
    sha = pr.head.sha
    if (pr.head.repo) {
      commitOrg = pr.head.repo.owner.login
      commitRepo = pr.head.repo.name
    }
    else {
      // 포크가 삭제된 경우 기본값 사용
      core.warning('PR head repository not accessible, using base repository info')
      commitOrg = context.repo.owner
      commitRepo = context.repo.repo
    }
    core.debug(`The head ref is: ${pr.head.ref}`)
    core.debug(`The head sha is: ${pr.head.sha}`)
    core.debug(`The commit org is: ${commitOrg}`)
    core.debug(`The commit repo is: ${commitRepo}`)

    if (octokit) {
      const { data: commitData } = await octokit.git.getCommit({
        owner: commitOrg,
        repo: commitRepo,
        commit_sha: sha,
      })
      commit = commitData.message
      core.debug(`The head commit is: ${commit}`)
    }
  }
  else if (context.eventName === 'release') {
    const tagName = context.payload.release?.tag_name
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
      await createCommentOnPullRequest(sha, deploymentUrl, deploymentName)
    }
    else if (context.eventName === 'push') {
      core.info('this is push event')
      await createCommentOnCommit(sha, deploymentUrl, deploymentName)
    }
  }
  else {
    core.info('comment : disabled')
  }
}

run().catch((error) => {
  core.setFailed(error.message)
})
