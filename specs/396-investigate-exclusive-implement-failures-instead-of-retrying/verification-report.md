# Verification Report: Investigate exclusive implement failures instead of retrying

**Issue**: #396
**Date**: 2026-09-15
**Status**: Approved
**Author**: NMG

## Result

Passed. A closed implement worker can resume once only when one strict-descendant implementation commit is bound to the recovery owner's planned subject, contains non-denied outcome paths, and the repository/controller evidence remains clean and safe.

## Acceptance Evidence

| AC | Result | Evidence |
|----|--------|----------|
| AC1 | Passed | Discovery proves one strict-descendant, single-parent, owner-subject commit and returns its observed publication paths without mutating checkpoint, handoff, or recovery bytes. |
| AC2 | Passed | Bare run archives the original handoff, consumes `exclusive_implement_resume`, records publication/workflow evidence, advances HEAD through CAS, and dispatches only `sN-implement`. |
| AC3 | Passed | Prompt tests require per-Acceptance classification before edits and forbid replay, reset, rebase, discard, and repeated forbidden prerequisites. |
| AC4 | Passed | Existing repaired-publication fixtures retain exact-HEAD classification and ordinary implement prompting. |
| AC5 | Passed | Equal/non-ancestor HEAD, multiple commits, merge history, foreign subject, denied path, wrong branch, live worker, missing owner, dirty tracked work, ignored product work, and consumed recovery remain blocked. |
| AC6 | Passed | Missing File(s) returns `mutationPolicy: outcome` with empty hints; the current verification report is permitted while current Approved inputs and other specs are denied. |
| AC7 | Passed | A consumed recovery followed by another failed handoff starts no second worker. |

## Commands and Outcomes

```text
cd scripts
npm test -- sdlc-execute.test.mjs --runInBand
```

Passed: 1 suite, 367 tests, 0 failures.

```text
cd scripts
npm test -- sdlc-safe-recoveries.test.mjs --runInBand
```

Passed: 1 suite, 113 tests, 0 failures.

```text
cd scripts
npm test -- extension-commands.test.mjs rendered-prompt-contract.test.mjs --runInBand
```

Passed: 2 suites, 10 tests, 0 failures.

```text
cd scripts
npm test -- --runInBand
```

Passed: 55 suites, 1 skipped suite; 1,381 tests passed and 2 skipped; 0 failures.

```text
node scripts/verify-plugin-surface.mjs --root . --label repository
```

Passed: plugin surface validation.

The resolved `skill://skill-creator` validator passed temporary `SKILL.md` mirrors of `workflows/execute/WORKFLOW.md` (41 lines) and `workflows/write-code/WORKFLOW.md` (123 lines). Temporary validation files were deleted.

```text
git diff --check
```

Passed with exit code 0 and no output.

## Integration Notes

- Rebased onto the issue #398 outcome-policy release.
- Removed the obsolete explicit verification-report allowlist change.
- Version artifacts are synchronized at 3.22.1.
- PathCast and nmg-sdlc workflow commands were not used as implementation targets.
