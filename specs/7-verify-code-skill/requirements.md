# Requirements: Verify Code

**Issue**: #7
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Verify the current implementation against its approved spec and emit durable delivery evidence. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given an approved spec, when verification runs, then architecture, acceptance behavior, tests, and changed-surface evidence are reviewed inline.

### AC2: Current behavior

Given verification completes, when evidence is durable, then verification-report.md and the issue handoff record the exact head and outcomes.

### AC3: Current behavior

Given only PR-dependent evidence remains, when local evidence passes, then PR Evidence Pending may advance to delivery.

### AC4: Current behavior

Given a substantive failure, when verification ends, then delivery is blocked with intervention details.

## Normative Sources

- Surface: `/sdlc-verify-code #N`
- Implementation: `skills/verify-code/; agents/architecture-reviewer.md`
- Verification: `scripts/__tests__/plugin-surface-verification.test.mjs`
