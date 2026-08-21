# Requirements: Contribution Evidence Gate

**Issue**: #125
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Validate a connected issue, spec, steering, changed-path, and verification evidence graph with narrow documented exceptions. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given normal feature or bug work, when the PR gate runs, then the current issue and singular matching spec are required.

### AC2: Current behavior

Given documentation-only work, when the documented marker and path predicate hold, then only the defined evidence is reduced.

### AC3: Current behavior

Given a full breaking repository rewrite, when the repository-rewrite marker, feat!: title, contract paths, current specs, path mapping, steering, and verification all hold, then historical issue identity alone is waived.

### AC4: Current behavior

Given quoted, hidden, unrelated, or incomplete evidence, when evaluated, then it remains inert and produces actionable failures.

### AC5: Current behavior

Given onboarding or upgrade, when the managed workflow is installed, then version 5 is reconciled without overwriting unmanaged or newer workflows.

## Normative Sources

- Surface: `managed pull-request workflow`
- Implementation: `.github/workflows/nmg-sdlc-contribution-gate.yml; references/contribution-gate.md; CONTRIBUTING.md`
- Verification: `scripts/__tests__/contribution-gate-contract.test.mjs; scripts/__tests__/exercise-contribution-gate.test.mjs`
