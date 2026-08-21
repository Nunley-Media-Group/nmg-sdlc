# Requirements: Address Pull Request Comments

**Issue**: #86
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Resolve eligible automated review threads while preserving human ownership and exact-head safety. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given an unresolved automated-review thread with an actionable finding, when remediation runs, then the source is fixed and verified before reply and resolution.

### AC2: Current behavior

Given an ambiguous or human-authored thread, when encountered, then it remains unresolved and delivery returns intervention.

### AC3: Current behavior

Given a fix changes the head, when review continues, then the updated exact head is pushed and rechecked.

### AC4: Current behavior

Given no eligible findings remain, when the stage completes, then control returns to open-pr.

## Normative Sources

- Surface: `automated review remediation stage`
- Implementation: `skills/address-pr-comments/`
- Verification: `scripts/__tests__/open-pr-delivery-contract.test.mjs`
