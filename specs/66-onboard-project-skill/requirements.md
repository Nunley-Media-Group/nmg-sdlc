# Requirements: Onboard Project

**Issue**: #66
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Initialize greenfield or reconcile brownfield projects with current steering, spec, contribution, and OMP contracts. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given project contents, when onboarding starts, then it distinguishes initialized, greenfield, greenfield-enhancement, and brownfield modes.

### AC2: Current behavior

Given a greenfield project, when approved, then steering, specs, contribution guidance, and managed workflows are created from current templates.

### AC3: Current behavior

Given a brownfield project, when approved, then history informs reconciliation without inventing ambiguous ownership.

### AC4: Current behavior

Given an already initialized project, when detected, then /sdlc-upgrade-project is recommended instead of duplicating setup.

## Normative Sources

- Surface: `/sdlc-onboard-project`
- Implementation: `skills/onboard-project/`
- Verification: `scripts/__tests__/exercise-contribution-gate.test.mjs; scripts/__tests__/steering-contract.test.mjs`
