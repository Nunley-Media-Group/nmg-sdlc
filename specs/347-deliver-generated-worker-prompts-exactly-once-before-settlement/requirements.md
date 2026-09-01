# Defect Report: Deliver generated worker prompts exactly once before settlement

**Issue**: #347
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Reproduction

1. From a Herdr OMP controller pane, run `/sdlc-execute` so it starts a fresh sibling `--kind omp` worker for an incomplete start-then-prompt step (reproduced on verify for issue #343).
2. Observe the worker session: it emits `com.nmg-sdlc.run` during `session_start` and then goes idle/done or exits before the generated user prompt arrives.
3. Observe that `.omp/sdlc/handoffs/<N>-<step>.json` is never written.
4. Observe the controller persist `failed.reasonCode: missing_handoff` and close the owned worker pane.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Execute proves the sibling session is live, delivers that invocation's generated worker prompt exactly once, and only then observes settlement or handoff. If the session is already gone before the first prompt, execute retries `herdr agent start` once in the same pane (existing one-shot start retry), delivers the prompt exactly once to the live session, then observes. A matching retained live worker does not receive a second generated prompt. After proven prompt delivery, a still-missing handoff remains `missing_handoff` and still closes the owned pane unless `--retain-worker` was requested. |
| **Actual** | `runExecute` samples worker state and observes handoff without proving this invocation's generated prompt was delivered to a live session. An empty session that settled after only `com.nmg-sdlc.run` becomes `missing_handoff`, and `stopResult` closes the owned pane. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** execute starts a fresh start, implement, fix1, fix2, verify, deliver, or rem `--kind omp` worker
**When** `session_start` writes `com.nmg-sdlc.run` and the session would otherwise become idle or done before the generated prompt
**Then** execute retries start at most once if the session is already gone, delivers that invocation's generated prompt exactly once to a live session, and only then observes settlement or handoff
**And** it does not record `missing_handoff` or close the pane solely because the empty session settled before the prompt arrived

### AC2: No Regression

**Given** a matching retained live worker that already received its generated prompt, or a worker whose prompt was delivered and that still has no handoff
**When** execute resumes or finishes observing that worker
**Then** it does not send a second generated prompt
**And** a still-missing handoff after proven delivery remains `missing_handoff` and still closes the owned pane unless `--retain-worker` was requested
**And** review workers keep their existing interactive protocol

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Deliver the generated start-then-prompt worker prompt exactly once to a live session before terminal observation. | Must |
| FR2 | If the sibling session is gone before the first prompt, retry `agent start` once, then prompt once; do not classify that pre-prompt death as `missing_handoff`. | Must |
| FR3 | Matching retained live workers must resume without a second generated prompt. | Must |
| FR4 | After proven prompt delivery, missing handoff remains fail-closed `missing_handoff` with default owned-pane close-on-stop; `--retain-worker` stays the debug escape. | Must |

## Out of Scope

- Changing the review1/review2 interactive `/review` protocol
- Changing close-on-stop after a prompt was actually delivered
- Auto-provisioning `NMG_SDLC_SMOKE_ISSUES` or weakening live-smoke proof
- Inventing worker identities or skipping validated handoff checks
- Removing `src/extension.ts` `session_start` `appendEntry("com.nmg-sdlc.run", run)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
