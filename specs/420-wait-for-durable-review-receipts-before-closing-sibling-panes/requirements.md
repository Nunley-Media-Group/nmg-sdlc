# Defect Report: Wait for durable review receipts before closing sibling panes

**Issue**: #420
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

## Observed evidence

- Registered #417 smoke on smoke project #129 stopped at review1 with `review_scope_unproven`. The retained run `e3386db6-a416-4245-900d-96620bc6b853` in `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-2hBS7G` has reviewer-1 final host receipt at 00:54:37.208Z; reviewers 2/3 lacked final results and were aborted after the controller's pane closes at 00:54:37.672–37.793Z. This establishes early closure, not the precise read or throw that caused the stop.
- The unmerged PR #422 tried wait-all plus **one** receipt recheck. Its deterministic fixture passed after the change, but registered smoke on smoke project #131 still stopped review1 `review_scope_unproven`: reviewer 1 had a final host result, reviewers 2/3 lacked one, and pane closes at 01:51:33.191–33.315Z preceded their aborted requests. The exact throw site was not recorded. PR #422 was closed without merge; that recheck was insufficient on the live path.
- In the reopened #420 issue comment, registered smoke #141 for #425/PR #426 reached review1 then stopped `review_scope_unproven`/`missing_handoff`. Exact-assignment JSONL for reviewers 1/3 had session-start/read records but no `review_result`; reviewer 2 had a final `review_result`. Execute emitted pane-closed events for all three slices before a review handoff was published. No additional timing or cause is established by this record.

## Problem and hypothesis

`runBoundedReview` in `scripts/sdlc-execute.mjs` currently waits, reads, and closes each slice sequentially; failure cleanup also closes owned slices. A terminal agent status does not prove that the host `message_end` receipt has reached durable JSONL. A short append delay or partially written last line **could** account for a transient failed inspection; the retained smokes do not prove this is the sole cause. The requested correction must reproduce the boundary deterministically and preserve evidence if it still fails.

## Acceptance criteria

### AC1: All siblings settle before receipt inspection or closure

**Given** concurrently launched review slices with exact assignments
**When** the controller collects their results
**Then** it observes all sibling workers through settlement before inspecting any slice receipt or closing any review pane
**And** idle/done status alone never counts as a durable host result.

### AC2: Bounded exact-host receipt quiescence

**Given** all sibling workers have settled but one exact-assignment receipt has not yet durably recorded a complete `review_result`
**When** the controller inspects host JSONL
**Then** it re-inspects that same assignment-bound host receipt after up to 30 one-second observation pauses, stopping when valid nonempty final evidence arrives
**And** it uses only that host-captured result, never terminal text, prompt prose, or inferred findings.

### AC3: Fail closed and preserve diagnosis

**Given** any required receipt remains missing, malformed, foreign to its assignment, contaminated by prohibited access, or has missing/empty result after the bound, or a sibling aborts/fails
**When** collection stops
**Then** review remains failed with no review artifact or handoff derived from these slices
**And** all review panes, assignments, receipts, and retained failure evidence remain available for diagnosis, without starting another review attempt.

### AC4: Successful completion has one cleanup boundary

**Given** every settled sibling has a valid exact-assignment, uncontaminated, nonempty host result
**When** review collection completes
**Then** the existing aggregation/finalization path may publish its artifact and review handoff
**And** only after all required host evidence is valid may it close the sibling panes; review findings retain their existing meaning.

## Scope

Only `scripts/sdlc-execute.mjs` review collection and its focused behavioral regression during later implementation. Preserve the existing assignment digest, invocation, snapshot-read restrictions, `inspectReviewReceipts` authority, and review result framing. No terminal-result fallback, review replay/retry, widened scope, smoke-project application-source edits, provider classification change, or #418 start/implement recovery change. Do not replay smoke issues #129, #131, or #141. A later registered smoke remains a separate required gate and must use a fresh consumer issue/spec through its normal workflow; this spec records prior failures, not a passed outcome.
