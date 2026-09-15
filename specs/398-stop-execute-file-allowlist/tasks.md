# Tasks: Stop execute File(s) allowlisting

**Issue**: #398
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG

---

`**File(s)**` declarations below are contribution-gate hints for this pull request. They are not an execute mutation allowlist.

### T001: Implement outcome scope classification

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `publicationPathDenied` centralizes invalid, read-only, and foreign-spec denial with the current verification-report exception
- [ ] Implement/fix scope uses `mutationPolicy: outcome`, preserves spec inputs as read-only, and treats parsed task paths only as optional hints
- [ ] Missing or invalid File(s) hints do not block implement/fix inspection, bind, probe, or dispatch
- [ ] Reconciliation proves observed non-denied commit paths rather than task hints

### T002: Publish observed apply-review paths

**File(s)**: `scripts/sdlc-apply-review.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Applied review rejects only denied porcelain paths and names the denied path
- [ ] Every observed non-denied product, test, and current verification-report path is committed
- [ ] Reconciliation receives the observed committed path set
- [ ] `Review fixes exceed approved task scope` is removed

### T003: Migrate execute and delivery consumers

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Execute preflight proceeds when task File(s) is absent or incomplete
- [ ] Repaired-publication intervention requires outcome policy and complete read-only spec inputs, not nonempty hints
- [ ] Delivery mergeability admits unlisted product conflicts and rejects denied paths
- [ ] Review isolation retains git-diff path assignments

### T004: Update worker and public contracts

**File(s)**: `workflows/write-code/WORKFLOW.md`, `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/templates/tasks.md`, `README.md`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Skill-creator procedure is followed before workflow edits
- [ ] Write-code uses passing probe plus denied-path policy and publishes observed dirty paths
- [ ] Write-spec describes File(s) as optional canonical hints, not an executability requirement
- [ ] README documents `mutationPolicy: outcome`, deny rules, and non-authoritative allowedPaths hints

### T005: Invert allowlist regression coverage

**File(s)**: `scripts/__tests__/sdlc-apply-review.test.mjs`, `scripts/__tests__/sdlc-safe-recoveries.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Extra product paths and current verification reports publish for implement/fix
- [ ] Missing and malformed File(s) hints no longer block implement dispatch or scope inspection
- [ ] Current spec inputs, other specs, `.omp/`, and invalid paths remain denied
- [ ] Verify and deliver closed artifact behavior and review isolation remain covered

### T006: Complete BDD and release evidence

**File(s)**: `specs/398-stop-execute-file-allowlist/feature.gherkin`, `specs/398-stop-execute-file-allowlist/verification-report.md`, `VERSION`, `package.json`, `CHANGELOG.md`
**Type**: Create or Modify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- [ ] One Gherkin scenario maps to each AC1-AC6
- [ ] Focused Jest and disposable Git exercises pass and are recorded
- [ ] Version artifacts are synchronized at 3.22.0 and changelog records issue #398
- [ ] Pull request includes issue, spec, steering, exact path, and verification evidence

## Traceability

| AC | Tasks |
|----|-------|
| AC1 | T001, T003, T005 |
| AC2 | T002, T005 |
| AC3 | T001, T002, T003, T005 |
| AC4 | T001, T003, T005 |
| AC5 | T001, T002, T005 |
| AC6 | T004, T006 |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #398 | 2026-09-14 | Initial approved tasks |
