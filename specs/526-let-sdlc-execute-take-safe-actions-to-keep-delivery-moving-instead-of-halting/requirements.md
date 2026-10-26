# Requirements: Let /sdlc-execute take safe actions to keep delivery moving instead of halting

**Issue**: #526
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## User Story

**As a** developer running `/sdlc-execute`
**I want** the supervisor to take any safe, reversible action that moves delivery forward, at any stage, without asking me
**So that** delivery keeps going whenever I would have made the same fix myself

## Background

The rendered execute workflow (`workflows/execute/WORKFLOW.md`) permits environment repair only for failed verify reports, describes `halt` as "No worker can fix it, or the person must act", and tells the supervisor to report and stop on any non-report controller exit. Blockers such as untracked `.nmg-sdlc/` runtime failing start with `dirty_tree`, a stopped port forward, a hung test process, a transient GitHub failure ending the controller with `pr_evidence_unavailable`, a PR reported `merge_blocked_by_external_policy` while its required check is still running, and `decide`/`wait` failing with `execute_session_unknown` when run from a subdirectory all have safe, reversible fixes the supervisor can apply itself. The workflow must direct it to apply them and continue, and to halt only when the person has to act. The decision commands and the report output contract are unchanged.

## Acceptance Criteria

### AC1: Any safe, reversible, progressing action at every stage

**Given** a stage or check-in report at any stage (start, implement, verify, deliver), or a non-report controller exit
**When** the supervisor finds a blocker it can clear itself
**Then** the rendered execute workflow authorizes it to take, without asking the person, any action that is safe, reversible, and moves the issue toward delivery of its spec, whether or not that action appears among the examples
**And** defines safe and reversible as: it changes no tracked repository file, loses no work or data that cannot be regenerated, and touches no shared or production system
**And** tells it to continue afterward with `prompt` (live worker), `redispatch` with guidance that names the action taken, or a rerun of `supervise` for a controller that already exited

### AC2: Illustrative examples, not an allowlist

**Given** the rendered execute workflow
**When** a reader looks up what the supervisor may do without asking
**Then** the workflow states that the examples illustrate the AC1 rule and are not an exhaustive list
**And** the examples include at least:
- start or restart the local container/Kubernetes runtime (for example Rancher Desktop via `rdctl`)
- boot an iOS simulator or Android emulator
- restart a stopped host service or port forward
- stop a hung test or build process the run itself started
- add `.nmg-sdlc/` to `.git/info/exclude` when untracked plugin runtime is the only dirt
- wait for a transient network or GitHub failure to clear, then rerun `supervise` (which resumes from live evidence)
- wait for still-running required PR checks to finish, then `redispatch` deliver
- run every `supervise`/`decide`/`wait` command from the project root
- free regenerable caches when the disk is full

### AC3: Halt is narrowed

**Given** the rendered execute workflow
**When** a reader looks up when to `halt`
**Then** `halt` is limited to:
- a login or credential the person must enter interactively
- a product or spec decision
- an action that is destructive, irreversible, or touches shared or production systems
- a blocker still present after a remediation based on a different hypothesis

### AC4: Hard boundaries preserved

**Given** the rendered execute workflow
**When** the supervisor applies a remediation
**Then** the workflow still forbids editing product code, specs or other tracked repository files, committing, pushing, opening PRs, bypassing branch protection or required checks, and `herdr server stop`
**And** delivery still requires the full-green registered gate at the exact source head

### AC5: Hung worker command

**Given** a check-in shows no pane or token progress while a process the worker started has used ~0% CPU for several minutes
**When** the supervisor inspects the report
**Then** the workflow tells it to check process activity and either stop the hung process or `prompt` the worker with that diagnosis, instead of choosing `continue` again

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Replace the verify-only environmental section with a stage-independent "Safe actions" section that states the AC1 rule (any safe, reversible action that progresses delivery, without asking) and gives the AC2 examples as non-exhaustive illustrations | Must |
| FR2 | Tell the supervisor to rerun `supervise` after a non-report controller exit caused by a transient or remediated condition | Must |
| FR3 | Narrow the `halt` decision text to the AC3 cases | Must |
| FR4 | Keep the AC4 prohibitions and gate requirements in force | Must |
| FR5 | Add hung-process diagnosis guidance to check-in handling (AC5) | Should |
| FR6 | Add a contract test that asserts the rendered execute workflow content for AC1–AC5 | Must |

## Out of Scope

- Automating interactive logins or acquiring credentials
- Deterministic controller changes (retry helpers, ruleset check detection, cwd normalization, earlier authentication detection)
- Editing or bypassing rulesets, admin merges
- Changes to the decision commands or the report output contract

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #526 | 2026-10-26 | Initial feature spec |
