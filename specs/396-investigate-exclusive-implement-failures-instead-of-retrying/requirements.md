# Defect Report: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

## Bug Report

An exclusive implement worker can advance the issue branch, close, and leave a failed implement handoff while the execute checkpoint still names the pre-worker HEAD. Parameter-free execute then reports `checkpoint_head_mismatch`. Replaying ordinary implement would start again at T001, while the completed work already exists at the descendant HEAD.

## Reproduction

PathCast issue #81 has checkpoint HEAD `308f5d152781277cfb00db419d3c25d40686a86c`, current descendant HEAD `a5b125269a027322c382556149a9015b519d2802`, branch `81-suppress-stale-concurrent-route-display-errors`, empty workers, one incomplete owner whose id equals the run id, and a failed implement handoff. T001 and T002 are already committed. T003 requires `specs/81-stale-displayroute-error/verification-report.md`, but `inspectPublicationScope` currently forces every `specs/` path read-only.

## Expected Behavior

Execute recognizes this closed exclusive worker as a one-shot investigative resume. Discovery remains read-only. Parameter-free run re-proves the state under lease, archives and consumes the failed handoff, advances the checkpoint to the current descendant HEAD, and starts the same `sN-implement` identity with a prompt that identifies satisfied, remaining-authorized, and blocked work before editing. The same recovery can never replay.

## Actual Behavior

Recovery stops at `checkpoint_head_mismatch`. Ordinary redispatch would replay fresh implement work and can exhaust the same unchanged prerequisite again. An explicitly authorized verification report cannot be created because its spec path is classified read-only.

## Acceptance Criteria

### AC1: Discover safe exclusive implement resume
**Given** an exclusive implement failure, an issue-branch current HEAD descended from or equal to `run.head`, a unique incomplete owner whose id equals `runId`, empty workers, and a failed implement handoff
**When** `discover-recovery` runs
**Then** it reports `loop-recovery-available` with recovery class `exclusive_implement_resume` and mutates no checkpoint, handoff, or safe-recovery evidence.

### AC2: Consume and dispatch the resume once
**Given** exclusive implement resume discovery
**When** parameter-free `run` acquires the controller lease
**Then** it re-proves the state, archives the failed handoff, consumes one `exclusive_implement_resume` record, CAS-updates `run.head` to current HEAD, clears `failed`, removes remediation state, and starts exactly `sN-implement` with `exclusiveResumePrompt`, never `workerPrompt`, `remediationPrompt`, or `rN-implement`.

### AC3: Investigate before editing
**Given** an exclusive resume worker prompt
**When** the worker begins
**Then** it maps every `tasks.md` acceptance bullet to already satisfied, remaining authorized work, or a still-blocked prerequisite before any edit; does not re-implement satisfied tasks; does not reset, rebase, or discard current HEAD; and does not repeat a previously recorded prerequisite while the current owner-bound probe still forbids it.

### AC4: Preserve repaired-publication recovery
**Given** exact checkpoint HEAD plus a tasks.md-only `Files` to `File(s)` repair
**When** recovery is discovered and consumed
**Then** it remains `repaired_publication_intervention` and dispatches ordinary implement without the exclusive-resume header.

### AC5: Unsafe evidence stays blocked
**Given** a wrong branch, live worker, non-ancestor HEAD, missing unique owner, or previously consumed exclusive recovery
**When** execute evaluates recovery
**Then** it remains blocked and starts no worker.

### AC6: Authorized verification report is writable
**Given** implement `tasks.md` lists `specs/{N}-{slug}/verification-report.md (Create)` under `**File(s)**`
**When** publication scope is inspected
**Then** that exact path is in `trackedWritablePaths` and `allowedPaths`, not `readOnlyPaths`, while all other spec inputs remain read-only.

### AC7: Failed consumed resume cannot replay
**Given** a consumed exclusive resume whose worker writes another failed implement handoff
**When** parameter-free `run` runs again
**Then** it reports consumed recovery and starts no second worker.

## Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR1 | Classify only a proven closed exclusive implement owner on the exact issue branch with ancestor-or-equal HEAD. | Must |
| FR2 | Consume the recovery before one investigative `sN-implement` dispatch and advance checkpoint HEAD by CAS. | Must |
| FR3 | Preserve durable no-replay semantics for the same run, issue, and implement step. | Must |
| FR4 | Keep repaired-publication classification and prompt behavior unchanged. | Must |
| FR5 | Allow only an explicitly listed issue verification report operation through implement publication scope. | Must |

## Scope

In scope: execute recovery classifier, exclusive resume prompt and dispatch, focused publication-scope exception, regression tests, execute/write-code workflow contracts, changelog, and patch version.

Out of scope: PathCast product edits, nmg-sdlc self-execute, fresh implement replay, remediation dispatch, checkpoint reset, or changes to unrelated safe-recovery owners.
