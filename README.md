# ZEIT Now Deployment

> ZEIT Now is a cloud platform for static sites and Serverless Functions

This action make a ZEIT Now deployment with github actions. 

- [x] Deploy to ZEIT now.
- [x] Comment on pull request.
- [x] Comment on commit.
- [ ] Create Deployment on github.

## Result

![preview](./preview.png)

[pull request example](https://github.com/amondnet/now-deployment/pull/2)

[commit](https://github.com/amondnet/now-deployment/commit/3d926623510294463c589327f5420663b1b0b35f)
## Inputs

| Name              | Required | Default | Description                                                                                       |
|-------------------|:--------:|---------|---------------------------------------------------------------------------------------------------|
| zeit-token        |    [x]   |         | ZEIT now token.                                                                                   |
| zeit-team-id      |    [ ]   |         | if your deployment is made on team project and `github-comment` is true. example: `team_asdf1234` |
| github-comment    |    [ ]   | true    | if you don't want to comment on pull request.                                                     |
| github-token      |    [ ]   |         | if you want to comment on pull request.                                                           |
| now-args          |    [ ]   |         | This is optional args for `now` cli. Example: `--prod`                                            |
| working-directory |    [ ]   |         | the working directory                                                                             |
| now-project-id    |    [x]   |         | ❗️Now CLI 17+,The `name` property in now.json is deprecated (https://zeit.ink/5F)                  |
| now-org-id        |    [x]   |         | ❗️Now CLI 17+,The `name` property in now.json is deprecated (https://zeit.ink/5F)                  |


## Outputs

### `preview-url`

The url of deployment preview.

## Example Usage

### Disable ZEIT Now for GitHub

> The ZEIT Now for GitHub integration automatically deploys your GitHub projects with ZEIT Now, providing Preview Deployment URLs, and automatic Custom Domain updates.
[link](https://zeit.co/docs/v2/git-integrations)

We would like to to use `github actions` for build and deploy instead of `ZEIT Now`. 

Set `github.enabled: false` in now.json

```json
{
  "version": 2,
  "public": false,
  "github": {
    "enabled": false
  },
  "builds": [
    { "src": "./public/**", "use": "@now/static" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "public/$1" }
  ]
}

```
When set to false, `ZEIT Now for GitHub` will not deploy the given project regardless of the GitHub app being installed.


`now.json` Example:
```json
{
  "name": "zeit-now-deployment",
  "version": 2,
  "scope": "amond",
  "public": false,
  "github": {
    "enabled": false
  },
  "builds": [
    { "src": "./public/**", "use": "@now/static" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "public/$1" }
  ]
}
```

### Project Linking

You should link a project via [Now CLI](https://zeit.co/download) in locally.

When running `now` in a directory for the first time, [Now CLI](https://zeit.co/download) needs to know which scope and Project you want to deploy your directory to. You can choose to either link an existing project or to create a new one.

> NOTE: Project linking requires at least version 17 of [Now CLI](https://zeit.co/download). If you have an earlier version, please [update](https://zeit.co/guides/updating-now-cli) to the latest version.

```bash
now
```

```bash
? Set up and deploy “~/web/my-lovely-project”? [Y/n] y
? Which scope do you want to deploy to? My Awesome Team
? Link to existing project? [y/N] y
? What’s the name of your existing project? my-lovely-project
🔗 Linked to awesome-team/my-lovely-project (created .now and added it to .gitignore)
```

Once set up, a new `.now` directory will be added to your directory. The `.now` directory contains both the organization(`now-org-id`) and project(`now-project-id`) id of your project.

```json
{"orgId":"example_org_id","projectId":"example_project_id"}
```

You can save both values in the secrets setting in your repository. Read the [Official documentation](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets) if you want further info on how secrets work on Github.

### Github Actions

* This is a complete `.github/workflow/deploy.yml` example.

Set the `now-project-id` and `now-org-id` you found above.

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/now-deployment@v2
        with:
          zeit-token: ${{ secrets.ZEIT_TOKEN }} # Required
          github-token: ${{ secrets.GITHUB_TOKEN }} #Optional 
          zeit-team-id: team_XXXXXXXXXXX #Optional 
          now-args: '--prod' #Optional
          now-org-id: ${{ secrets.ORG_ID}}  #Required
          now-project-id: ${{ secrets.PROJECT_ID}} #Required 
          working-directory: ./sub-directory
```


### Agnular Example

See [.github/workflow/example-angular.yml](/.github/workflows/example-angular.yml) , 
