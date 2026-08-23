# Tasks: Provide situation paragraphs on interactive interview asks

**Issue**: #225
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/209-remove-draft-issue-run-total-ask-quota/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Shared contract | 1 | [ ] |
| Workflows | 1 | [ ] |
| Private references | 1 | [ ] |
| Verification | 1 | [ ] |
| **Total** | 4 | |

---

### T001: Document the situation-paragraph rule in the shared interview contract

**File(s)**: `references/interactive-gates.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `skill://skill-creator` was resolved and read before this edit
- [ ] The Interview section still requires 2–4 options, recommended first, and max 3 questions per call
- [ ] It contains the exact sentence `short paragraph stating the situation`
- [ ] It states that the user can select an option without relying on earlier chat text
- [ ] It states that the full need statement or issue body must not be pasted
- [ ] It states that per-option `description` is not the required vehicle
- [ ] It lists the canned exemptions: draft-issue classification, milestone, split confirmation, need-gather when `$ARGUMENTS` is absent, and write-spec continue/finish
- [ ] Plan-mode entry and `xd://propose` finish rules are unchanged

### T002: Require the paragraph on each interactive interview site

**File(s)**: `workflows/draft-issue/WORKFLOW.md`, `workflows/write-spec/WORKFLOW.md`, `workflows/onboard-project/WORKFLOW.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/run-retro/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Draft-issue step 6, write-spec Interview, onboard interview/delegate asks, upgrade category/collision asks, and run-retro preference asks each contain `short paragraph stating the situation`
- [ ] Draft-issue steps 1–4 canned strings remain byte-identical, including `question: "What type of issue is this?"`
- [ ] Write-spec continue/finish labels remain byte-identical, including `Finished — stop writing specs` and `Continue — enter another issue number`
- [ ] Upgrade layout example is the detector-found `.codex/` paragraph, not the old bare `Relocate legacy .codex/* ?` label alone
- [ ] Run-retro examples are the filtered-date and cached-hash paragraphs, not the old bare labels alone
- [ ] No interview budget text is added, removed, or broadened

### T003: Require the paragraph in private interview references

**File(s)**: `workflows/draft-issue/references/interview-depth.md`, `workflows/write-spec/references/interview.md`, `workflows/write-spec/references/discovery.md`, `workflows/onboard-project/references/interview.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Each listed reference contains `short paragraph stating the situation`
- [ ] Interview-depth keeps preference/tradeoff-only use, tool-first discovery, no-review-ask, and continue-until-gathered
- [ ] Write-spec interview and discovery keep the 3-ask-per-issue budget and slug-collision-as-preference rule
- [ ] `workflows/draft-issue/references/multi-issue.md` is unchanged, including `question: "Create separate issues for this split?"`

### T004: Lock the paragraph rule and canned exemptions in contract tests

**File(s)**: `scripts/__tests__/interactive-plan-contract.test.mjs`
**Type**: Modify
**Depends**: T001-T003
**Acceptance**:
- [ ] A new test asserts `short paragraph stating the situation` is present in `references/interactive-gates.md`, draft-issue `WORKFLOW.md` and `interview-depth.md`, write-spec `WORKFLOW.md`, `interview.md`, and `discovery.md`, onboard-project `WORKFLOW.md` and `interview.md`, upgrade-project `WORKFLOW.md`, and run-retro `WORKFLOW.md`
- [ ] Existing canned-string assertions remain, and the new test also asserts `question: "What type of issue is this?"`, `question: "Create separate issues for this split?"`, `Finished — stop writing specs`, and `Continue — enter another issue number`
- [ ] The new test does not require the situation-paragraph sentence in `workflows/draft-issue/references/multi-issue.md`
- [ ] Existing no-whole-run-quota, per-call shape, unrelated-budget, and automated-no-ask tests still pass
- [ ] `cd scripts && npm test -- --runInBand __tests__/interactive-plan-contract.test.mjs` exits 0

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #225 | 2026-08-23 | Initial feature spec |
