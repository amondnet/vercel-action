# ZEIT Now Deployment

> ZEIT Now is a cloud platform for static sites and Serverless Functions

This action make a deployment with github actions instead of ZEIT Now builder. 

- [x] Deploy to ZEIT now.
- [x] Comment on pull request.
- [ ] Create Deployment on github.

## Result

![preview](./preview.png)

[pull request example](https://github.com/amondnet/now-deployment/pull/2)

## Inputs

### `zeit-token`

**required** ZEIT now token.

### `zeit-team-id`

This is required if your deployment is made on team project. example: `team_asdf1234`

### `github-token`

**required** This is required to comment on pull request.

## Outputs

### `preview-url`

The url of deployment preview.

## Example Usage

* This is a complete `.github/workflow/deploy.yml` example.

```yaml
name: deploy website preview
on: [pull_request]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - uses: amondnet/now-deployment-comment@release/v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          zeit-token: ${{ secrets.ZEIT_TOKEN }}
          zeit-team-id: team_XXXXXXXXXXX
```
