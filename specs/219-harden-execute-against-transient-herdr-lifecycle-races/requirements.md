# Defect Report: Harden execute against transient Herdr lifecycle races

**Issue**: #219
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Specs**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/, specs/216-honor-passed-worker-handoff-after-prompt-wait-failure/

---

## Problem

`/sdlc-execute` can inspect a worker before Herdr has submitted or settled its prompt. In observed runs, `herdr agent prompt --wait` returned idle with the workflow still pasted, emitted `agent_prompt_stalled` as JSON on stderr, or reached interactive `/review` menus in multiple transitions. A newly split pane also transiently rejected its first `herdr agent start` call. Execute then reported missing handoffs, review failure, or agent startup failure although the workflow could safely continue.

## Acceptance Criteria

### AC1: Recover an expected pasted worker prompt

Given a new or retained idle/done worker with no handoff and either the expected deterministic worker prompt or all three leading previews (`You are the`, `Execute the`, and `Write the h`) visibly pasted
When Herdr settles before submitting it
Then execute submits Enter once, waits for the explicit `working` transition and then an idle/done state, and evaluates the resulting handoff
And unrelated visible text or fewer than all three leading previews does not trigger Enter.

### AC2: Preserve authoritative handoffs and active workers

Given prompt wait returns non-success or reports a working worker
When a matching valid passed non-intervention handoff exists or the worker later settles and writes one
Then execute uses the handoff plus final idle/done state as authoritative and continues
And missing, invalid, failed, blocked, intervention, or non-settled outcomes still fail closed.

### AC3: Drive interactive review transitions

Given a review worker
When Review Mode is already visible, or `/review` is visibly pasted while Review Mode is absent
Then execute selects PR-style review without resubmitting `/review` when Review Mode is visible, otherwise submits the pasted `/review` before selecting PR-style review, observes the base-branch menu, selects literal `main`, and waits for completion.

### AC4: Retry one transient worker startup failure

Given a controller-created shell pane whose first `herdr agent start` call fails
When one second of readiness time passes
Then execute retries the same agent name, kind, and pane exactly once
And a second failure stops with `agent_start_failed` while leaving the pane open.

### AC5: End-to-end delivery remains intact

Given a disposable approved issue and an injected first-start failure
When execute runs the complete queue
Then start, implement, both review/fix pairs, verify, and deliver complete; the PR merges; the issue closes; and all worker panes close.

## Out of Scope

- Retrying more than once
- Shortening Herdr worker waits
- Closing a pane after two startup failures
- Changing the handoff schema or worker names
- Retrying interactive review from an abandoned retained menu
