# Tasks: Drop unsupported `parent` field from `gh issue view` JSON query in sdlc-runner

**Issue**: #91
**Date**: 2026-04-21
**Status**: Planning
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Fix the defect — remove `parent` from the `--json` field list | [ ] |
| T002 | Add regression test (command-shape assertion + `gh` 2.86.0 field-rejection mock) | [ ] |
| T003 | Verify no regressions (`cd scripts && npm test`) | [ ] |

---

### T001: Fix the Defect

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] The `gh issue view` command string at ~line 1579 is changed from `--json number,state,body,parent,closedByPullRequestsReferences` to `--json number,state,body,closedByPullRequestsReferences`.
- [ ] No other code is changed — the fallback stub (line 1584) and the parent-link guard (lines 1597–1599) are left intact.
- [ ] Running `node scripts/sdlc-runner.mjs --config <config>` against a repo with open milestone issues on `gh` 2.86.0 no longer emits `Unknown JSON field: "parent"`.
- [ ] `selectNextReadyIssue` returns a non-null `issue` and the runner proceeds past Step 2 (`startIssue`).

**Notes**: Minimal one-line change per design.md § Fix Strategy. Do not introduce a capability probe, do not touch the parent-link guard, do not rewrite the fallback stub.

### T002: Add Regression Test

**File(s)**: `scripts/__tests__/select-next-issue-from-milestone.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] A new scenario in the existing Jest describe block captures every `issue view` command the runner emits and asserts none of them contain `parent` (literal substring match in the `--json` field-list portion).
- [ ] A second new scenario uses a mock `ghRunner` that throws `Unknown JSON field: "parent"` when any `--json` query contains `parent` (mimicking `gh` 2.86.0) and asserts the runner still returns a non-null ready `issue` — proving the emitted command avoids the unsupported field.
- [ ] Both scenarios are tagged `@regression` in the Gherkin file (see `feature.gherkin`).
- [ ] The new tests fail if `T001` is reverted (the assertions catch a re-introduced `parent`).
- [ ] All pre-existing tests in the file continue to pass unchanged.

**Notes**: Use the existing `makeGhRunner` helper as a pattern; extend it with a `rejectFields: [...]` option or introduce a parallel helper that throws when a specified substring appears in the `--json` portion. Keep both assertions in the same file so the whole regression is contained in one place.

### T003: Verify No Regressions

**File(s)**: N/A — verification step (no file changes)
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npm test` exits 0 — all unit tests (including the two new regression scenarios) pass.
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits 0 (unchanged — no skill files modified).
- [ ] Manual smoke: on a workstation with `gh` 2.86.0 installed, running the SDLC runner against a repo with open milestone issues progresses past Step 2 without a `FAILURE LOOP DETECTED` exit.
- [ ] No side effects in adjacent code paths per design.md § Blast Radius (body cross-ref resolution, `ready`/`blockedIssues` shapes, caller contracts all unchanged).

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
