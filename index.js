const axios = require("axios");
const { stripIndents } = require("common-tags");
const core = require("@actions/core");
const github = require("@actions/github");
const { execSync } = require("child_process");
const exec = require("@actions/exec");

const context = github.context;

const zeitToken = core.getInput("zeit-token");
const zeitTeamId = core.getInput("zeit-team-id");
const nowArgs = core.getInput("now-args");
const githubToken = core.getInput("github-token");
const githubComment = core.getInput("github-comment") === "true";
const githubDeployment = core.getInput("github-deployment") === "true";
const workingDirectory = core.getInput("working-directory");
const nowOrgId = core.getInput("now-org-id");
const nowProjectId = core.getInput("now-project-id");

const zeitAPIClient = axios.create({
  baseURL: "https://api.zeit.co",
  headers: {
    Authorization: `Bearer ${zeitToken}`
  },
  params: {
    teamId: zeitTeamId || undefined
  }
});

let octokit;
if (githubToken) {
  octokit = new github.GitHub(githubToken);
}

async function run() {
  await setEnv();
  await nowDeploy();
  const deployment = await findPreviewUrl();
  const deploymentUrl = deployment.deploymentUrl;
  const deploymentCommit = deployment.deploymentCommit;
  if (deploymentUrl) {
    core.info("set preview-url output");
    core.setOutput("preview-url", `https://${deploymentUrl}`);
  } else {
    core.warning("get preview-url error");
  }
  if (githubComment && githubToken) {
    if (context.issue.number) {
      core.info("this is related issue or pull_request ");
      await createCommentOnPullRequest(deploymentCommit, deploymentUrl);
    } else if (context.eventName === "push") {
      core.info("this is push event");
      await createCommentOnCommit(deploymentCommit, deploymentUrl);
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

async function nowDeploy() {
  const commit = execSync("git log -1 --pretty=format:%B")
    .toString()
    .trim();

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

  return await exec
    .exec(
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
      ],
      options
    )
    .then(() => {});
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

async function findPreviewUrl() {
  let deploymentUrl;
  let deploymentCommit;

  const {
    data: {
      deployments: [commitDeployment]
    }
  } = await zeitAPIClient.get("/v4/now/deployments", {
    params: {
      "meta-githubCommitSha": context.sha
    }
  });

  if (commitDeployment) {
    deploymentUrl = commitDeployment.url;
    deploymentCommit = commitDeployment.meta.githubCommitSha;
  } else {
    const {
      data: {
        deployments: [lastBranchDeployment]
      }
    } = await zeitAPIClient.get("/v4/now/deployments", {
      params: {
        "meta-githubCommitRef": context.ref
      }
    });

    if (lastBranchDeployment) {
      deploymentUrl = lastBranchDeployment.url;
      deploymentCommit = lastBranchDeployment.meta.githubCommitSha;
    } else {
      const {
        data: {
          deployments: [lastDeployment]
        }
      } = await zeitAPIClient.get("/v4/now/deployments", {
        params: {
          limit: 1
        }
      });

      if (lastDeployment) {
        deploymentUrl = lastDeployment.url;
        deploymentCommit = lastDeployment.meta.githubCommitSha;
      }
    }
  }
  return {
    deploymentUrl: deploymentUrl,
    deploymentCommit: deploymentCommit
  };
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
    await octokit.repos.commentId({
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
    "Deploy preview for _website_ ready!"
  );

  const commentBody = stripIndents`
    Deploy preview for _website_ ready!

    Built with commit ${deploymentCommit}

    https://${deploymentUrl}
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
