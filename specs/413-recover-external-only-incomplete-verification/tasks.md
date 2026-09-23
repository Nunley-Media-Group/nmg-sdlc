# Tasks: Recover external-only incomplete verification

**Issue**: #413
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

### T001: Classify and consume exact recovery

**Files**: `scripts/sdlc-recover-verification.mjs`, `scripts/__tests__/sdlc-recover-verification.test.mjs`

Inspect owned report, canonical artifact and registered identity; require external-only Incomplete with complete required coverage and persist one-use verify-owner record before rerun. Cover positive and unsafe/stale/consumed boundaries.

### T002: Rerun the genuine gate under the verify workflow

**Files**: `workflows/verify-code/WORKFLOW.md`, `workflows/execute/WORKFLOW.md`, `commands/sdlc-verify-code.md`, `commands/sdlc-execute.md`

Invoke the bounded classifier after owner bind; only eligible recovery reruns registered gate once, preserves old report on non-pass, and uses normal report/publication/finalizer on full pass. Preserve publication-only and operator-authorized owning-stage paths.

### T003: Document and verify plugin behavior

**Files**: `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `specs/413-recover-external-only-incomplete-verification/`

Record safe recovery and exact evidence. Run focused and full script tests, skill exercise, plugin surface, inventory, staged install/doctor and consumer smoke; distinguish observed pass from unproved external gate.
