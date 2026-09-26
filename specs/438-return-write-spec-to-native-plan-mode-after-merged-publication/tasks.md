# Tasks: Return write-spec to native plan mode after merged publication

**Issue**: #438
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/400-restore-per-spec-plan-approval-and-ci-gated-merge-waiting/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Submit the continuation through the TUI editor | [ ] |
| T002 | Align write-spec contracts with editor submission | [ ] |
| T003 | Resume a partially delivered smoke queue | [ ] |

---

### T001: Submit the continuation through the TUI editor

**File(s)**: `src/sdlc-commands.mjs`, `src/extension.ts`, `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `writeSpecPlanReentry` returns `{ issue, slug, pr }` for successful and merged-on-nonzero results and `null` for malformed, unrelated, mismatched, and pre-merge results
- [ ] `renderWriteSpecContinuation` returns the header with every published number and `N-slug` followed by the complete materialized workflow without `$ARGUMENTS`
- [ ] A terminal `agent_end` after a merged result submits exactly one `/plan` plus continuation through the focused editor; plan mode is recorded before the continuation prompt
- [ ] Two publications pass both numbers, including across a plan-approval session clear; a new `/sdlc-write-spec` invocation starts a fresh list; an active plan receives the continuation without `/plan`
- [ ] Nonterminal end, duplicate events, missing UI, wrong focus, non-empty draft, and submit failure produce no extra submission, preserve the draft, and retain pending with a notification

### T002: Align write-spec contracts with editor submission

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md`, `scripts/__tests__/interactive-gates-contract.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Read `skill://skill-creator` before editing workflow-bundled files
- [ ] The workflow skips Initial issue selection for a `Post-publication continuation.` prompt, retains its published list, and starts at the Continue loop
- [ ] Publication ends the execution turn after remediation; the extension then submits the continuation into native plan mode
- [ ] Approval Behavior and the publish reference require running `merge` verbatim as the whole bash command, with no chaining, pipe, redirection, or appended `echo`, so the extension recognizes the publication
- [ ] The source-wording assertion pinning the queued-message mechanism is removed

### T003: Resume a partially delivered smoke queue

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `scripts/sdlc-execute.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `steering/snippets/project-tech.md`, `README.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] A rerun after a failed execute with receipts for #7 of queue #7 #9 runs only `run #9` in the retained clone with the same token and passes with remote proof for both
- [ ] A failed resume keeps its receipts and stays resumable; delivered issues are never dispatched again
- [ ] Non-prefix receipts and receipt-less unchanged-candidate failures do not dispatch
- [ ] `run #42 #43` from #42's branch continues #42 then #43; `run #43` from a delivered #42 branch leaves it for the default branch; an undelivered or dirty foreign branch still stops with `active_issue_conflict`

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression coverage is included in every task
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure
