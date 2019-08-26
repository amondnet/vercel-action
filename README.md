# now-deploy-preview-comment

> Github action to comment with the now.sh deployment preview URL
>
> Inspired by netlify.com deployment preview comments

## Result

![preview](./preview.png)

## Requirements

* `ZEIT_TOKEN` => The token used for deployment and query the zeit.co API
* `ZEIT_TEAMID` => This is required if your deployment is made on team project.
* `meta-commit` => Add the SHA commit to the meta of the deployment (`-m commit=${GITHUB_SHA}`)
* `meta-branch` => Add the ref/branch to the meta of the deployment (`-m commit=${GITHUB_REF}`)

## Example

* This is a complete `.github/workflow/deploy-preview.yml` example.
* Be sure to include `-m commit=${GITHUB_SHA} -m branch=${GITHUB_REF}` in the now deploy command or the pull request comment will fail.

```yaml
name: deploy website preview
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - name: deploy now
        env:
          ZEIT_TOKEN: ${{ secrets.ZEIT_TOKEN }}
        run: now --no-clipboard -t ${ZEIT_TOKEN} -m commit=${GITHUB_SHA} -m branch=${GITHUB_REF}
      - uses: iam4x/now-deploy-preview-comment@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ZEIT_TOKEN: ${{ secrets.ZEIT_TOKEN }}
          ZEIT_TEAMID: team_XXXXXXXXXXX
```

## License WTFPL2

```
           DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                   Version 2, December 2004

Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

Everyone is permitted to copy and distribute verbatim or modified
copies of this license document, and changing it is allowed as long
as the name is changed.

           DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
  TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

 0. You just DO WHAT THE FUCK YOU WANT TO.
 ```
