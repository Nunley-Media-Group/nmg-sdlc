# Tasks: Restore per-spec plan approval and CI-gated merge waiting

**Issue**: #400
**Date**: 2026-09-15
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/197-move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add the native-plan publication bridge | [ ] |
| T002 | Require approval for every write-spec issue | [ ] |
| T003 | Classify incomplete CI as pending | [ ] |
| T004 | Prove polling, terminal failure, and exact-head merge | [ ] |

---

### T001: Add the native-plan publication bridge

**File(s)**: `src/sdlc-commands.mjs`, `src/extension.ts`, `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `writeSpecPlanReentry(event, root)` accepts only the exact materialized merge helper command, matching positive issue/directory, sole JSON result with `merged: true`, and positive PR
- [ ] Successful and post-merge-failed publication results produce one static `/plan` continuation prompt
- [ ] Pre-merge failure, malformed/truncated output, mismatched issue/directory, unrelated commands, and duplicate `toolCallId` produce no dispatch
- [ ] The extension uses `pi.sendUserMessage(prompt, { deliverAs: "followUp" })` exactly once so remediation finishes before re-entry
- [ ] Existing initial TUI rewrite and headless/print/RPC denial remain unchanged

### T002: Require approval for every write-spec issue

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `workflows/write-spec/references/review-gates.md`, `references/interactive-gates.md`, `scripts/__tests__/interactive-plan-contract.test.mjs`, `scripts/__tests__/interactive-gates-contract.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Resolve and read `skill://skill-creator` before editing workflow-bundled files and validate the affected bundles through its contract
- [ ] Every selected issue writes a distinct complete `local://spec-{N}-plan.md` carrying the accumulated published list and calls `xd://propose`
- [ ] Publication execution records N, completes documented remediation, and settles before candidates or Continue/Finished
- [ ] Selecting M performs only discovery/interview before M's proposal; every branch, file, commit, push, PR, label, and merge mutation for M stays post-approval
- [ ] Candidate filtering/order, canned Continue/Finished labels, exact final summary, full four-file plan bodies, and publication helper order remain unchanged
- [ ] All first-spec-only and no-second-proposal statements are removed from active contracts

### T003: Classify incomplete CI as pending

**File(s)**: `scripts/pr-delivery-state.mjs`, `scripts/__tests__/pr-delivery-state.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `resolveDeclaredCheck(...).status === "pending"` appends the declared identity to normalized `pendingDeclaredPrOnlyChecks: string[]`; `mismatch` still fails closed
- [ ] Every supported pending check state, a non-empty `pendingDeclaredPrOnlyChecks`, and `requiredChecksConfigured === true && checks.length === 0` return `pending/checks_pending`
- [ ] BLOCKED returns pending only through that missing/pending CI evidence; terminal-successful BLOCKED remains `merge_blocked_by_external_policy`
- [ ] Explicit failure overrides BLOCKED and still returns `remediate/checks_failed`
- [ ] Human review, automatic review, BEHIND/DIRTY/CONFLICTING, exact-head mismatch, incomplete pagination, event provenance, and merged/closed proof retain their current classifications
- [ ] CLEAN returns `merge_ready/exact_head_clean` only when required and declared checks are present and terminal-successful

### T004: Prove polling, terminal failure, and exact-head merge

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Injected snapshots progress from missing/registering checks through pending or CI-attributable BLOCKED to successful/CLEAN on one persisted head
- [ ] Every non-terminal observation sleeps 30,000 ms and performs no merge, remediation packet, failed handoff, recovery consumption, or cleanup
- [ ] More than 120 pending observations still continue, proving no former one-hour or new workflow deadline
- [ ] A fresh successful/CLEAN recheck issues exactly one `gh pr merge P --squash --match-head-commit H`
- [ ] Explicit check failure and proven non-CI blockers use existing remediation/failure paths without sleeping as CI-pending
- [ ] Existing merge transport ambiguity, up-to-three post-merge reads, exact linkage, one authorized issue close, and cleanup-after-MERGED+CLOSED tests remain authoritative

---

## Validation Checklist

- [ ] Tasks are focused on the fix — no feature work
- [ ] Regression coverage is included in every task
- [ ] Each task has verifiable acceptance criteria
- [ ] No scope creep beyond the defect
- [ ] File paths reference actual project structure
