# Verification Report: Read-only owner-bound implementation scope probe

**Issue**: #390
**Date**: 2026-09-13
**Status**: Passed
**Spec**: `specs/390-read-only-owner-bound-implementation-scope-probe/`

## Acceptance Results

| Criterion | Result | Evidence |
|-----------|--------|----------|
| AC1 | Pass | API and CLI fixture bind the actual Git branch, active run, and exactly one matching incomplete owner; mismatches fail closed. |
| AC2 | Pass | Exact PathCast exercise compares SHA-256 and base64 bytes before/after, observes no controller lock, and leaves run, recovery, handoff, spec, product, and `.pi-glla` state unchanged. |
| AC3 | Pass | Structured scope has exactly five fields and separates tracked, explicitly untracked, task provenance, read-only, and combined allowed paths. |
| AC4 | Pass | Exact PathCast T001-T004 fixture returns 18 allowed, 12 tracked, six untracked evidence paths, one stale-branch discrepancy, and no writable spec path. |
| AC5 | Pass | Parser tests retain duplicate task-relative provenance, reduce Create then Modify, prefer writable authority over read-only input, and reject unsupported/missing/near-miss/duplicate declarations. |
| AC6 | Pass | Safe-recovery, execute, apply-review, and delivery suites pass after all consumers moved to `scope.allowedPaths`; bind/reconcile remain state-changing actions. |
| AC7 | Pass | README, write-code workflow, changelog, plugin surface, current spec archive, workflow inventory stability, version sync, and contribution evidence are verified. |

## Commands and Outcomes

- `cd scripts && npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs` — passed, 105 tests.
- `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` — passed, 295 tests.
- `cd scripts && npm test -- --runInBand __tests__/sdlc-apply-review.test.mjs` — passed, 16 tests.
- `cd scripts && npm test -- --runInBand __tests__/sdlc-deliver.test.mjs` — passed, 115 tests.
- `cd scripts && npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs -t "reports exact PathCast 18/12/6 scope"` — passed, one disposable real-Git PathCast-state copy exercise; 104 unrelated tests skipped by name filter.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 79 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, one deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 43 items mapped.
- VERSION/package comparison — passed at `3.21.3`; no implementation-time bump.
- `node scripts/contribution-evidence.mjs --root . .omp/sdlc/contribution-390.json` — passed with `{\"ok\":true,\"errors\":[]}`; the temporary input was removed.
- Active #390 structured scope inspection — passed with 12 tracked, zero untracked, 12 allowed, four read-only spec inputs, and four task records.
- `git diff --check` — passed.

## Changed-Path Alignment

- Behavior for `scripts/sdlc-safe-recoveries.mjs`: returns structured scope and exposes a native no-write owner-bound probe.
- Behavior for `scripts/sdlc-execute.mjs`: establishes the implement owner under the controller lease before worker dispatch and consumes structured inspection.
- Behavior for `scripts/sdlc-apply-review.mjs`: authorizes review-fix publication only through `scope.allowedPaths`.
- Behavior for `scripts/sdlc-deliver.mjs`: authorizes mergeability reconciliation only through `scope.allowedPaths`.
- Behavior for `scripts/__tests__/`: covers the probe, exact fixture, parser precedence, controller owner establishment, and existing consumers.
- Behavior for `scripts/__fixtures__/pathcast-108-publication-scope/`: preserves the exact canonical PathCast #108 T001-T004 task input.
- Behavior for `workflows/write-code/WORKFLOW.md`: runs read-only `probe` before edits and state-changing subject `bind` only at publication.
- Behavior for `README.md`: documents CLI/API arguments, structured JSON, discrepancies, and mutation boundary.
- Behavior for `CHANGELOG.md`: records the unreleased defect fix.
- Behavior for `specs/390-read-only-owner-bound-implementation-scope-probe/`: records the singular Approved contract and verification evidence.

## Steering Alignment

- Product: preserves issue/spec traceability, exact mutation scope, read-only diagnostics, and worker isolation.
- Technical: uses Node ESM built-ins, argument arrays, stable reason codes, no dependencies, and cross-platform `node:path` handling.
- Structure: keeps deterministic inspection in `scripts/`, workflow behavior in `workflows/write-code/`, public guidance in README, and issue authority in one singular spec package.

## Residual Risks

- Operation classification intentionally requires explicit `Download untracked` or `Generate untracked` annotations for untracked authority; older specs without those annotations remain tracked-scope semantics.
- The probe reports stale checkpoint branch metadata but does not repair it. Controller/state repair remains outside #390.
- The probe is cooperative read-only observation; another process can mutate repository state after the probe returns. Publication bind/reconcile revalidate later under the controller lease.
