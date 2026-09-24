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
- [ ] Exercise `agentWait` returning while a sibling is still working: retain the existing state observation loop without a deadline, then wait for every idle/done sibling before any receipt read or close.
- [ ] Assert sibling wait ordering and pane retention on persistent missing, malformed, foreign, wrong-assignment, empty, or worker-failure evidence without using agent terminal prose as receipt authority.

### T002: Gate collection and cleanup on all host receipts
**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Depends**: T001
**Acceptance**:
- [ ] Await every sibling's actual idle/done state before any receipt read or pane close; only then re-inspect the same exact assignment-bound host JSONL receipt within at most 30 one-second observation pauses.
- [ ] Publish only after every host result validates and is nonempty; for persistent missing/malformed/foreign/wrong-assignment/empty evidence or worker failure, preserve all panes, artifacts and failure evidence with no aggregate artifact/handoff, replacement, or recovery consumption.
- [ ] Keep proven prohibited access with complete nonempty host receipt on the existing owner-bound `invalid_review_slice` path: consume one replacement of the whole review stage, preserve original evidence, and fail after a failed replacement or second contamination with no third attempt; absent/changed/consumed owner fails without replacement.
- [ ] Cover controller catch cleanup as well as normal collector closure; keep unrelated step cleanup, existing assignment/read-only validation, and one-use recovery tests intact.

### T003: Verify the changed hypothesis before delivery
**File(s)**: focused execute regression and existing validation commands (no report file required by this draft)
**Depends**: T002
**Acceptance**:
- [ ] Demonstrate pre-fix fail/post-fix pass for focused fixtures; exercise the 30-pause receipt ceiling separately from the unbounded worker-state loop, malformed/foreign/wrong-assignment/empty and worker-failure cases, findings, and pane-close failure.
- [ ] Retain and run existing one-use `invalid_review_slice` regressions for original evidence, whole-stage replacement, consumed owner, failed replacement, and second contamination without budget refill or third launch; do not rewrite them as missing-receipt tests.
- [ ] Run required project checks at implementation time; distinguish observed #129/#131/#141 evidence from an inferred cause. No unchanged smoke replay, fabricated receipt, PR merge, or pass claim for a failed registered gate.
