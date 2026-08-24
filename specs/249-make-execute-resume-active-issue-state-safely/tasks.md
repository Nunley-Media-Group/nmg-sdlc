# Tasks: Make execute resume active issue state safely

**Issue**: #249
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Wait once when idle/done has no handoff | [ ] |
| T002 | Restore issue branch and refuse same-branch review | [ ] |
| T003 | Add combined resume regression tests | [ ] |
| T004 | Verify the focused execute controller suite | [ ] |

---

### T001: Wait once when idle/done has no handoff

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Retained matching idle/done with a missing handoff file, after the existing non-review paste-recovery attempt, calls `waitForWorkerSettlement(herdrApi, agentName)` once before `missing_handoff`
- [ ] New-worker idle/done with a missing handoff file, after existing stall/`appearsWorking` recovery, calls the same settlement wait once before `missing_handoff`
- [ ] Settlement wait false → `stopResult` `worker_failed`; pane stays open; no later step starts
- [ ] Settlement wait true and file still missing/unreadable → `stopResult` `missing_handoff`; pane stays open
- [ ] Idle/done with a present valid passed non-intervention handoff still does not call `waitForWorkerSettlement`
- [ ] No second `s<N>-<step>` is started; the retained pane is not closed on the first idle-without-handoff observation
- [ ] No new exported helper, poll loop, or `timeout` key on `agentWait`
- [ ] `validateHandoff`, handoff schema, `retained_worker_mismatch`, `unknown_pane`, `agent_prompt_stalled`, and `review_failed` menu failures stay unchanged

**Notes**: Follow the idle-without-handoff rule in design.md. Reuse `waitForWorkerSettlement`; do not copy its two `agentWait` calls inline in both sites if a single existing call already covers both.

### T002: Restore issue branch and refuse same-branch review

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Unexported `restoreActiveIssueBranch(issue, cwd, run)` implements the five-step rule in design.md
- [ ] `runExecute` calls it when `step` is set and `step !== 'start'`, before retained-worker handling and before `while (step)`
- [ ] `stopResult` reasonCodes are exactly `issue_branch_unreadable`, `dirty_tree`, and `branch_checkout_failed` as specified; `paneId` is `'none'` when no worker pane exists yet
- [ ] Checkout command is only `git checkout <expected>`; no `-B`, `--force`, stash, reset, discard, or `gh issue develop`
- [ ] `syncAndDeleteIssueBranch` still runs after a fully completed issue
- [ ] `dirtyTreeBlocks(issues[0])` at controller entry is unchanged
- [ ] `reviewBranchSelectionKeys` indexes the repository default branch name, not a hardcoded `'main'` string
- [ ] If current === default or current !== expected issue branch when preparing `review1`/`review2`, `stopResult` `review_branch_mismatch` and no `/review` prompt or base-menu keys are sent
- [ ] `scripts/sdlc-review-main.mjs` is not modified

**Notes**: Independent of T001. Implement in the same file. Default-branch lookup must use `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`.

### T003: Add combined resume regression tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] New test: retained matching idle `s42-implement`, `completed['42'] === ['start']`, handoff file absent, detection text is not the implement prompt; first `agentWait({ until: 'working' })` succeeds; bare `agentWait` writes a valid passed implement handoff and `agentGet` becomes idle. Expect no second `s42-implement`, pane not closed during the wait, `failed` is not `missing_handoff`, later steps start, and at least one `until: 'working'` wait has no `timeout` key
- [ ] New test: same retained idle implement setup but `agentWait({ until: 'working' })` returns status 1. Expect status 1, `failed.reasonCode === 'worker_failed'`, no later starts, pane open
- [ ] Update `does not press enter on a retained worker without a pasted prompt` so it still sends no Enter and still ends `missing_handoff` if the handoff never appears, while allowing one settlement wait
- [ ] Existing `fails closed when prompt wait fails without a matching handoff` still expects `missing_handoff` after any extra settlement wait
- [ ] New test: persist `issues: [42, 43]`, `completed['42']` is the full eight-step list, `completed['43']` is `['start', 'implement']`, clean tree, `git branch --show-current` starts as `main` and becomes `43-later` only after `git checkout 43-later`. Stub `gh issue view 43 --json title` to `Later` and keep #42 MERGED/CLOSED. Expect a `git checkout main` from #42 finalize, then `git checkout 43-later` before any `s43-review1` start; `/review` is not prompted while current is `main`
- [ ] New test: next step `review1` for #42, current stays `main` after a failed or no-op checkout of `42-ship-it`. Expect status 1, `failed.reasonCode` is `branch_checkout_failed` or `review_branch_mismatch`, `fixture.prompts` has no `/review`, and no review handoff is written
- [ ] Existing failed/blocked/intervention, dirty-tree preflight, retained mismatch, and eight-worker review-menu tests still pass
- [ ] Gherkin tags `@SCN001`–`@SCN006` with `@regression` are the scenario ids for AC1–AC6

**Notes**: Reuse `makeControllerFixture`, `configurePassedRetainedStartWorker`, `writeApproved`, `writeRun`, and `env`. Wrap `fixture.run` locally for per-issue titles and a mutable current-branch variable. Default `agentPrompt` writes `42-${step}.json` only; the two-issue test must write `43-*` handoffs if it continues past `review1`, or it may stop after asserting checkout-then-`s43-review1` start.

### T004: Verify the focused execute controller suite

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Eight-worker happy path still starts `s42-start` through `s42-deliver` and selects review mode then base with separate key bursts
- [ ] Serial later-issue remediation test still starts no `#43` worker while `#42` is failed
- [ ] Dirty-tree preflight still returns status 2 with `Working tree is dirty for a new issue` when porcelain is dirty and current is not `issues[0]`'s issue branch

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
