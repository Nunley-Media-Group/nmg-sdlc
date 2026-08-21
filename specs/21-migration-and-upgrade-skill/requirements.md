# Requirements: Project Upgrade Compatibility

**Issue**: #21
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Preserve a strict migration alias while upgrades detect and propose current OMP contract repairs. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given /sdlc-migrate-project, when invoked, then it prints exactly Run /sdlc-upgrade-project and performs no work.

### AC2: Current behavior

Given /sdlc-upgrade-project, when invoked, then detection is read-only and proposed mutations require approved plan execution.

### AC3: Current behavior

Given legacy packaging or layouts, when an approved upgrade runs, then deterministic script mutations converge on the current OMP structure.

### AC4: Current behavior

Given ambiguous ownership, when detected, then the workflow preserves it for explicit user resolution.

## Normative Sources

- Surface: `/sdlc-migrate-project and /sdlc-upgrade-project`
- Implementation: `skills/migrate-project/; skills/upgrade-project/; scripts/sdlc-upgrade.mjs`
- Verification: `scripts/__tests__/sdlc-upgrade.test.mjs`
