# Design: Distinguish zero steering validations from missing results

**Issue**: #280
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/214-replace-markdown-steering-with-a-managed-runtime-sdlc-steering-and-deterministic-verification/

---

## Overview

Keep provider execution and ordinary result ceilings in `src/sdlc-verification-runtime.mjs`. Add one pure coverage function that compares manifest validation ids with result ids before the status ceiling is accepted. Persist its bounded summary in every successful verification artifact and expose the same summary from `scripts/sdlc-verify-steering.mjs`.

The empty-set case is explicit: no declarations and no results is complete. This is not a bypass because no validation was configured. A non-empty declaration set still requires exactly one result per id; missing, duplicate, and unknown ids impose `Incomplete` independently of provider status.

## Coverage Contract

Given ordered manifest declarations and result records, compute:

- `declared`: declaration count.
- `recorded`: result count.
- `complete`: true only when each declared id appears exactly once and no unknown id appears.
- `missing`: declared ids with no result.
- `duplicate`: ids occurring more than once in results.
- `unknown`: result ids absent from declarations.

Ids in mismatch arrays retain deterministic declaration/result order and are bounded by the manifest schema limits. Duplicate declaration ids remain rejected by steering runtime loading before verification.

## Ceiling Contract

1. Load and validate the steering runtime.
2. Execute one result path for every declared validation under existing applicability/provider rules.
3. Compute coverage.
4. If coverage is incomplete, set `ceiling: "Incomplete"`.
5. Otherwise apply the existing `verificationCeiling(results)` rules.
6. Persist the coverage summary beside `results`.

For zero declarations, the loop produces zero results, coverage is complete, and the existing ceiling is `null`.

## Consumer Contract

The runner CLI prints `ok`, `ceiling`, `issue`, and the coverage summary. Verify-code wording defines “missing results” as incomplete declaration/result coverage—not an empty array by itself. The generated command surface mirrors the workflow exactly. README and the steering schema reference document the same interpretation.

## Failure Handling

Runtime/config/base/spec failures continue to emit `ceiling: "Incomplete"`, `runtimeError`, and `results: []`. They do not claim complete coverage. Malformed or stale provider evidence remains an `incomplete` result under existing logic.

## Affected Paths

- `src/sdlc-verification-runtime.mjs`: pure coverage calculation and artifact integration.
- `scripts/sdlc-verify-steering.mjs`: machine-readable coverage output.
- `scripts/__tests__/sdlc-verification-runtime.test.mjs`: generic coverage and runtime regressions.
- `workflows/verify-code/WORKFLOW.md` and `commands/sdlc-verify-code.md`: synchronized interpretation.
- `references/steering-schema.md` and `README.md`: public contract.
- `CHANGELOG.md`: pending defect correction.

## Verification Strategy

- Focused verification-runtime Jest tests.
- Generated workflow/command synchronization tests.
- Plugin-surface and inventory checks.
- Full scripts test suite.
- Behavioral smoke in disposable projects with zero validations and with declared validations.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #280 | 2026-08-26 | Initial approved bug-fix design |
