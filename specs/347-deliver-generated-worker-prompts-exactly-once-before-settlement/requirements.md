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
| **Expected** | Execute proves the sibling session is live, delivers that invocation's generated worker prompt exactly once, persists `activating`, and only marks delivery `delivered` after working/blocked or a valid expected handoff proves activation. A controller restart while `activating` re-enters bounded activation without another prompt. Activation exhaustion becomes retained `prompt_pending`; initial idle/done cannot settle or close the pane. After proven activation, a still-missing handoff remains `missing_handoff` and still closes the owned pane unless `--retain-worker` was requested. |
| **Actual** | The fresh flow persisted `promptDelivery: "delivered"` immediately after `agentPrompt` returned and before bounded activation. A controller exit in that window resumed as delivered, skipped activation recovery, and could settle or close an initially idle worker on `missing_handoff`. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** execute submits one generated prompt to a fresh standard, review, or remediation `--kind omp` worker
**When** submission is accepted but activation has not yet been proven
**Then** execute persists `promptDelivery: "activating"` before bounded activation and transitions to `delivered` only after working/blocked or a valid expected handoff
**And** a resumed `activating` worker re-enters bounded activation without another `agentPrompt`; exhaustion becomes retained `prompt_pending`, and initial idle/done cannot settle or close the pane

### AC2: No Regression

**Given** a matching retained worker is `pending`, `activating`, or proven `delivered`
**When** execute resumes or finishes observing that worker
**Then** pending delivery may dispatch once, activating delivery resumes only the bounded activation guard, and delivered workers receive no second generated prompt
**And** a still-missing handoff after proven activation remains `missing_handoff` and still closes the owned pane unless `--retain-worker` was requested
**And** review prompt content and review evidence validation remain unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Persist `activating` immediately after one accepted generated prompt and before bounded activation. | Must |
| FR2 | Resume `activating` standard, review, and remediation workers through bounded activation without another generated prompt. | Must |
| FR3 | Transition to `delivered` only after working/blocked or a valid expected handoff proves activation; migrate unversioned legacy `delivered` state back through `activating`. | Must |
| FR4 | Activation exhaustion becomes retained `prompt_pending`; only a missing handoff after proven activation may use fail-closed `missing_handoff` and default owned-pane close-on-stop. | Must |

## Out of Scope

- Changing review prompt content or review evidence validation
- Changing close-on-stop after prompt activation was proven
- Auto-provisioning `NMG_SDLC_SMOKE_ISSUES` or weakening live-smoke proof
- Inventing worker identities or skipping validated handoff checks
- Removing `src/extension.ts` `session_start` `appendEntry("com.nmg-sdlc.run", run)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
| #347 | 2026-09-01 | Persist activation-pending delivery and resume its bounded guard without re-prompting |
