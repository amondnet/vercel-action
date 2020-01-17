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

### `zeit-token`

**required** ZEIT now token.

### `zeit-team-id`

This is required if your deployment is made on team project. example: `team_asdf1234`

### `github-token`

**required** This is required to comment on pull request.

### `now-args`

This is optional args for `now` cli. Example: `--prod`

## Outputs

### `preview-url`

The url of deployment preview.

## Example Usage

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
          github-token: ${{ secrets.GITHUB_TOKEN }}
          zeit-token: ${{ secrets.ZEIT_TOKEN }}
          zeit-team-id: team_XXXXXXXXXXX
          now-args: '--prod'
```


## specific working-directory

```yml
- uses: amondnet/now-deployment@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    zeit-token: ${{ secrets.ZEIT_TOKEN }}
    zeit-team-id: team_XXXXXXXXXXX
    now-args: '--prod'
    working-directory: ./sub-directory
```