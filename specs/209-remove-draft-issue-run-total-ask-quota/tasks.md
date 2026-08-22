# Tasks: Remove draft-issue run-total ask quota

**Issue**: #209
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/4-draft-issue-skill/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Workflow | 2 | [ ] |
| References | 1 | [ ] |
| Verification | 1 | [ ] |
| **Total** | 4 | |

---

### T001: Remove the draft-issue run-total quota

**File(s)**: `workflows/draft-issue/WORKFLOW.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Split confirmation no longer states a three-ask whole-run budget
- [ ] Interviewing no longer uses a total-invocation count or remaining ask slots
- [ ] The workflow continues focused asks until every material undiscoverable preference, acceptance criterion, and scope boundary is gathered
- [ ] Classification remains exactly Enhancement and Bug, milestone selection remains semver-based, and split confirmation remains one ask
- [ ] Tool-first discovery and the prohibition on final approval or draft-review asks remain

### T002: Replace quota-based interview guidance

**File(s)**: `workflows/draft-issue/references/interview-depth.md`, `workflows/draft-issue/references/multi-issue.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Interview depth guidance has no run-total budget, remaining-slot rule, or instruction to skip a necessary probe
- [ ] It permits depth logging only when logging cannot suppress required questions
- [ ] It requires 2–4 options, recommended first, at most three questions per call, and asks only for preferences and tradeoffs
- [ ] Multi-issue guidance keeps one split-confirm ask and its current option and adjustment behavior without a skill-wide quota
- [ ] Neither reference permits final approval through `ask`

### T003: Preserve unrelated interaction budgets

**File(s)**: `references/interactive-gates.md`, `workflows/write-spec/WORKFLOW.md`, `workflows/onboard-project/WORKFLOW.md`, `workflows/upgrade-project/WORKFLOW.md`
**Type**: Verify
**Depends**: T001-T002
**Acceptance**:
- [ ] `references/interactive-gates.md` still limits each call to at most three questions
- [ ] Write-spec still has its existing three-ask-per-issue interview budget
- [ ] Onboard-project and upgrade-project still have their existing three-question budgets
- [ ] No unrelated workflow budget is broadened or removed

### T004: Add quota cutover contract coverage

**File(s)**: `scripts/__tests__/interactive-plan-contract.test.mjs`
**Type**: Modify
**Depends**: T001-T003
**Acceptance**:
- [ ] Tests reject whole-run three-ask, remaining-slot, and probe-skipping language in draft-issue and its private references
- [ ] Tests preserve required classification, milestone, split-confirm, tool-first, and no-review-ask behavior
- [ ] Tests assert the retained per-call shape and unrelated workflow budgets
- [ ] The focused interactive-plan contract suite exits 0

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #209 | 2026-08-22 | Initial feature spec |
