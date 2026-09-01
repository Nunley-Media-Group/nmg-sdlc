# Defect Report: Deliver generated worker prompts exactly once before settlement

**Issue**: #347
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Reproduction

1. Start a fresh controller-owned `--kind omp` worker through `/sdlc-execute` (reproduced by retained smoke issue #39 `implement`).
2. Observe `agentStart` return `interactive_ready=true` while the advertised session JSONL remains nonexistent.
3. Observe `agentPrompt` exhaust ten readiness attempts without creating a canonical user record, leaving `promptDelivery: "pending"`.
4. Send the same canonical prompt with `herdr pane send-text <pane> <prompt>` followed by `herdr pane send-keys <pane> enter`; observe the JSONL appear with exactly one exact canonical user record.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | After `agentStart` reports interactive readiness, execute sends the canonical generated prompt through `herdr pane send-text <pane> <prompt>` and submits it through `herdr pane send-keys <pane> enter` before any worker observation. It checkpoints `text_inserted` after successful text insertion, retries only Enter from that state, and marks delivery complete only after Enter succeeds. Proven pre-insertion process loss may restart once. |
| **Actual** | The advertised OMP session JSONL can remain nonexistent even while Herdr reports `interactive_ready=true`; `agentPrompt` then cannot materialize a user record, exhausts readiness retries, persists `prompt_pending`, and terminates the provider child although direct pane input works. |

## Acceptance Criteria

### AC1: Bug Is Fixed

**Given** execute starts a fresh start, implement, review1, fix1, review2, fix2, verify, deliver, or remediation `--kind omp` worker
**When** `agentStart` reports interactive readiness
**Then** execute inserts that invocation's canonical prompt with Herdr pane text input, checkpoints `text_inserted`, submits Enter exactly once, marks delivery complete only after Enter succeeds, and only then observes settlement or handoff
**And** a text insertion or Enter failure retains the owned pane as `prompt_pending` without observation, settlement, or close
**And** recovery from `text_inserted` sends only Enter and never retypes the prompt
**And** proven process loss before insertion may restart the agent once in the same pane

### AC2: No Regression

**Given** a matching retained worker with `delivered` state or no prompt-delivery state
**When** execute resumes or finishes observing that worker
**Then** it sends no prompt text and no Enter
**And** a still-missing handoff after proven delivery remains `missing_handoff` and still closes the owned pane unless `--retain-worker` was requested
**And** review workers retain the controller-owned host-review prompt contract while using the same pane-input transport

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | After successful `agentStart` readiness, deliver every fresh standard and remediation prompt as separate `herdr pane send-text` and `herdr pane send-keys enter` argument-array operations before observation. | Must |
| FR2 | Persist `promptDelivery: "text_inserted"` after text insertion; an Enter failure retains that state and recovery sends only Enter. Persist `"delivered"` only after Enter succeeds. | Must |
| FR3 | Matching retained workers with delivered or legacy unknown state receive no pane input. | Must |
| FR4 | A proven pre-insertion process loss may retry `agent start` once in the same pane; unproven failures remain `prompt_pending`. | Must |
| FR5 | After proven delivery, missing handoff remains fail-closed `missing_handoff` with default owned-pane close-on-stop; `--retain-worker` stays the debug escape. | Must |

## Out of Scope

- Changing the canonical standard, remediation, or controller-owned host-review prompt contents
- Changing close-on-stop after a prompt was actually delivered
- Auto-provisioning `NMG_SDLC_SMOKE_ISSUES` or weakening live-smoke proof
- Inventing worker identities or skipping validated handoff checks
- Removing `src/extension.ts` `session_start` `appendEntry("com.nmg-sdlc.run", run)`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
| #347 | 2026-08-31 | Reconciled delivery transport and crash recovery with retained live evidence |
