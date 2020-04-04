const { stripIndents } = require("common-tags");
const core = require("@actions/core");
const github = require("@actions/github");
const { execSync } = require("child_process");
const exec = require("@actions/exec");

const context = github.context;

const zeitToken = core.getInput("zeit-token");
const nowArgs = core.getInput("now-args");
const githubToken = core.getInput("github-token");
const githubComment = core.getInput("github-comment") === "true";
const workingDirectory = core.getInput("working-directory");
const nowOrgId = core.getInput("now-org-id");
const nowProjectId = core.getInput("now-project-id");

let octokit;
if (githubToken) {
  octokit = new github.GitHub(githubToken);
}

async function run() {
  core.debug(`action : ${context.action}`);
  core.debug(`ref : ${context.ref}`);
  core.debug(`eventName : ${context.eventName}`);
  core.debug(`actor : ${context.actor}`);
  core.debug(`sha : ${context.sha}`);
  core.debug(`workflow : ${context.workflow}`);
  let ref = context.ref;
  let sha = context.sha;
  await setEnv();

  let commit = execSync("git log -1 --pretty=format:%B")
    .toString()
    .trim();
  if (github.context.eventName === 'push') {
    const pushPayload = github.context.payload;
    core.debug(`The head commit is: ${pushPayload.head_commit}`);
  } else if ( github.context.eventName === 'pull_request') {
    const pullRequestPayload = github.context.payload;
    core.debug(`head : ${pullRequestPayload.pull_request.head}`);

    ref = pullRequestPayload.pull_request.head.ref;
    sha = pullRequestPayload.pull_request.head.sha;
    core.debug(`The head ref is: ${pullRequestPayload.pull_request.head.ref}`);
    core.debug(`The head sha is: ${pullRequestPayload.pull_request.head.sha}`);

    if ( octokit ) {
      const { data: commitData } = await octokit.git.getCommit({
        ...context.repo, commit_sha: sha
      });
      commit = commitData.message;
      core.debug(`The head commit is: ${commit}`);
    }
  }

  const deploymentUrl = await nowDeploy(ref, commit);
  if (deploymentUrl) {
    core.info("set preview-url output");
    core.setOutput("preview-url", deploymentUrl);
  } else {
    core.warning("get preview-url error");
  }
  if (githubComment && githubToken) {
    if (context.issue.number) {
      core.info("this is related issue or pull_request ");
      await createCommentOnPullRequest(sha, deploymentUrl);
    } else if (context.eventName === "push") {
      core.info("this is push event");
      await createCommentOnCommit(sha, deploymentUrl);
    }
  } else {
    core.info("comment : disabled");
  }
}

async function setEnv() {
  core.info("set environment for now cli 17+");
  if (nowOrgId) {
    core.info("set env variable : NOW_ORG_ID");
    core.exportVariable("NOW_ORG_ID", nowOrgId);
  }
  if (nowProjectId) {
    core.info("set env variable : NOW_PROJECT_ID");
    core.exportVariable("NOW_PROJECT_ID", nowProjectId);
  }
}

async function nowDeploy(ref, commit) {
  let myOutput = "";
  let myError = "";
  const options = {};
  options.listeners = {
    stdout: data => {
      myOutput += data.toString();
      core.info(data.toString());
    },
    stderr: data => {
      myError += data.toString();
      core.info(data.toString());
    }
  };
  if (workingDirectory) {
    options.cwd = workingDirectory;
  }

  await exec.exec(
    "npx",
    [
      "now",
      ...nowArgs.split(/ +/),
      "-t",
      zeitToken,
      "-m",
      `githubCommitSha=${context.sha}`,
      "-m",
      `githubCommitAuthorName=${context.actor}`,
      "-m",
      `githubCommitAuthorLogin=${context.actor}`,
      "-m",
      "githubDeployment=1",
      "-m",
      `githubOrg=${context.repo.owner}`,
      "-m",
      `githubRepo=${context.repo.repo}`,
      "-m",
      `githubCommitOrg=${context.repo.owner}`,
      "-m",
      `githubCommitRepo=${context.repo.repo}`,
      "-m",
      `githubCommitMessage=${commit}`,
      "-m",
      `githubCommitRef=${ref}`
    ],
    options
  );

  return myOutput;
}

async function findPreviousComment(text) {
  if (!octokit) {
    return null;
  }
  core.info("find comment");
  const { data: comments } = await octokit.repos.listCommentsForCommit({
    ...context.repo,
    commit_sha: context.sha
  });

  const zeitPreviewURLComment = comments.find(comment =>
    comment.body.startsWith(text)
  );
  if (zeitPreviewURLComment) {
    core.info("previous comment found");
    return zeitPreviewURLComment.id;
  } else {
    core.info("previous comment not found");
    return null;
  }
}

async function createCommentOnCommit(deploymentCommit, deploymentUrl) {
  if (!octokit) {
    return;
  }
  const commentId = await findPreviousComment(
    "Deploy preview for _website_ ready!"
  );

  const commentBody = stripIndents`
    Deploy preview for _website_ ready!

    Built with commit ${deploymentCommit}

    https://${deploymentUrl}
  `;

  if (commentId) {
    await octokit.repos.updateCommitComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody
    });
  } else {
    await octokit.repos.createCommitComment({
      ...context.repo,
      commit_sha: context.sha,
      body: commentBody
    });
  }
}

async function createCommentOnPullRequest(deploymentCommit, deploymentUrl) {
  if (!octokit) {
    return;
  }
  const commentId = await findPreviousComment(
    "This pull request is being automatically deployed with"
  );

  const commentBody = stripIndents`
    This pull request is being automatically deployed with [now-deployment](https://github.com/amondnet/now-deployment)

    Built with commit ${deploymentCommit}

    ✅ Preview: ${deploymentUrl}
  `;

  if (commentId) {
    await octokit.issues.updateComment({
      ...context.repo,
      comment_id: commentId,
      body: commentBody
    });
  } else {
    await octokit.issues.createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body: commentBody
    });
  }
}

run().catch(error => {
  core.setFailed(error.message);
});
