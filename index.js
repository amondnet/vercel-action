const axios = require('axios');
const { stripIndents } = require('common-tags');
const { Toolkit } = require('actions-toolkit')

if (!process.env.ZEIT_TOKEN) {
  throw new Error(`ZEIT_TOKEN environment variable is not set`);
}

const zeitAPIClient = axios.create({
  baseURL: 'https://api.zeit.co',
  headers: {
    'Authorization': `Bearer ${process.env.ZEIT_TOKEN}`
  }
})

// Run your GitHub Action!
Toolkit.run(async tools => {
  const { data: comments } = await tools.github.issues.listComments({
    owner: tools.context.repo.owner,
    repo: tools.context.repo.repo,
    issue_number: tools.context.payload.pull_request.number
  });

  const zeitPreviewURLComment = comments.find(
    comment => comment.body.startsWith('Deploy preview for _website_ ready!')
  );

  const commentBody = stripIndents`
    Deploy preview for _website_ ready!

    Build with commit ${process.env.GITHUB_SHA}

    https://preview.mobile.club
  `

  if (zeitPreviewURLComment) {
    await tools.github.issues.updateComment({
      id: zeitPreviewURLComment.id,
      owner: tools.context.repo.owner,
      repo: tools.context.repo.repo,
      body: commentBody
    })
  } else {
    await tools.github.issues.createComment({
      owner: tools.context.repo.owner,
      repo: tools.context.repo.repo,
      issue_number: tools.context.payload.pull_request.number,
      body: commentBody
    });
  }


  tools.exit.success('We did it!');
});
