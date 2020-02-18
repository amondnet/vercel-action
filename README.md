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

`now.json`
```
github.enabled: false
```
When set to false, ZEIT Now for GitHub will not deploy the given project regardless of the GitHub app being installed.

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

* This is a complete `.github/workflow/deploy.yml` example.

```yaml
name: deploy website
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - uses: amondnet/now-deployment@v1
        with:
          zeit-token: ${{ secrets.ZEIT_TOKEN }} # Required
          github-token: ${{ secrets.GITHUB_TOKEN }} #Optional 
          zeit-team-id: team_XXXXXXXXXXX #Optional 
          now-args: '--prod' #Optional
          now-org-id: 'YOUR_ORG' #Required
          now-project-id: 'YOUR_PROJECT_ID' #Required 
          working-directory: ./sub-directory
```


### Agnular Example

See [.github/workflow/example-angular.yml](/.github/workflows/example-angular.yml) , 
