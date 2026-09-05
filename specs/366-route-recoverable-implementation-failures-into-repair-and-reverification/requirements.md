# Defect Report: Route recoverable implementation failures into repair and reverification

**Issue**: #366
**Date**: 2026-09-05
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

## Bug Report
Implementation workers stop execute for ordinary repairable implementation gaps instead of using the existing fresh-session remediation loop.

## Root Cause Analysis
The controller already supports implement remediation when intervention is false. write-code instructs blocking edit/test failures to use implementation_failed without distinguishing repairable work from external authority blockers; its publication branch explicitly marks failures intervention true. In pennyscan #134, an unspecified in-scope modeled-cost component design was treated as grounds to stop rather than investigate, resolve within approved constraints, implement, and verify.

**User Confirmed**: Yes — recoverable work must be fixed and verified again rather than stopping.

## Reproduction Steps
1. Execute an approved issue with implementation work remaining.
2. Encounter a missing implementation detail or repairable edit/test defect.
3. Observe a failed implement handoff with intervention true and controller exit 1 instead of remediation.

## Expected Behavior
Resolve in-scope implementation details using approved outcomes, constraints, repository evidence, and conservative engineering judgment; fix and reverify. If work still requires a fresh session, emit remediable failure and let the existing controller repair the same step. Preserve real approval, credential, external-authority, and publication blockers.

## Actual Behavior
The worker stops with incomplete implementation and intervention true; the controller closes the pane and leaves the run failed.

## Environment
| Factor | Value |
|---|---|
| OS / Platform | macOS / Herdr OMP |
| Version | nmg-sdlc 3.20.9 |
| Runtime | Node.js |

## Acceptance Criteria
### AC1: Repairable implementation gaps continue
**Given** approved requirements and an in-scope implementation detail, edit defect, or failing test
**When** the implementation worker encounters it
**Then** it investigates and repairs within the approved constraints, records any necessary design clarification, and reruns verification rather than demanding external implementation policy merely because code is absent.
### AC2: Fresh-session recovery uses existing controller
**Given** an implementation failure that remains repairable without external authority
**When** the worker hands off and the controller observes completion
**Then** it records failed with intervention false, starts rN-implement, preserves partial work and evidence, and advances to review1 only after a passed published implementation.
### AC3: Genuine blockers remain explicit
**Given** missing approved scope, unavailable required credentials or external evidence, conflicting safety authority, or unproven publication
**When** the worker cannot resolve the blocker with available tools and authority
**Then** it writes an intervention handoff with exact missing prerequisite and attempted resolutions; it never fabricates evidence, weakens safety gates, or publishes partial work as success.
### AC4: Repeated repair rechecks the same contract
**Given** a remediation attempt exposes another repairable implementation defect
**When** that attempt settles
**Then** existing recovery continues with original implement identity and fresh evidence until verified success or a genuine blocker, without a new attempt cap or a duplicate controller.

## Functional Requirements
| ID | Requirement | Priority |
|---|---|---|
| FR1 | Make repair and reverification the default for in-scope implementation gaps. | Must |
| FR2 | Explicitly classify recoverable failures as non-intervention. | Must |
| FR3 | Reuse existing remediation, ownership, publication, and verification contracts. | Must |
| FR4 | Exercise actual worker behavior as well as controller transitions. | Must |

## Out of Scope
- Changing pennyscan financial policies or its #134 specification under this plugin issue.
- Automatically approving new product scope or fabricating missing provider facts.
- Disabling failed-handoff cleanup, checkpoint identity checks, publication proof, or human-review ownership.
- A new retry subsystem or attempt cap.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #366 | 2026-09-05 | Initial defect report implementing the requested repair-and-reverify behavior |
