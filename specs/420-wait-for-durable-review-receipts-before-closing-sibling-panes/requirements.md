# Defect Report: Wait for durable review receipts before closing sibling panes

**Issue**: #420
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

## Bug Report
During #417's registered smoke against approved smoke #129, review1 stopped `review_scope_unproven`. Reviewer 1's exact-assignment final receipt exists; reviewer 2's receipt contains valid startup/read events but no final result, and reviewer 3's contains only valid startup. Their sessions show SIGHUP/aborted after the controller closed all three panes in existing tab `w5:t1`. The retained clone is `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-2hBS7G` (run `e3386db6-a416-4245-900d-96620bc6b853`).

## Root Cause Hypothesis
`runBoundedReview` starts sibling reviewers concurrently but inspects and closes them one at a time. A worker may report idle/done before its host `message_end` receipt is durably appended; one transient invalid JSONL snapshot immediately triggers `review_scope_unproven` and catch cleanup aborts unfinished siblings. A focused pre-fix fixture must establish this race rather than treating timestamps alone as proof.

**User Confirmed**: Yes — investigate and repair a confirmed plugin defect without weakening the review gate.

## Acceptance Criteria
### AC1: Observe durable host result before closing siblings
**Given** review workers have launched with exact assignments and a terminal worker status precedes the final host receipt
**When** the controller collects review evidence
**Then** it waits for all sibling workers to settle before closing any pane and rechecks a transient incomplete receipt once after its existing observation pause
**And** only the valid host-captured final result can pass review.

### AC2: Preserve fail-closed review authority
**Given** a persistent malformed, absent, foreign, contaminated, or empty receipt, or a nonterminal worker
**When** review collection completes
**Then** the controller remains failed with the original scope and result gates; terminal/tool prose never substitutes for host evidence, and no new allowance or pane topology is invented.

### AC3: Prove defect and respect smoke progress
**Given** deterministic pre-fix and post-fix fixtures for delayed receipt and persistent invalid evidence
**When** focused and full plugin tests plus the registered smoke gate are considered
**Then** the race regression fails before the fix and passes afterward
**And** one changed-hypothesis attempt against retained smoke #129 occurs only if exact ownership/head and recovery policy prove it eligible; otherwise its intervention remains preserved and the blocker is reported.

## Functional Requirements
| ID | Requirement | Priority |
|---|---|---|
| FR1 | Complete all worker settlements before per-slice receipt validation or pane closure. | Must |
| FR2 | Use one bounded observation recheck for an invalid/missing host receipt without accepting untrusted output. | Must |
| FR3 | Preserve review isolation, one-use recoveries, and no-progress smoke policy. | Must |

## Out of Scope
- Editing smoke project code/receipts to manufacture success; creating a Herdr workspace/tab/session/server.
- Changing #417 project-provider verification or #418 start/implementation recovery.
