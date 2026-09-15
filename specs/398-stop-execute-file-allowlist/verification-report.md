# Verification Report: Stop execute File(s) allowlisting

**Issue**: #398
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG

## Result

Passed. Implement/fix publication now follows Approved outcomes within a centralized deny policy. Task `File(s)` declarations remain optional hints; verify, deliver, and review-isolation boundaries remain closed where required.

## Acceptance Evidence

| AC | Result | Evidence |
|----|--------|----------|
| AC1 | Passed | Focused Jest covers missing, near-miss, duplicate, hidden, and malformed optional File(s) while execute dispatches without `publication_scope_unproven`. |
| AC2 | Passed | Apply-review tests commit an additional unlisted product file and the current verification report with the exact review-fix subject. |
| AC3 | Passed | Apply-review rejects dirty current `tasks.md`; safe-recoveries denies current spec inputs, other specs, and `.omp/`; delivery rejects a conflict in current `tasks.md`. |
| AC4 | Passed | Scope/probe tests require `mutationPolicy: "outcome"`, optional/empty hint arrays, and all four current spec inputs in `readOnlyPaths`. |
| AC5 | Passed | Reconciliation compares observed publication paths with commit paths; verify remains report-only and deliver tests preserve explicit delivery artifacts. |
| AC6 | Passed | Write-code, write-spec, task template, and README describe Acceptance-driven mutation, optional File(s) hints, and the deny policy. Workflow and plugin-surface validation passed. |

## Commands and Outcomes

### Focused publication suites

```text
cd scripts
npm test -- sdlc-apply-review.test.mjs sdlc-safe-recoveries.test.mjs sdlc-execute.test.mjs sdlc-deliver.test.mjs
```

Passed: 4 suites, 599 tests, 0 failures, 0 snapshots; 104.623 seconds.

### Disposable outcome-scope exercise

A temporary Git repository contained an Approved `specs/42-feature/` package whose task omitted `File(s)`. After dirtying `src/b.ts` and `specs/42-feature/verification-report.md`, direct module exercise returned:

```json
{
  "mutationPolicy": "outcome",
  "allowedPaths": [],
  "productDenied": false,
  "reportDenied": false,
  "designDenied": true,
  "readOnlyPaths": [
    "specs/42-feature/design.md",
    "specs/42-feature/feature.gherkin",
    "specs/42-feature/requirements.md",
    "specs/42-feature/tasks.md"
  ]
}
```

Passed. The temporary repository was deleted after the assertion.

### Workflow contract validation

The resolved `skill://skill-creator` validator was run against temporary `SKILL.md` mirrors of the unchanged-format `workflows/write-code/WORKFLOW.md` and `workflows/write-spec/WORKFLOW.md` entrypoints.

Passed: `write-code` valid at 122 lines; `write-spec` valid at 198 lines. Temporary validation files were deleted.

### Plugin surface

```text
node scripts/verify-plugin-surface.mjs --root . --label repository
```

Passed: `Plugin surface validation passed: repository`.

### Diff hygiene

```text
git diff --check
```

Passed with exit code 0 and no output.

## Scope Notes

- Historical specs #379, #383, and #390 remain unchanged as a truthful archive.
- Review-isolation slice `allowedPaths` remain git-diff assignments.
- `/sdlc-execute`, `/sdlc-draft-issue`, `/sdlc-write-spec`, and `/sdlc-open-pr` were not invoked.
- PathCast was not modified or used as an execution target.
