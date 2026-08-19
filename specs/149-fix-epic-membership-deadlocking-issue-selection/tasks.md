# Tasks: Fix Epic Membership Deadlocking Issue Selection

**Issue**: #149
**Date**: 2026-08-13
**Status**: Approved
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Define and apply canonical epic relationship semantics | [ ] |
| T002 | Align deterministic runner readiness | [ ] |
| T003 | Add regression and cross-skill coverage | [ ] |
| T004 | Document and verify the correction | [ ] |

---

### T001: Define and Apply Canonical Epic Relationship Semantics

**File(s)**: `references/epic-relationships.md`, `skills/start-issue/SKILL.md`
**Type**: Create / Modify
**Depends**: None
**Acceptance**:
- [ ] Use `$skill-creator` for every skill-bundled file edit required by this task.
- [ ] The shared contract defines supported native-parent, `Depends on:`, and `Blocks:` signals and distinguishes `epic-membership` from `execution-dependency`.
- [ ] A target is coordination-only only when its live metadata confirms the `epic` label.
- [ ] Native-plus-body signals are deduplicated by child/target pair without losing the parent identity.
- [ ] Body-only and native-only epic links are classified as coordination when their target metadata is available.
- [ ] Confirmed non-epic parents remain execution dependencies.
- [ ] Missing or failed relationship metadata retains the edge as blocking and emits an actionable warning naming the child and target.
- [ ] Bare interactive and skill-level unattended selection exclude coordination epics from blocked counts and topological in-degree while retaining genuine blockers.

**Notes**: This is a read-time classification change. Do not edit, remove, or migrate GitHub parent links or body cross-references.

### T002: Align Deterministic Runner Readiness

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Runner preselection applies the shared role decision table before readiness filtering.
- [ ] Native parent discovery uses GraphQL and does not request unsupported `parent` data through `gh issue view --json`.
- [ ] Only explicit same-repository native-parent, `Depends on:`, and `Blocks:` targets are hydrated; no graph-wide or cross-repository discovery is introduced.
- [ ] An open coordination epic does not block its child even when the epic is absent from the automatable candidate pool.
- [ ] An open sibling or other confirmed non-epic target remains a blocker and is named in diagnostics.
- [ ] Closed dependency completion retains the existing closed-plus-merged-PR rule.
- [ ] Metadata lookup failure prevents false readiness and produces a warning with the affected relationship.
- [ ] Relationship metadata is derived fresh on every selection cycle and is not persisted in `sdlc-state.json`.

**Notes**: Keep the runner zero-dependency and preserve injectable GitHub command execution for deterministic tests.

### T003: Add Regression and Cross-Skill Coverage

**File(s)**: `scripts/__tests__/select-next-issue-from-milestone.test.mjs`, `scripts/__tests__/epic-relationship-contract.test.mjs`, `scripts/__tests__/exercise-start-issue-epic.test.mjs`, `specs/149-fix-epic-membership-deadlocking-issue-selection/feature.gherkin`
**Type**: Create / Modify
**Depends**: T002
**Acceptance**:
- [ ] Runner tests cover native-plus-body, body-only, native-only, confirmed non-epic, and metadata-failure cases.
- [ ] Runner tests prove a genuine open sibling blocks while the coordination epic is omitted from blocker diagnostics.
- [ ] Regression coverage preserves the prohibition on `gh issue view --json parent`.
- [ ] Cross-skill contract coverage proves `draft-issue` still writes both epic identity forms.
- [ ] Cross-skill contract coverage proves `write-spec` umbrella discovery and `open-pr` sibling-aware classification still consume the same parent identity.
- [ ] The disposable bare-selection exercise proves the first child is selectable while its epic remains open and later children remain ordered by real sibling dependencies.
- [ ] All six acceptance criteria have one-to-one `@regression` Gherkin coverage.

**Notes**: Keep live or Codex-dependent exercise execution opt-in; deterministic unit and contract tests must run in the normal test suite.

### T004: Document and Verify the Correction

**File(s)**: `README.md`, `CHANGELOG.md`, `references/epic-relationships.md`, `skills/start-issue/SKILL.md`, `scripts/sdlc-runner.mjs`, `scripts/__tests__/`
**Type**: Modify / Verify
**Depends**: T003
**Acceptance**:
- [ ] README states that open coordination epics do not block their children and genuine prerequisites still do.
- [ ] CHANGELOG records issue #149 under `[Unreleased]` as a bug fix.
- [ ] `cd scripts && npm test` passes.
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes after the shared-reference and skill changes.
- [ ] The targeted disposable start-issue exercise passes or any environment-only gap is recorded precisely without weakening deterministic coverage.
- [ ] Contract checks confirm `draft-issue`, `write-spec`, and `open-pr` behavior remains intact.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] The implementation diff contains no issue-graph rewrites, unrelated refactors, version bump, or delivery changes.

---

## Critical Path

T001 -> T002 -> T003 -> T004

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #149 | 2026-08-13 | Initial defect tasks |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix -- no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
- [x] Dependencies form a linear, acyclic chain
