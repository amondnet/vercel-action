const axios = require("axios");
const { stripIndents } = require("common-tags");
const { Toolkit } = require("actions-toolkit");

if (!process.env.ZEIT_TOKEN) {
  throw new Error(`ZEIT_TOKEN environment variable is not set`);
}

const zeitAPIClient = axios.create({
  baseURL: "https://api.zeit.co",
  headers: {
    Authorization: `Bearer ${process.env.ZEIT_TOKEN}`
  },
  params: {
    teamId: process.env.ZEIT_TEAMID || undefined,
    "meta-commit": process.env.GITHUB_SHA
  }
});

// Run your GitHub Action!
Toolkit.run(async tools => {
  const { data: comments } = await tools.github.issues.listComments({
    ...tools.context.repo,
    issue_number: tools.context.payload.pull_request.number
  });

  const zeitPreviewURLComment = comments.find(comment =>
    comment.body.startsWith("Deploy preview for _website_ ready!")
  );

  const {
    data: {
      deployments: [deployment]
    }
  } = await zeitAPIClient.get("/v4/now/deployments");

  const commentBody = stripIndents`
    Deploy preview for _website_ ready!

    Built with commit ${process.env.GITHUB_SHA}

    https://${deployment.url}
  `;

  if (zeitPreviewURLComment) {
    await tools.github.issues.updateComment({
      ...tools.context.repo,
      comment_id: zeitPreviewURLComment.id,
      body: commentBody
    });
  } else {
    await tools.github.issues.createComment({
      ...tools.context.repo,
      issue_number: tools.context.payload.pull_request.number,
      body: commentBody
    });
  }
});
