# Requirements: Draft Issue

**Issue**: #4
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Interview for a feature or bug and create one executable GitHub issue with BDD acceptance criteria. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given an initial need, when drafting begins, then the workflow gathers only material missing decisions through bounded interactive gates.

### AC2: Current behavior

Given approved issue text, when publishing, then exactly one feature or bug issue is created with testable BDD acceptance criteria.

### AC3: Current behavior

Given the issue is created, when the workflow completes, then /sdlc-write-spec #N is the next action.

## Normative Sources

- Surface: `/sdlc-draft-issue`
- Implementation: `skills/draft-issue/`
- Verification: `scripts/__tests__/exercise-issue-form.test.mjs`
