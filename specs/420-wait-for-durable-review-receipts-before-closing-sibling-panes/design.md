# Design: Durable host review receipt collection

**Issue**: #420
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

## Boundary and evidence

`runBoundedReview` in `scripts/sdlc-execute.mjs` owns sibling lifecycle. `inspectReviewReceipts` in `src/sdlc-review-isolation.mjs` is the existing authority for the exact assignment digest/invocation, host isolation module, read-only allowed paths, contamination, and final `review_result`; `parsedReviewResult` enforces the result delimiters. Do not change either validator or substitute agent output. The current loop waits, inspects, and closes one worker before touching the next; the review-step catch also closes remaining workers on error. Both paths must preserve all panes until required host receipts validate.

The #129/#131 retained evidence and #141 issue comment show absent final receipts and controller pane closures; they do not record the instantaneous failed JSONL read or prove a single root cause. PR #422's one-pause fixture demonstrates an ordering bug, while its #131 live smoke still failed. Design a fixture that delays the host append across more than one observation and a second fixture that delivers a partial JSONL line before completing it; do not label these fixtures as proof of the historical throw site.

## Collection protocol

1. Launch/prompt slices as currently. Complete the wait/status observation for **every** sibling before the first receipt inspection or pane close. A failed, missing, blocked, or unknown worker remains failure; do not treat idle/done as evidence of a receipt.
2. Inspect each slice's existing assignment and receipt path through `inspectReviewReceipts`. For an incomplete/missing final host result, re-inspect the **same** path after `herdr.observationPause` at most 30 times (one second per pause), with no re-prompt, agent restart, new assignment, attempt, or invocation. A temporarily partial JSONL line may settle within this window. A valid result can terminate its observation early. Foreign assignment or prohibited access never becomes acceptable; if a later snapshot exposes them, fail closed. No receipt is accepted if its final result is missing, malformed, or empty at the deadline.
3. Stage validated nonempty results without closing any pane. If any slice fails, leave *all* review panes owned/retained, keep assignment and JSONL bytes for diagnosis, and do not write an aggregate `.md` or review handoff. Ensure the review-step catch/stop cleanup cannot override this preservation for collection failures; do not erase existing evidence or silently consume one-use recovery.
4. Only after all slices pass the exact-host checks, use the existing ordered aggregation (`No findings.` excluded when there are findings), review finalization, and owned-pane closure. Preserve the existing meaning of findings. The closure condition is all valid proofs/results, not merely all terminal agent states; a pane-close failure remains an explicit failure with retained ownership for the affected pane.

## Verification contract for a later implementation

A focused pre-fix fixture must fail on premature inspection/closure or missing late result. Post-fix, delayed result after multiple pauses (within 30) and a completed partial line pass using only host JSONL; arrival beyond the bound and persistent missing/malformed/foreign/contaminated/empty evidence fail with no artifact/handoff and panes still present. Assert that no pane closes while another worker remains unsettled or before every receipt is valid, including failure propagation through the controller catch. Test the exact 30-pause ceiling without a wall-clock suite delay by driving the existing observation hook. Full suites/registered smoke belong to later implementation and cannot be reported passed by this spec draft.
