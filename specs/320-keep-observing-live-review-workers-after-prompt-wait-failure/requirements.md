# Defect Report: Keep observing live review workers after prompt-wait failure

**Issue**: #320
**Date**: 2026-08-29
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/292-select-review-base-without-interactive-picker-parsing/

---

## Reproduction

1. Run `/sdlc-execute` for an issue that reaches `review1` or `review2` with an exact owned sibling review worker.
2. Have `herdr agent prompt --wait` return a non-success result other than `agent_prompt_stalled` while that worker remains listed and continues holding or processing the controller-owned review prompt.
3. Observe execute stop with `review_failed` before the worker can write its review artifact and handoff; without `--retain-worker`, the controller closes the owned pane.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A non-stall prompt-wait failure does not override authoritative worker and handoff evidence. If the exact owned review worker remains listed, execute observes it until a valid artifact-backed review handoff appears or the worker disappears. |
| **Actual** | `submitReviewProtocol` returns `review_failed` immediately for every non-stall prompt-wait failure, even when the exact review worker is still live or the prompt call already produced a valid handoff. |

**Version bump**: patch

## Acceptance Criteria

### AC1: Live Review Worker Remains Observable

**Given** an exact owned `sN-review1` or `sN-review2` worker remains listed
**When** `herdr agent prompt --wait` returns a non-stall failure without a valid handoff yet
**Then** execute continues observing that worker until a valid artifact-backed review handoff appears or the worker is gone
**And** it does not stop with `review_failed` solely because the prompt-wait command failed
**And** it does not send Enter or otherwise use stalled-prompt recovery for the non-stall failure

### AC2: Fail-Closed and Existing Paths Are Preserved

**Given** no valid review handoff exists and the exact owned review worker is absent or disappears
**When** execute handles the failed prompt-wait result
**Then** the review step fails closed as `review_failed` or `process_lost` without recreating the review worker
**And** missing review-base failure, `agent_prompt_stalled` one-Enter recovery, human-review intervention, and non-review worker prompt handling remain unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Check and validate an already-written review handoff before classifying a non-stall prompt-wait failure. | Must |
| FR2 | When no handoff exists but the exact worker name and pane remain registered, use the existing review-handoff observation loop instead of returning `review_failed`. | Must |
| FR3 | Preserve `review_failed` when a non-stall prompt failure has no handoff and the exact worker is already absent, and preserve `process_lost` when an observed worker later disappears. | Must |
| FR4 | Keep non-stall failures out of the `agent_prompt_stalled` detection and one-Enter recovery path. | Must |

## Out of Scope

- Changing review artifact or handoff schemas
- Recreating a disappeared review worker
- Changing review finalization in `scripts/sdlc-review-main.mjs` or host-review workflow prose
- Delivery hosted-check snapshot/classification
- Completing leftover execute queue issue #314

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #320 | 2026-08-29 | Initial defect report |
