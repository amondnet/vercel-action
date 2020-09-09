const { stripIndents } = require('common-tags');
const core = require('@actions/core');
const github = require('@actions/github');
const { execSync } = require('child_process');
const exec = require('@actions/exec');

const { context } = github;

const githubToken = core.getInput('github-token');
const githubComment = core.getInput('github-comment') === 'true';
const workingDirectory = core.getInput('working-directory');

const prNumberRegExp = /{{\s*PR_NUMBER\s*}}/g;
const branchRegExp = /{{\s*BRANCH\s*}}/g;

function slugify(str) {
  const slug = str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  core.debug(`before slugify: "${str}"; after slugify: "${slug}"`);
  return slug;
}

// Vercel
const vercelToken = core.getInput('vercel-token', { required: true });
const vercelArgs = core.getInput('vercel-args');
const vercelOrgId = core.getInput('vercel-org-id');
const vercelProjectId = core.getInput('vercel-project-id');
const vercelScope = core.getInput('scope');
const vercelProjectName = core.getInput('vercel-project-name');
const aliasDomains = core
  .getInput('alias-domains')
  .split('\n')
  .filter(x => x !== '')
  .map(s => {
    let url = s;
    let branch = slugify(context.ref.replace('refs/heads/', ''));
    if (context.eventName === 'pull_request') {
      branch = slugify(
        context.payload.pull_request.head.ref.replace('refs/heads/', ''),
      );
      url = url.replace(prNumberRegExp, context.issue.number.toString());
    }
    url = url.replace(branchRegExp, branch);

    return url;
  });

let octokit;
if (githubToken) {
  octokit = new github.GitHub(githubToken);
}

async function setEnv() {
  core.info('set environment for vercel cli');
  if (vercelOrgId) {
    core.info('set env variable : VERCEL_ORG_ID');
    core.exportVariable('VERCEL_ORG_ID', vercelOrgId);
  }
  if (vercelProjectId) {
    core.info('set env variable : VERCEL_PROJECT_ID');
    core.exportVariable('VERCEL_PROJECT_ID', vercelProjectId);
  }
}

async function vercelDeploy(ref, commit) {
  let myOutput = '';
  // eslint-disable-next-line no-unused-vars
  let myError = '';
  const options = {};
  options.listeners = {
    stdout: data => {
      myOutput += data.toString();
      core.info(data.toString());
    },
    stderr: data => {
      myError += data.toString();
      core.info(data.toString());
    },
  };
  if (workingDirectory) {
    options.cwd = workingDirectory;
  }

  const args = [
    ...vercelArgs.split(/ +/),
    '-t',
    vercelToken,
    '-m',
    `githubCommitSha=${context.sha}`,
    '-m',
    `githubCommitAuthorName=${context.actor}`,
    '-m',
    `githubCommitAuthorLogin=${context.actor}`,
    '-m',
    'githubDeployment=1',
    '-m',
    `githubOrg=${context.repo.owner}`,
    '-m',
    `githubRepo=${context.repo.repo}`,
    '-m',
    `githubCommitOrg=${context.repo.owner}`,
    '-m',
    `githubCommitRepo=${context.repo.repo}`,
    '-m',
    `githubCommitMessage=${commit}`,
    '-m',
    `githubCommitRef=${ref}`,
  ];

  if (vercelScope) {
    core.info('using scope');
    args.push('--scope', vercelScope);
  }

  await exec.exec('npx', ['vercel', ...args], options);

  return myOutput;
}

async function vercelInspect(deploymentUrl) {
  // eslint-disable-next-line no-unused-vars
  let myOutput = '';
  let myError = '';
  const options = {};
  options.listeners = {
    stdout: data => {
      myOutput += data.toString();
      core.info(data.toString());
    },
    stderr: data => {
      myError += data.toString();
      core.info(data.toString());
    },
  };
  if (workingDirectory) {
    options.cwd = workingDirectory;
  }

  const args = ['vercel', 'inspect', deploymentUrl, '-t', vercelToken];

  if (vercelScope) {
    core.info('using scope');
    args.push('--scope', vercelScope);
  }
  await exec.exec('npx', args, options);

  const match = myError.match(/^\s+name\s+(.+)$/m);
  return match && match.length ? match[1] : null;
}

async function findCommentsForEvent() {
  core.debug('find comments for event');
  if (context.eventName === 'push') {
    core.debug('event is "commit", use "listCommentsForCommit"');
    return octokit.repos.listCommentsForCommit({
      ...context.repo,
      commit_sha: context.sha,
    });
  }
  if (context.eventName === 'pull_request') {
    core.debug('event is "pull_request", use "listComments"');
    return octokit.issues.listComments({
      ...context.repo,
      issue_number: context.issue.number,
    });
  }
  core.error('not supported event_type');
  return [];
}

async function findPreviousComment(text) {
  if (!octokit) {
    return null;
  }
  core.info('find comment');
  const { data: comments } = await findCommentsForEvent();

  const vercelPreviewURLComment = comments.find(comment =>
    comment.body.startsWith(text),
  );
  if (vercelPreviewURLComment) {
    core.info('previous comment found');
    return vercelPreviewURLComment.id;
  }
  core.info('previous comment not found');
  return null;
}

async function createCommentOnCommit(
  deploymentCommit,
  deploymentUrl,
  deploymentName,
) {
  if (!octokit) {
    return;
  }
  const commentId = await findPreviousComment(
    `Deploy preview for _${deploymentName}_ ready!`,
  );

  let previewUrl = deploymentUrl;
  if (aliasDomains.length) {
    aliasDomains.forEach(domain => {
      previewUrl += `\nhttps://${domain}`;
    });
  }

  const commentBody = stripIndents`
    Deploy preview for _${deploymentName}_ ready!

    ✅ Preview
    ${previewUrl}
    
    Built with commit ${deploymentCommit}.
    This pull request is being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)
  `;

  if (commentId) {
    await octokit.repos.updateCommitComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody,
    });
  } else {
    await octokit.repos.createCommitComment({
      ...context.repo,
      commit_sha: context.sha,
      body: commentBody,
    });
  }
}

async function createCommentOnPullRequest(
  deploymentCommit,
  deploymentUrl,
  deploymentName,
) {
  if (!octokit) {
    return;
  }
  const commentId = await findPreviousComment(
    `Deploy preview for _${deploymentName}_ ready!`,
  );

  let previewUrl = deploymentUrl;
  if (aliasDomains.length) {
    aliasDomains.forEach(domain => {
      previewUrl += `\nhttps://${domain}`;
    });
  }

  const commentBody = stripIndents`
    Deploy preview for _${deploymentName}_ ready!

    ✅ Preview
    ${previewUrl}
    
    Built with commit ${deploymentCommit}.
    This pull request is being automatically deployed with [vercel-action](https://github.com/marketplace/actions/vercel-action)
  `;

  if (commentId) {
    await octokit.issues.updateComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody,
    });
  } else {
    await octokit.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: commentBody,
    });
  }
}

async function aliasDomainsToDeployment(deploymentUrl) {
  if (!deploymentUrl) {
    core.error('deployment url is null');
  }
  const args = ['-t', vercelToken];
  if (vercelScope) {
    core.info('using scope');
    args.push('--scope', vercelScope);
  }
  const promises = aliasDomains.map(domain => {
    return exec.exec('npx', [
      'vercel',
      ...args,
      'alias',
      deploymentUrl,
      domain,
    ]);
  });
  await Promise.all(promises);
}

async function run() {
  core.debug(`action : ${context.action}`);
  core.debug(`ref : ${context.ref}`);
  core.debug(`eventName : ${context.eventName}`);
  core.debug(`actor : ${context.actor}`);
  core.debug(`sha : ${context.sha}`);
  core.debug(`workflow : ${context.workflow}`);
  let { ref } = context;
  let { sha } = context;
  await setEnv();

  let commit = execSync('git log -1 --pretty=format:%B')
    .toString()
    .trim();
  if (github.context.eventName === 'push') {
    const pushPayload = github.context.payload;
    core.debug(`The head commit is: ${pushPayload.head_commit}`);
  } else if (github.context.eventName === 'pull_request') {
    const pullRequestPayload = github.context.payload;
    core.debug(`head : ${pullRequestPayload.pull_request.head}`);

    ref = pullRequestPayload.pull_request.head.ref;
    sha = pullRequestPayload.pull_request.head.sha;
    core.debug(`The head ref is: ${pullRequestPayload.pull_request.head.ref}`);
    core.debug(`The head sha is: ${pullRequestPayload.pull_request.head.sha}`);

    if (octokit) {
      const { data: commitData } = await octokit.git.getCommit({
        ...context.repo,
        commit_sha: sha,
      });
      commit = commitData.message;
      core.debug(`The head commit is: ${commit}`);
    }
  }

  const deploymentUrl = await vercelDeploy(ref, commit);

  if (deploymentUrl) {
    core.info('set preview-url output');
    if (aliasDomains && aliasDomains.length) {
      core.info('set preview-url output as first alias');
      core.setOutput('preview-url', `https://${aliasDomains[0]}`);
    } else {
      core.setOutput('preview-url', deploymentUrl);
    }
  } else {
    core.warning('get preview-url error');
  }

  const deploymentName =
    vercelProjectName || (await vercelInspect(deploymentUrl));
  if (deploymentName) {
    core.info('set preview-name output');
    core.setOutput('preview-name', deploymentName);
  } else {
    core.warning('get preview-name error');
  }

  if (aliasDomains.length) {
    core.info('alias domains to this deployment');
    await aliasDomainsToDeployment(deploymentUrl);
  }

  if (githubComment && githubToken) {
    if (context.issue.number) {
      core.info('this is related issue or pull_request ');
      await createCommentOnPullRequest(sha, deploymentUrl, deploymentName);
    } else if (context.eventName === 'push') {
      core.info('this is push event');
      await createCommentOnCommit(sha, deploymentUrl, deploymentName);
    }
  } else {
    core.info('comment : disabled');
  }
}

run().catch(error => {
  core.setFailed(error.message);
});
