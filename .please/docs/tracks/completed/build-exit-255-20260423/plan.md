# Plan: Fix build.sh exits with 255 on v42.2.0 API deployment

> Track: build-exit-255-20260423
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: build-exit-255-20260423
- **Issue**: #336
- **Created**: 2026-04-23
- **Approach**: Send `nowConfig` (from user's `vercel.json`) and `projectSettings` (rootDirectory + nodeVersion from `package.json`) in the deployment body, matching what `vercel@50.0.0` CLI does at `packages/cli/src/commands/deploy/index.ts:494-571`.

## Purpose

Restore the CLI parity that v42.2.0 lost during the migration to `@vercel/client.createDeployment`. After this fix, the API path honors the user's `vercel.json` `buildCommand`/`installCommand`/`outputDirectory` etc., and projects with custom build scripts no longer need to pin `vercel-args: "--prod"` as a workaround.

## Context

- `src/vercel-api.ts:68-116` (`buildDeploymentOptions`) currently omits `nowConfig` and `projectSettings`.
- `src/vercel-api.ts:63` unconditionally sets `skipAutoDetectionConfirmation = true`; this stays because the real fix is sending proper config.
- No existing code reads `vercel.json` (verified via grep). This is net-new functionality.
- `ActionConfig` already exposes `workingDirectory`, `rootDirectory`, `vercelProjectId`, etc. (`src/config.ts`). We do not add new action inputs.
- Type `DeploymentOptions.projectSettings?: ProjectSettings` is already declared in `@vercel/client@17.2.65` (`packages/client/src/types.ts:201`). `nowConfig` is accepted by the Vercel REST API but not in `DeploymentOptions` — pass it the same way `src/vercel-api.ts:112` already passes `project` (via `Object.assign(options, { nowConfig })`).
- Existing test patterns: unit tests mock `@vercel/client` (`src/__tests__/vercel-api.test.ts:21-23`); integration tests run against `emulate.dev` (`src/__integration__/vercel-api.test.ts`).
- `dist/index.js` must be rebuilt and committed for any src change to reach GitHub Actions (per `CLAUDE.md`).

## Architecture Decision

**Extract a dedicated `src/project-config.ts` module** for reading filesystem config and building `{ nowConfig, projectSettings }`. Rationale:

- `src/vercel-api.ts` is already 255 LOC and owns HTTP client responsibilities. Mixing filesystem config reading into it would push it past the 300 LOC guideline in `AGENTS.md` and blur concerns.
- A separate module is directly testable against a tmp directory without having to mock the HTTP client path.
- Single responsibility: "produce the config subset that the deployment API expects, given a working directory".
- `buildDeploymentOptions()` in `vercel-api.ts` stays thin — it calls `buildProjectConfig(config)` and merges the returned fields into the existing options object using the same `Object.assign` pattern already used for `project` on line 112.

**Alternatives considered**:

- Inline in `vercel-api.ts` — rejected due to file-size and mixed-concerns reasons above.
- Read `vercel.json` in `getActionConfig()` — rejected because `ActionConfig` today is a flat mirror of action inputs; adding filesystem-derived fields blurs that contract.

**No ADR needed** — this is a localized bug fix following existing patterns, not a new architectural decision.

## Tasks

- [x] T001 Create `src/project-config.ts` with `readVercelJson(workingDirectory)` (file: src/project-config.ts, src/__tests__/project-config.test.ts) — reads `vercel.json` from resolved working directory. Returns parsed object on success, `null` when file is absent, throws `Error` with the file path on invalid JSON. Tests cover: present/absent/invalid-JSON cases and relative-path resolution via `workingDirectory` input.
- [x] T002 Add `readNodeVersion(workingDirectory)` to `src/project-config.ts` (file: src/project-config.ts, src/__tests__/project-config.test.ts) (depends on T001) — reads `package.json` from the same working directory and returns `engines.node` as a string, or `undefined` when missing/unreadable. Mirrors `vercel@50.0.0/packages/cli/src/commands/deploy/index.ts:541-558`. Tests cover: present/absent/unreadable cases.
- [x] T003 Add `buildProjectConfig(config)` to `src/project-config.ts` (file: src/project-config.ts, src/__tests__/project-config.test.ts) (depends on T001, T002) — returns `{ nowConfig?, projectSettings? }`. When `vercel.json` is present: strip `images`, set `nowConfig`. When `vercel.json.builds` is empty/absent (zero-config): set `projectSettings.rootDirectory` and `projectSettings.sourceFilesOutsideRootDirectory` from `config.rootDirectory`. Always populate `projectSettings.nodeVersion` when `readNodeVersion` returns a value. Returns empty object `{}` when there's nothing to contribute. Tests cover: vercel.json present with buildCommand, vercel.json present with `builds`, vercel.json absent, images stripped.
- [x] T004 Integrate `buildProjectConfig` into `VercelApiClient.buildDeploymentOptions` (file: src/vercel-api.ts, src/__tests__/vercel-api.test.ts) (depends on T003) — call `buildProjectConfig(config)` and merge the returned `{ nowConfig, projectSettings }` into the deployment options via `Object.assign(options, projectConfig)`. Keep the existing `skipAutoDetectionConfirmation = true`. Tests cover: deploy POST body includes `nowConfig.buildCommand` when `vercel.json` defines it; deploy POST body omits `nowConfig` when `vercel.json` is absent (assert via `mockCreateDeployment` call args, using a tmp working directory fixture).
- [x] T005 Integration test against emulator — deploy with `vercel.json` containing `buildCommand` (file: src/__integration__/vercel-api.test.ts) (depends on T004) — create a tmp project dir containing `vercel.json` (`{"buildCommand": "./build.sh"}`) and a dummy executable `build.sh`, point `workingDirectory` at it, run `client.deploy()`, and assert the emulator receives a deployment request with `nowConfig.buildCommand === "./build.sh"`. Handle emulator flakiness consistently with the existing `emulatorErrors` pattern at `src/__integration__/vercel-api.test.ts:145-153`.
- [x] T006 Rebuild `dist/` via `pnpm run build` and commit the bundled output (file: dist/index.js) (depends on T004, T005) — required for the action to ship. Verify with `git diff --stat dist/index.js` that the changes correspond to the src-level edits. Check `dist/index.js` size increase is proportional (not bundler regression).
- [x] T007 Update `README.md` and add a `CHANGELOG`-worthy note (file: README.md) (depends on T006) — brief 2-3 line note under the API Deployment Inputs section that `vercel.json` `buildCommand`/`installCommand`/`outputDirectory` are now honored by the API path (fixing #336). Link to the issue.

## Key Files

- `src/vercel-api.ts:63` — `skipAutoDetectionConfirmation = true`. Unchanged.
- `src/vercel-api.ts:68-116` — `buildDeploymentOptions`. T004 extends this.
- `src/vercel-api.ts:107-113` — existing `Object.assign(options, { project: ... })` precedent. T004 follows this pattern.
- `src/config.ts:69-105` — `getActionConfig()`. Unchanged; existing `workingDirectory` and `rootDirectory` fields are reused.
- `src/__tests__/vercel-api.test.ts:21-23` — `vi.mock('@vercel/client')` pattern. T004 tests use this.
- `src/__integration__/vercel-api.test.ts:116-159` — existing deploy-integration-test shape. T005 adds alongside.
- `vercel@50.0.0/packages/cli/src/commands/deploy/index.ts:494-571` — reference implementation (not in this repo; `ask src npm:vercel@50.0.0` to fetch when needed).
- `@vercel/client@17.2.65/packages/client/src/types.ts:181-205` — `DeploymentOptions` type.

## Verification

Manual verification after T006 before marking the track done:

1. Build and invoke the action against a local Hugo-like fixture:
   ```bash
   pnpm install
   pnpm run all   # lint + build + test
   ```
2. Run unit + integration tests:
   ```bash
   pnpm test
   ```
3. Check `dist/index.js` is up to date:
   ```bash
   pnpm run build && git diff --stat dist/
   ```
4. End-to-end smoke: push to a test branch on a fork that has `vercel.json` with `"buildCommand": "./build.sh"` and an executable `build.sh`, and confirm the deployment succeeds (Vercel's remote build runs `./build.sh`). Document the run URL in `## Progress`.

## Progress

- **2026-04-23T21:47Z** — T001 완료: `src/project-config.ts`에 `readVercelJson()` 구현. 5개 단위 테스트 통과 (present/absent/invalid-JSON/relative-path/empty-workingDirectory).
- **2026-04-23T21:48Z** — T002 완료: `readNodeVersion()` 추가. 4개 단위 테스트 통과 (present/absent/missing-field/unreadable). 누락·손상된 package.json은 조용히 `undefined`를 반환(폼 오류로 배포 전체를 막지 않음).
- **2026-04-23T21:50Z** — T003 완료: `buildProjectConfig()` 추가. 7개 단위 테스트 통과 (buildCommand/builds/images 제거/absent/nodeVersion/rootDirectory/invalid-JSON). `ProjectSettings` 타입은 `@vercel/build-utils` 의존성 추가를 피하기 위해 로컬 구조적 타입으로 정의. Typecheck OK.
- **2026-04-23T21:53Z** — T004 완료: `buildDeploymentOptions()`에 `buildProjectConfig(config)` 통합. `nowConfig`는 `project`와 동일한 `Object.assign` 패턴으로, `projectSettings`는 정식 타입 필드로 병합. 5개 신규 테스트 통과 (buildCommand 전달 / vercel.json 부재 시 생략 / images 제거 / nodeVersion / 잘못된 JSON fail-fast). 전체 단위 테스트 200/200 통과, typecheck + lint OK.
- **2026-04-23T21:55Z** — T005 완료: 에뮬레이터 대상 통합 테스트 2개 추가 (tmp 프로젝트 + vercel.json buildCommand 정상 경로 / 잘못된 vercel.json fail-fast). `global-setup.ts`에 로컬 실행 시에도 integration suite가 돌도록 `GITHUB_REPOSITORY` / `GITHUB_ACTOR` 기본값 설정 (실제 CI 값이 있으면 덮어쓰지 않음). 전체 integration 17/17 통과.
- **2026-04-23T21:57Z** — T006 완료: `pnpm run build`로 `dist/index.js` 재빌드 후 커밋. 112줄 증가 (src 변경량에 비례). `buildProjectConfig`/`readVercelJson`/`readNodeVersion` 심볼 번들 포함 확인.
- **2026-04-23T21:58Z** — T007 완료: `README.md` API Deployment Inputs 섹션에 v42.3.0 주석 추가 — `vercel.json`(`buildCommand`/`installCommand`/`outputDirectory`/`framework`)과 `package.json engines.node`가 이제 API 경로로 전달되며, 기존 `vercel-args: "--prod"` workaround 불필요. `#336` 링크 포함.

## Decision Log

- **2026-04-23** — Chose Solution 1 (send `nowConfig` + `projectSettings`) over Solution 2 (route to CLI when `vercel.json` is present) and Solution 3 (conditionally skip `skipAutoDetectionConfirmation`). Solution 1 is the only fix that addresses the root cause and keeps API as the default path.
- **2026-04-23** — Extracted filesystem config reading into a new `src/project-config.ts` module rather than inlining into `src/vercel-api.ts`, to stay under the 300 LOC file guideline and isolate filesystem I/O from HTTP client responsibilities.

## Surprises & Discoveries

- `@vercel/client` DOES preserve POSIX file mode (mode is read via `fs.lstat` and sent in the `PreparedFile` manifest at `packages/client/src/utils/index.ts:413`). The initial executable-bit-loss hypothesis was wrong; confirmed by reading the pinned version of `@vercel/client@17.2.65` via `ask src`.
- `nowConfig` is accepted by the Vercel REST API but is not in the `DeploymentOptions` TypeScript type. It must be passed using the same `Object.assign` escape hatch as `project` (already used in `src/vercel-api.ts:112`).
- Multiple sibling v42.2.0 issues (#341, #342, #343, #345) share the same root cause of CLI↔API parity gaps. Fixing this track should reduce the surface of some of those, but each is tracked separately.

## Outcomes & Retrospective

### What Was Shipped

- `src/project-config.ts` — new module with `readVercelJson()`, `readNodeVersion()`, `buildProjectConfig()`.
- `src/vercel-api.ts` — `buildDeploymentOptions()` now forwards `nowConfig` + `projectSettings` to `@vercel/client.createDeployment`, restoring CLI parity.
- `images` field stripped from `nowConfig`; malformed `vercel.json` fails fast.
- 16 new unit tests (200/200 green) + 2 new integration tests against `emulate.dev` (17/17 green).
- `dist/index.js` rebuilt (+112 lines, proportional to src).
- `README.md` API Deployment Inputs section updated with v42.3.0 note referencing #336.
- PR #350 opened against `master`, linked to #336.

### What Went Well

- Root-cause investigation pinpointed the exact CLI reference (`vercel@50.0.0/packages/cli/src/commands/deploy/index.ts:494-571`) before writing any code. The fix became a straight port.
- Isolating filesystem I/O in a new module kept `src/vercel-api.ts` under the 300 LOC guideline and made the new logic unit-testable without mocking the HTTP client.
- TDD against a tmp-directory fixture caught the `images`-stripping requirement and the relative-path resolution case early.
- Emulator integration tests use the same flakiness-tolerant pattern as the existing suite, so no new infra was needed.

### What Could Improve

- The initial hypothesis (executable-bit loss) was wrong; a faster way to verify pinned dependency behavior up-front would have saved one investigation pass. `ask src npm:<pkg>@<version>` worked but was the second tool reached for, not the first.
- `nowConfig` not being in the `DeploymentOptions` TypeScript type required the same `Object.assign` escape hatch already used for `project`. Worth tracking upstream: a PR to `@vercel/client` types would remove the cast for this repo and every downstream consumer.
- No contract test between this repo and `@vercel/client`'s accepted POST body shape — if the Vercel API drops `nowConfig` support, only a live deploy would catch it. Acceptable for now (deploys go through CI on every merge), but something to revisit if this gets brittle.

### Tech Debt Created

- None introduced by this track. One pre-existing item is surfaced: the `Object.assign` escape hatch for fields missing from `DeploymentOptions` (`project`, now `nowConfig`) would read cleaner as a typed `ExtendedDeploymentOptions` interface once we're willing to own that abstraction. Not blocking.
- Sibling v42.2.0 regressions (#341, #342, #343, #345) remain open. This track does not regress them and reduces the shared root-cause surface, but each needs its own investigation + fix.
