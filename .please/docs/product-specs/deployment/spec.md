---
id: SPEC-002
level: V_M
domain: deployment
feature: spec
depends: []
conflicts: []
traces: []
created_at: 2026-04-30T00:58:55Z
updated_at: 2026-04-30T00:58:55Z
source_tracks: ["cli-default-experimental-api-20260430"]
---

# Deployment Mode Specification

## Purpose

Defines how the action selects and runs a Vercel deployment. The default path is the stable Vercel CLI; an opt-in experimental API path using `@vercel/client` is available for users who accept the risk of an internal Vercel package without semver guarantees.

## Requirements

### Requirement: experimental-api input

The system MUST expose an `experimental-api` boolean action input that defaults to `false`.

#### Scenario: experimental-api input

- GIVEN the action is invoked from a workflow
- WHEN the user does not set `experimental-api`
- THEN the action behaves as if `experimental-api: false` had been set explicitly

### Requirement: CLI is the default deployment client

The system MUST route to the Vercel CLI client (`VercelCliClient`) whenever `experimental-api` is `false` or unset, regardless of whether `vercel-args` is provided.

#### Scenario: CLI is the default deployment client

- GIVEN `experimental-api` is `false` or unset
- WHEN the action selects a deployment client
- THEN it returns `VercelCliClient` and logs `Using CLI-based deployment`

### Requirement: experimental API opt-in with warning

The system MUST route to the API client (`VercelApiClient`) only when `experimental-api` is `true`, and MUST emit a single `core.warning` per run stating that API mode is experimental and may break across `@vercel/client` updates.

#### Scenario: experimental API opt-in with warning

- GIVEN `experimental-api` is `true`
- WHEN the action selects a deployment client
- THEN it returns `VercelApiClient` and emits exactly one `core.warning` referencing `@vercel/client` and the experimental nature

### Requirement: mutual exclusion of experimental-api and vercel-args

The system MUST fail fast at config-parse time with a clear error naming both inputs when `experimental-api` is `true` and `vercel-args` is non-empty.

#### Scenario: mutual exclusion of experimental-api and vercel-args

- GIVEN `experimental-api: true` and `vercel-args: --prod` are both set
- WHEN the action parses inputs
- THEN it throws a configuration error before any deployment side effects, mentioning both `experimental-api` and `vercel-args`

### Requirement: legacy vercel-args passthrough preserved

The system MUST honor the existing `vercel-args` CLI passthrough when `experimental-api` is `false`, routing to `VercelCliClient` and forwarding the args verbatim.

#### Scenario: legacy vercel-args passthrough preserved

- GIVEN `experimental-api` is `false` and `vercel-args` contains a non-empty string
- WHEN the action runs
- THEN `VercelCliClient` is constructed and the provided args are passed to the underlying `vercel` CLI invocation

### Requirement: typed config carries the deployment mode

The system MUST surface the deployment mode on `ActionConfig` as a discriminated union (`{ kind: 'cli', vercelArgs }` or `{ kind: 'experimental-api' }`) so that the (`experimental-api`, `vercel-args`) mutual-exclusion is unrepresentable at the type level.

#### Scenario: typed config carries the deployment mode

- GIVEN `getActionConfig()` parses raw action inputs
- WHEN the parsing succeeds
- THEN the returned `ActionConfig.deployment` is exactly one variant of the union and the variant matches the user's input

### Requirement: action.yml input metadata is accurate

The system MUST keep `action.yml` input descriptions and deprecation messages aligned with the current routing semantics — `vercel-args` and `scope` are not deprecated under the CLI-default model, while legacy `zeit-*` / `now-*` inputs remain deprecated.

#### Scenario: action.yml input metadata is accurate

- GIVEN a user reads `action.yml` in their editor or browser
- WHEN they look at `vercel-args`, `scope`, and `experimental-api`
- THEN each has a meaningful description, no misleading deprecation copy on `vercel-args` / `scope`, and the `experimental-api` description names the mutual-exclusion rule

### Requirement: README documents the deployment mode

The system MUST provide README documentation that explains the CLI default, the `experimental-api` opt-in, the experimental warning, the mutual-exclusion rule, and a migration note for users coming from the previous API-default behavior.

#### Scenario: README documents the deployment mode

- GIVEN a user opens README.md to learn how to deploy
- WHEN they read the "Deployment Mode" section
- THEN they see CLI documented as the default, `experimental-api: true` documented as the opt-in, the warning text quoted, the mutual-exclusion rule stated, and a migration note for previous v42 users

## Non-functional Requirements

### Requirement: behavior parity for API mode outputs

The system SHOULD preserve deployment output parity (`preview-url`, `preview-name`, `deployment-id`) between API mode and the previous API-default behavior whenever `experimental-api: true` is set.

### Requirement: semver MINOR release for the routing change

The system SHOULD ship the routing-default change as a semver MINOR release. No public API contract is broken; only default behavior shifts. The migration is documented in release notes and the README.

### Requirement: test coverage for routing and config parsing

The system SHOULD maintain ≥80% test coverage for the routing factory and the new config-parsing logic, including the four-case routing matrix and the mutual-exclusion error.
