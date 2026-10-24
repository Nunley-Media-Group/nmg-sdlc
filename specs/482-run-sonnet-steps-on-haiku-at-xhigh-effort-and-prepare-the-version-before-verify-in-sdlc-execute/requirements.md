# Requirements: Run Sonnet steps on Haiku at xhigh effort and prepare the version before verify in /sdlc-execute

**Issue**: #482
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## User Story

**As a** developer delivering issues with `/sdlc-execute`
**I want** the steps that ran on Sonnet to run on Haiku at `xhigh` effort, and every delivery to release a new version
**So that** no step runs on Sonnet, and `/plugin update` offers each delivered change

## Background

#464 assigned `sonnet` to the execute `implement` and `deliver` stages, to `/sdlc-open-pr`, and to the `spec-implementer` and `deliverer` subagents. The owner wants those steps on `haiku` at effort `xhigh`. The `claude` CLI accepts `--effort low|medium|high|xhigh|max`, and command and agent frontmatter accept an `effort` key.

#469 merged with `VERSION` still at 4.2.2. `scripts/sdlc-deliver.mjs prepare-version` bumps `VERSION`, its declared mirrors, and `CHANGELOG.md` in one `feat|fix: deliver issue #N` commit, and the workflow requires that commit before final verification. The `/sdlc-execute` controller dispatches start, implement, verify, and deliver, and never runs `prepare-version`. Deliver runs after verify, when a version commit is forbidden, so execute deliveries never bumped. 4.2.0 through 4.2.2 were bumped by hand.

## Acceptance Criteria

### AC1: Sonnet steps move to Haiku at xhigh

**Given** `src/host-events.mjs`
**When** the step tables are read
**Then** `SDLC_MODELS.stages.implement`, `SDLC_MODELS.stages.deliver`, and `SDLC_MODELS.commands["sdlc-open-pr"]` are `haiku`
**And** `SDLC_EFFORTS` assigns `xhigh` to stages `implement` and `deliver` and to command `sdlc-open-pr`, and assigns no other step

### AC2: Stage workers start with their effort

**Given** an issue with no recorded repairable failure in the current invocation
**When** `/sdlc-execute` dispatches start, implement, verify, and deliver workers
**Then** implement and deliver workers start with `--model haiku --effort xhigh`
**And** start and verify workers get no `--effort`
**And** a repair re-dispatch starts with `--model opus` and no `--effort`

### AC3: `/sdlc-open-pr` declares its effort

**Given** the generated `commands/sdlc-open-pr.md`
**When** Claude Code loads it
**Then** its frontmatter declares `model: haiku` and `effort: xhigh`
**And** the file equals `renderAutomatedCommandMarkdown` output, while `/sdlc-status` and `/sdlc-verify-code` declare no `effort`

### AC4: Agents declare Haiku at xhigh

**Given** `agents/spec-implementer.md` and `agents/deliverer.md`
**When** Claude Code loads the plugin
**Then** each declares `model: haiku` and `effort: xhigh`
**And** the steering Agent Files table lists those values

### AC5: The controller prepares the version before verification

**Given** a clean, published issue branch with no pull request
**When** `/sdlc-execute` is about to dispatch verify or deliver
**Then** it runs `sdlc-deliver.mjs prepare-version --issue N --controller-run-id <id>` first
**And** when that changes the source head, the next dispatch is verify at the new head
**And** a repeated run after a repair makes no second version commit
**And** a failing preparation stops the run with `version_preparation_failed: <reason>` and starts no worker

### AC6: Delivery refuses an unprepared version

**Given** an issue branch with no pull request whose `VERSION` has no matching `deliver issue #N` commit and changelog entry
**When** `sdlc-deliver.mjs` delivers
**Then** it fails with `version_not_prepared` and `next: verify` before creating a pull request

### AC7: Documentation matches

**Given** `README.md`, `CONTRIBUTING.md`, `steering/snippets/project-tech.md`, `steering/snippets/project-structure.md`, `workflows/open-pr/WORKFLOW.md`, and `references/execute-implementable-requirements.md`
**When** a contributor reads them
**Then** they state the new models and efforts, `effort` as optional agent frontmatter, and version preparation before verification

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `SDLC_EFFORTS` in `src/host-events.mjs` is the only source of effort levels | Must |
| FR2 | `stageEffort(step, failure)` returns `undefined` for a repair re-dispatch and for a stage without an effort | Must |
| FR3 | Version preparation runs only on a clean, published branch with no pull request, and is idempotent | Must |
| FR4 | The registered gate always runs at the head that delivery merges | Must |

## Out of Scope

- Changing the Opus steps, the repair model, or the steps already on Haiku
- Setting effort for hooks-registered commands
- Bumping versions for pull requests that already exist when execute resumes

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #482 | 2026-10-24 | Initial feature spec |
