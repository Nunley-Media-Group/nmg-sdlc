# Defect Report: Restore bounded operator-authorized recovery of stopped delivery

**Issue**: #372
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/

## Bug Report
An operator cannot resume a legitimately abandoned delivery after repairing the cause of failure: the persisted remediation-loop stop survives a plugin upgrade, while lease recovery cannot authorize another attempt. Ordinary reinvocation must remain stopped, but an explicit audited operator action must safely authorize one real repair attempt.

## Root Cause Analysis
The execute checkpoint gate in scripts/sdlc-execute.mjs rejects exhausted remediation history before launching a worker. --recover-stale only reclaims controller ownership. A passed handoff can advance, but no supported operator recovery command can launch the work required to produce it. Stale recorded panes may also produce pane_close_failed instead of confirmed-absence reconciliation.

**User Confirmed**: Yes — operator requested fixing recovery and completing the abandoned delivery without another loop.

## Reproduction Steps
1. Retain a delivery checkpoint with two or more completed remediations without stage advancement (observed legacy run: 13 attempts).
2. Fix the underlying cause or install an updated plugin.
3. Invoke execute for the same issue queue with --recover-stale.
4. Observe successful stale-lease reclamation followed by remediation_loop, without resumed work.

## Expected Behavior
The operator can inspect the exact stopped checkpoint and explicitly authorize one bounded retry with a recorded reason. Existing work and historical evidence survive. Ordinary resumes and upgrades never implicitly grant new attempts. A failed authorized attempt stops; passed work advances only through unchanged validation and delivery gates.

## Actual Behavior
The controller stops before starting another worker and emits an opaque stop message. Its only documented escape requires an already-passed handoff.

## Environment
| Factor | Value |
|---|---|
| OS / Platform | Observed macOS; required solution is project-, language-, and platform-agnostic |
| Version / Commit | nmg-sdlc 3.21.0 |
| Runtime | Node.js, Herdr OMP |

## Acceptance Criteria
### AC1: Explicit exact-checkpoint authorization
**Given** a stopped remediation-loop checkpoint and an operator-provided reason
**When** the operator authorizes retry using its current immutable recovery identity
**Then** execute durably consumes that authorization once and launches at most one real repair worker, preserving the issue queue, work, completed stages, previous failures, and attempt history.

### AC2: No implicit allowance or authorization replay
**Given** a stopped run, a stale or consumed authorization, or the same authorization submitted concurrently
**When** execute is invoked normally, with only stale-lease recovery, after an upgrade, or with the invalid authorization
**Then** no new repair allowance is granted; at most one concurrent consumer may dispatch, and failure explains the exact current blocker and supported operator action.

### AC3: Failed recovery stays bounded
**Given** an authorized recovery worker
**When** it fails without stage advancement or its dispatch becomes ambiguous
**Then** no automatic follow-on remediation is started; the checkpoint and evidence remain available, and re-entry cannot replay the consumed attempt.

### AC4: Passed work completes normal delivery
**Given** the authorized worker produces a genuinely validated passed handoff
**When** execute processes it
**Then** the normal remaining review, verification, exact-head publication, merge, and closure gates execute without any waiver; a subsequent stage retains the normal bounded remediation policy.

### AC5: Intervention and ownership remain fail-closed
**Given** blocked/intervention evidence, mismatched queue or stage, an active controller or worker, ambiguous ownership, or unreadable Herdr evidence
**When** retry is requested
**Then** it does not bypass those blockers, mutate unrelated state, or launch duplicate workers. A positively confirmed absent recorded pane may be reconciled without pretending a live pane was closed; ambiguous or reused identities remain protected.

### AC6: Discoverable and verified operator recovery
**Given** a legacy exhausted run and the installed plugin
**When** the operator inspects status or the stopped command result
**Then** the output includes the stable reason, current recovery identity when eligible, and an exact supported retry command distinct from stale-lease recovery. Behavioral regressions, an actual isolated command exercise, and the registered fresh live-smoke delivery gate prove the change.

## Functional Requirements
| ID | Requirement | Priority |
|---|---|---|
| FR1 | Provide an explicit one-use recovery authorization bound to current run, issue, step, checkpoint and operator reason. | Must |
| FR2 | Preserve accumulated history and normal two-remediation protection; no automatic retry of exhausted legacy runs. | Must |
| FR3 | Keep intervention, ownership, cancellation, publication and exact-head gates fail-closed. | Must |
| FR4 | Make failures actionable and reconcile only positively absent owned panes. | Must |

## Contract Precedence
This issue adds an explicit operator-authorized exception to #369's unchanged reinvocation stop. It does not change ordinary reinvocation, legacy-attempt counting, or automatic retry limits.

## Out of Scope
- PennyScan product code, trading, live profiles, or broker/service mutations.
- Removing checkpoints, clearing attempt history, editing passed handoffs, bypassing gates, or changing unrelated #360 state.
- Unlimited retries, automatic authorization generation/consumption, extra strategy workers, or smoke-application backlog repair.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #372 | 2026-09-07 | Initial defect specification authorized by the operator request to fix recovery and complete delivery without repeating a loop |
