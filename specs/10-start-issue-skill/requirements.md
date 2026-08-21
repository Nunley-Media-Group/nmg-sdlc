# Requirements: Start Issue

**Issue**: #10
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Start one explicit executable issue on a clean linked branch after proving dependencies. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given no explicit #N argument, when invoked, then the stage fails closed without a picker or prompt.

### AC2: Current behavior

Given an issue with unresolved Depends on parents, when starting, then no branch or project mutation occurs.

### AC3: Current behavior

Given clean state and satisfied dependencies, when starting, then the issue branch is linked and the issue moves to In Progress.

### AC4: Current behavior

Given leftover unsupported labels, when starting, then they do not create alternate issue types or bypass normal delivery.

## Normative Sources

- Surface: `automated start stage`
- Implementation: `skills/start-issue/`
- Verification: `scripts/__tests__/start-issue-selection-contract.test.mjs`
