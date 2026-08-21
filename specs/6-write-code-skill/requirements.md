# Requirements: Write Code

**Issue**: #6
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Implement an approved issue spec in task order and perform in-process behavior-preserving simplification. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given an explicit issue or issue branch, when implementation begins, then only the matching approved spec package is authoritative.

### AC2: Current behavior

Given ordered tasks, when work proceeds, then tasks are completed in declared order with observable verification.

### AC3: Current behavior

Given a skill-bundled edit, when skill-creator is installed, then its on-disk authoring contract is followed; absence fails closed.

### AC4: Current behavior

Given implementation completes, when cleanup runs, then simplify preserves the specified behavior.

## Normative Sources

- Surface: `automated implementation stage`
- Implementation: `skills/write-code/; agents/spec-implementer.md`
- Verification: `scripts/__tests__/sdlc-execute.test.mjs`
