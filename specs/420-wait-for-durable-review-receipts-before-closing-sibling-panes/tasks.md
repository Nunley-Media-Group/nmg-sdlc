# Tasks: Wait for durable review receipts before closing sibling panes

**Issue**: #420
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

These tasks describe a future implementation; this spec-only change does not execute them.

### T001: Capture the collector failure deterministically
**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Depends**: none
**Acceptance**:
- [ ] Prove pre-fix failure when a settled reviewer gets its exact host `review_result` only after multiple observation pauses, including a partial JSONL append; record whether failure is inspection, premature pane close, or both.
- [ ] Assert sibling wait ordering and pane retention on persistent unsafe evidence without using agent terminal prose as receipt authority.

### T002: Gate collection and cleanup on all host receipts
**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Depends**: T001
**Acceptance**:
- [ ] Await every sibling settlement before any receipt read or pane close; re-inspect the exact assignment-bound receipt within at most 30 one-second observation pauses.
- [ ] Publish only after every host result validates and is nonempty; for persistent invalid scope, contamination, missing/empty result, or worker failure, preserve all panes, artifacts and failure evidence with no review handoff or replay.
- [ ] Cover the controller catch cleanup as well as the normal collector closure path; keep unrelated step cleanup and existing assignment/read-only validation intact.

### T003: Verify the changed hypothesis before delivery
**File(s)**: focused execute regression and existing validation commands (no report file required by this draft)
**Depends**: T002
**Acceptance**:
- [ ] Demonstrate pre-fix fail/post-fix pass for the focused fixture, and exercise the 30-pause ceiling, malformed/foreign/contaminated/empty cases, findings, and pane-close failure.
- [ ] Run required project checks at implementation time; distinguish observed #129/#131/#141 evidence from an inferred cause. No unchanged smoke replay, fabricated receipt, PR merge, or pass claim for a failed registered gate.
