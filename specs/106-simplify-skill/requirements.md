# Requirements: Simplify Changed Code

**Issue**: #106
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Apply worthwhile behavior-preserving cleanup to the changed implementation surface. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given changed files, when simplify runs, then it reviews only the bounded diff and directly related context.

### AC2: Current behavior

Given duplicated, indirect, or inefficient code, when cleanup is safe, then it is simplified without altering specified behavior.

### AC3: Current behavior

Given a proposed change alters architecture, security, or acceptance behavior, when considered, then it is left to the owning implementation or verification stage.

### AC4: Current behavior

Given no worthwhile cleanup exists, when review completes, then no weightless refactor is introduced.

## Normative Sources

- Surface: `automated simplify stage`
- Implementation: `skills/simplify/`
- Verification: `scripts/__tests__/simplify-contract.test.mjs`
