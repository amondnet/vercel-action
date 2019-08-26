const { Toolkit } = require('actions-toolkit')

// Run your GitHub Action!
Toolkit.run(async tools => {
  tools.log.info(JSON.stringify(tools.context, null, 4));

  const params = {
    owner: tools.context.repo.owner,
    repo: tools.context.repo.repo,
    issue_number: tools.context.payload.pull_request.number,
  };

  const comments = await tools.github.issues.listComments(params);
  tools.log.info(comments);

  await tools.github.issues.createComment({
    ...params,
    body: 'Auto Comment Test',
  });

  tools.exit.success('We did it!');
});
