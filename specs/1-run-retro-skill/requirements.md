# Requirements: Run Retrospective

**Issue**: #1
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Analyze new or changed defect specs incrementally and update steering/retrospective.md without changing delivery state. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given defect specs changed, when the command runs, then it follows related-spec chains and records transferable patterns.

### AC2: Current behavior

Given unchanged defect inputs, when rerun, then the persisted hash state prevents duplicate analysis.

### AC3: Current behavior

Given an interactive invocation, when review is required, then native plan and bounded ask gates are used before writes.

## Normative Sources

- Surface: `/sdlc-run-retro`
- Implementation: `skills/run-retro/`
- Verification: `scripts/__tests__/`
