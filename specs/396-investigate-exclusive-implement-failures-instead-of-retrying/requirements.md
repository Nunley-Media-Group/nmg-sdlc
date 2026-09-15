# Defect Report: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

## Bug Report

An exclusive implement worker can advance the issue branch, close, and leave a failed implement handoff while the execute checkpoint still names the pre-worker HEAD. Parameter-free execute then reports `checkpoint_head_mismatch`. Replaying ordinary implement would start again at T001, while the completed work already exists at the descendant HEAD.

## Reproduction

PathCast issue #81 has checkpoint HEAD `308f5d152781277cfb00db419d3c25d40686a86c`, current strict-descendant HEAD `a5b125269a027322c382556149a9015b519d2802`, branch `81-suppress-stale-concurrent-route-display-errors`, empty workers, one incomplete owner whose id equals the run id, and a failed implement handoff. T001 and T002 are already committed. The earlier File(s)-based publication policy also blocked T003's verification report; issue #398 independently replaced that policy with outcome-based publication.

## Expected Behavior

Execute recognizes this closed exclusive worker as a one-shot investigative resume. Discovery remains read-only. Parameter-free run re-proves the state under lease, archives and consumes the failed handoff, advances the checkpoint to the current descendant HEAD, and starts the same `sN-implement` identity with a prompt that identifies satisfied, remaining-authorized, and blocked work before editing. The same recovery can never replay.

## Actual Behavior

Recovery stops at `checkpoint_head_mismatch`. Ordinary redispatch would replay fresh implement work and can exhaust the same unchanged prerequisite again. Without commit ownership and path proof, accepting ancestor-or-equal HEAD would also mistake an unchanged failure or unrelated later commit for exclusive worker progress.

## Acceptance Criteria

### AC1: Discover safe exclusive implement resume
**Given** an exclusive implement failure, an issue-branch current HEAD that is a strict one-commit descendant of `run.head`, a unique incomplete owner whose id equals `runId`, empty workers, a failed implement handoff, and an owner-planned subject matching that non-merge commit
**When** `discover-recovery` runs
**Then** it reports `loop-recovery-available` with recovery class `exclusive_implement_resume`, records the observed non-denied commit paths, and mutates no checkpoint, handoff, or safe-recovery evidence.

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
**Given** an equal or non-ancestor HEAD, multiple or merge commits, a subject not owned by the recovery owner, a denied commit path, a wrong branch, live worker, dirty or unsafe ignored product state, missing unique owner, or previously consumed exclusive recovery
**When** execute evaluates recovery
**Then** it remains blocked and starts no worker.

### AC6: Outcome publication permits the current verification report
**Given** implement tasks omit the current `verification-report.md` from optional `File(s)` hints
**When** outcome publication scope and denied-path policy are inspected
**Then** `mutationPolicy` is `outcome`, the current verification report is not denied, and the four Approved spec inputs plus every other `specs/` path remain denied.

### AC7: Failed consumed resume cannot replay
**Given** a consumed exclusive resume whose worker writes another failed implement handoff
**When** parameter-free `run` runs again
**Then** it reports consumed recovery and starts no second worker.

## Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR1 | Classify only a proven closed exclusive implement owner on the exact issue branch with one strict-descendant, single-parent, owner-subject commit. | Must |
| FR2 | Consume the recovery before one investigative `sN-implement` dispatch and advance checkpoint HEAD by CAS. | Must |
| FR3 | Preserve durable no-replay semantics for the same run, issue, and implement step. | Must |
| FR4 | Keep repaired-publication classification and prompt behavior unchanged. | Must |
| FR5 | Require outcome scope, immutable spec inputs, non-denied observed commit paths, and fail-closed dirty/ignored workspace evidence. | Must |

## Scope

In scope: execute recovery classifier, exclusive resume prompt and dispatch, outcome-policy integration, regression tests, execute/write-code workflow contracts, changelog, and patch version.

Out of scope: PathCast product edits, nmg-sdlc self-execute, fresh implement replay, remediation dispatch, checkpoint reset, or changes to unrelated safe-recovery owners.
