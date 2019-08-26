const { Toolkit } = require('actions-toolkit')

// Run your GitHub Action!
Toolkit.run(async tools => {
  tools.log.info(JSON.stringify(tools.context, null, 4));

  await tools.github.issues.createComment({
    owner: tools.context.repo.owner,
    repo: tools.context.repo.repo,
    issue_number: tools.context.payload.pull_request.number,
    body: 'Auto Comment Test',
  });

  tools.exit.success('We did it!');
});
