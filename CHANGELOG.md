# Changelog

## [v20.0.0](https://github.com/amondnet/vercel-action/tree/v20.0.0) (2020-11-30)

[Full Changelog](https://github.com/amondnet/vercel-action/compare/v19.0.1+4...v20.0.0)

**Implemented enhancements:**

- add support to pull\_request\_target event [\#47](https://github.com/amondnet/vercel-action/pull/47) ([nionis](https://github.com/nionis))

**Closed issues:**

- Error: ENOENT [\#51](https://github.com/amondnet/vercel-action/issues/51)
- Deployment is always done on the same branch refs/heads/develop [\#48](https://github.com/amondnet/vercel-action/issues/48)

**Merged pull requests:**

- chore\(README\): Update deployment script path [\#49](https://github.com/amondnet/vercel-action/pull/49) ([richardtapendium](https://github.com/richardtapendium))
- chore\(deps\): vercel cli v20.1.1 [\#41](https://github.com/amondnet/vercel-action/pull/41) ([amondnet](https://github.com/amondnet))

## [v19.0.1+4](https://github.com/amondnet/vercel-action/tree/v19.0.1+4) (2020-10-13)

[Full Changelog](https://github.com/amondnet/vercel-action/compare/v19...v19.0.1+4)

**Closed issues:**

- `set-env` command is deprecated and will be disabled soon [\#42](https://github.com/amondnet/vercel-action/issues/42)

**Merged pull requests:**

- fix: deprecating set-env and add-path commands [\#43](https://github.com/amondnet/vercel-action/pull/43) ([amondnet](https://github.com/amondnet))
- Fix prod\_or\_not in example-static [\#37](https://github.com/amondnet/vercel-action/pull/37) ([olivercoad](https://github.com/olivercoad))
- feat: improve slugify [\#34](https://github.com/amondnet/vercel-action/pull/34) ([ocavue](https://github.com/ocavue))
- Update README.md [\#33](https://github.com/amondnet/vercel-action/pull/33) ([zdhz](https://github.com/zdhz))

## [v19.0.1+3](https://github.com/amondnet/vercel-action/tree/v19.0.1+3) (2020-08-12)

[Full Changelog](https://github.com/amondnet/vercel-action/compare/v19.0.1+2...v19.0.1+3)

**Fixed bugs:**

- Deployment succeeds but action log says it failed [\#27](https://github.com/amondnet/vercel-action/issues/27)
- fix: use scope everywhere npx is used [\#24](https://github.com/amondnet/vercel-action/pull/24) ([aulneau](https://github.com/aulneau))

**Closed issues:**

- Deploy is failing [\#28](https://github.com/amondnet/vercel-action/issues/28)
- Not deploying to production [\#22](https://github.com/amondnet/vercel-action/issues/22)
- Alias does not incorporate scope [\#23](https://github.com/amondnet/vercel-action/issues/23)

**Merged pull requests:**

- build\(deps\): bump elliptic from 6.5.2 to 6.5.3 in /example/angular [\#25](https://github.com/amondnet/vercel-action/pull/25) ([dependabot[bot]](https://github.com/apps/dependabot))
- build\(deps\): bump lodash from 4.17.15 to 4.17.19 in /example/angular [\#20](https://github.com/amondnet/vercel-action/pull/20) ([dependabot[bot]](https://github.com/apps/dependabot))
- Fix latest "inspect" bug by adding manual Vercel Project Name option [\#29](https://github.com/amondnet/vercel-action/pull/29) ([EvanLovely](https://github.com/EvanLovely))

## [v19.0.1+2](https://github.com/amondnet/vercel-action/tree/v19.0.1+2) (2020-07-24)

[Full Changelog](https://github.com/amondnet/vercel-action/compare/v19.0.1+1...v19.0.1+2)

**Implemented enhancements:**

- feat: alias domain to deployment [\#7](https://github.com/amondnet/vercel-action/issues/7)
- feat: alias domain to deployment [\#18](https://github.com/amondnet/vercel-action/pull/18) ([amondnet](https://github.com/amondnet))

**Fixed bugs:**

- Don't send new comment for every pushed commit and just edit existed one [\#15](https://github.com/amondnet/vercel-action/issues/15)

**Closed issues:**

- There was an error when attempting to execute the process [\#16](https://github.com/amondnet/vercel-action/issues/16)
- Custom env in action [\#13](https://github.com/amondnet/vercel-action/issues/13)
- Action fails even when build succeeds [\#11](https://github.com/amondnet/vercel-action/issues/11)
- Failed to find deployment \(url\) in \(user\) [\#10](https://github.com/amondnet/vercel-action/issues/10)
- Error! Project not found [\#9](https://github.com/amondnet/vercel-action/issues/9)
- New release [\#19](https://github.com/amondnet/vercel-action/issues/19)

**Merged pull requests:**

- build\(deps\): bump @actions/http-client from 1.0.6 to 1.0.8 [\#6](https://github.com/amondnet/vercel-action/pull/6) ([dependabot[bot]](https://github.com/apps/dependabot))
- fix: don't send new comment for every pushed commit and just edit exi… [\#17](https://github.com/amondnet/vercel-action/pull/17) ([amondnet](https://github.com/amondnet))
- chore: fix broken workflow\(s\) link [\#14](https://github.com/amondnet/vercel-action/pull/14) ([shunkakinoki](https://github.com/shunkakinoki))
- build\(deps\): bump websocket-extensions from 0.1.3 to 0.1.4 in /example/angular [\#12](https://github.com/amondnet/vercel-action/pull/12) ([dependabot[bot]](https://github.com/apps/dependabot))

## [v19.0.1+1](https://github.com/amondnet/vercel-action/tree/v19.0.1+1) (2020-05-18)

[Full Changelog](https://github.com/amondnet/vercel-action/compare/v19.0.1...v19.0.1+1)

**Fixed bugs:**

- fix: vercel inspect fails in team scope [\#5](https://github.com/amondnet/vercel-action/pull/5) ([amondnet](https://github.com/amondnet))

## [v19.0.1](https://github.com/amondnet/vercel-action/tree/v19.0.1) (2020-05-18)

[Full Changelog](https://github.com/amondnet/vercel-action/compare/v2...v19.0.1)

**Fixed bugs:**

- Remove double https:// [\#3](https://github.com/amondnet/vercel-action/pull/3) ([sunderipranata](https://github.com/sunderipranata))

**Merged pull requests:**

- refactor: eslint [\#2](https://github.com/amondnet/vercel-action/pull/2) ([amondnet](https://github.com/amondnet))
- feat: rename to vercel [\#1](https://github.com/amondnet/vercel-action/pull/1) ([amondnet](https://github.com/amondnet))


---

# ZEIT Now Deplyoment Changelog

## [v2.0.3](https://github.com/amondnet/now-deployment/tree/v2.0.3) (2020-05-06)

[Full Changelog](https://github.com/amondnet/now-deployment/compare/v2.0.2...v2.0.3)

**Implemented enhancements:**

- Show project name in Github comment [\#44](https://github.com/amondnet/now-deployment/pull/44) ([rodrigorm](https://github.com/rodrigorm))

**Closed issues:**

- Update now version to v18 [\#41](https://github.com/amondnet/now-deployment/issues/41)

**Merged pull requests:**

- docs: basic auth example [\#46](https://github.com/amondnet/now-deployment/pull/46) ([amondnet](https://github.com/amondnet))
- build: now@18.0.0 [\#45](https://github.com/amondnet/now-deployment/pull/45) ([amondnet](https://github.com/amondnet))

## [v2.0.2](https://github.com/amondnet/now-deployment/tree/v2.0.2) (2020-04-04)

[Full Changelog](https://github.com/amondnet/now-deployment/compare/v2.0.1...v2.0.2)

**Implemented enhancements:**

- team\_id seems to be not working [\#19](https://github.com/amondnet/now-deployment/issues/19)

**Fixed bugs:**

- undefined url on pull request comment [\#37](https://github.com/amondnet/now-deployment/issues/37)
- Branch is undefined [\#31](https://github.com/amondnet/now-deployment/issues/31)
- Outputs object is always empty [\#25](https://github.com/amondnet/now-deployment/issues/25)
- Fix empty output object [\#38](https://github.com/amondnet/now-deployment/pull/38) ([hakonkrogh](https://github.com/hakonkrogh))
- fix: branch is undefined [\#33](https://github.com/amondnet/now-deployment/pull/33) ([amondnet](https://github.com/amondnet))

**Closed issues:**

- Validation failed: commit\_id has been locked when deploying multiple projects [\#21](https://github.com/amondnet/now-deployment/issues/21)

**Merged pull requests:**

- chore\(release\): 2.0.2  [\#39](https://github.com/amondnet/now-deployment/pull/39) ([amondnet](https://github.com/amondnet))
- docs\(README\): Update documentation regarding github secrets [\#35](https://github.com/amondnet/now-deployment/pull/35) ([amalv](https://github.com/amalv))

## [v2.0.1](https://github.com/amondnet/now-deployment/tree/v2.0.1) (2020-02-25)

[Full Changelog](https://github.com/amondnet/now-deployment/compare/v2.0.0...v2.0.1)

**Fixed bugs:**

- fix: outputs object is always empty [\#29](https://github.com/amondnet/now-deployment/pull/29) ([amondnet](https://github.com/amondnet))

**Closed issues:**

- How can I deploy with an assigned domain? [\#30](https://github.com/amondnet/now-deployment/issues/30)
- Add instruction on getting `project\_id` and `org\_id` [\#27](https://github.com/amondnet/now-deployment/issues/27)

**Merged pull requests:**

- docs: how to get organization and project id of project [\#28](https://github.com/amondnet/now-deployment/pull/28) ([amondnet](https://github.com/amondnet))

## [v2.0.0](https://github.com/amondnet/now-deployment/tree/v2.0.0) (2020-02-18)

[Full Changelog](https://github.com/amondnet/now-deployment/compare/v1.2.0...v2.0.0)

**Implemented enhancements:**

- Do not want to receive comments from action [\#14](https://github.com/amondnet/now-deployment/issues/14)
- Support for Vercel CLI v17 [\#24](https://github.com/amondnet/now-deployment/issues/24)
- feat: now cli v17, add `NOW\_PROJECT\_ID` and `NOW\_ORG\_ID` env variable [\#26](https://github.com/amondnet/now-deployment/pull/26) ([amondnet](https://github.com/amondnet))

**Fixed bugs:**

- Deploy stalled [\#23](https://github.com/amondnet/now-deployment/issues/23)

**Closed issues:**

- Can I upload the contents of a folder with pre-built assets? [\#22](https://github.com/amondnet/now-deployment/issues/22)
- getting 403 error every time it tries to comment [\#18](https://github.com/amondnet/now-deployment/issues/18)
- Feature: Ability to specify path for --local-config flag [\#16](https://github.com/amondnet/now-deployment/issues/16)

## [v1.2.0](https://github.com/amondnet/now-deployment/tree/v1.2.0) (2020-01-28)

[Full Changelog](https://github.com/amondnet/now-deployment/compare/v1...v1.2.0)

**Implemented enhancements:**

- feat: github comment optional [\#20](https://github.com/amondnet/now-deployment/pull/20) ([amondnet](https://github.com/amondnet))

## [v1.1.0](https://github.com/amondnet/now-deployment/tree/v1.1.0) (2020-01-17)

[Full Changelog](https://github.com/amondnet/now-deployment/compare/v1.0.1...v1.1.0)

**Implemented enhancements:**

- feature: add working dir input [\#17](https://github.com/amondnet/now-deployment/pull/17) ([foxundermoon](https://github.com/foxundermoon))

**Fixed bugs:**

- Built with commit undefined [\#9](https://github.com/amondnet/now-deployment/issues/9)
- Add  prod args have an error invalidTagName [\#6](https://github.com/amondnet/now-deployment/issues/6)
- fix: built with commit undefined [\#10](https://github.com/amondnet/now-deployment/pull/10) ([amondnet](https://github.com/amondnet))
- fix now-args bug [\#8](https://github.com/amondnet/now-deployment/pull/8) ([foxundermoon](https://github.com/foxundermoon))
- Update action.yml [\#7](https://github.com/amondnet/now-deployment/pull/7) ([foxundermoon](https://github.com/foxundermoon))
- fix: commit author [\#4](https://github.com/amondnet/now-deployment/pull/4) ([amondnet](https://github.com/amondnet))
- fix: typo in argument  [\#3](https://github.com/amondnet/now-deployment/pull/3) ([amalv](https://github.com/amalv))

**Closed issues:**

- Can't unlink a previous Org connection if I no longer have access to org [\#15](https://github.com/amondnet/now-deployment/issues/15)
- How to deploy from other folders such as build [\#13](https://github.com/amondnet/now-deployment/issues/13)
- Deployment succeeds but workflow reports failure [\#12](https://github.com/amondnet/now-deployment/issues/12)

**Merged pull requests:**

- release: v1 [\#1](https://github.com/amondnet/now-deployment/pull/1) ([amondnet](https://github.com/amondnet))



\* *This Changelog was automatically generated by [github_changelog_generator](https://github.com/github-changelog-generator/github-changelog-generator)*


\* *This Changelog was automatically generated by [github_changelog_generator](https://github.com/github-changelog-generator/github-changelog-generator)*
