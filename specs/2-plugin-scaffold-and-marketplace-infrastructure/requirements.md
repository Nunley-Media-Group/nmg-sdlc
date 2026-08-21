# Requirements: OMP Extension Surface

**Issue**: #2
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Package nmg-sdlc as an Oh My Pi extension with native interactive commands and print-safe automated commands. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given OMP loads package.json, when the extension starts, then src/extension.ts registers the five interactive /sdlc-* commands.

### AC2: Current behavior

Given print or RPC execution, when an automated /sdlc-* command runs, then commands/ expands the owning workflow without a dropped sendUserMessage call.

### AC3: Current behavior

Given a Herdr OMP session, when the extension starts, then it exposes run state and reports readiness without owning worker orchestration.

## Normative Sources

- Surface: `OMP extension load`
- Implementation: `src/; commands/; package.json`
- Verification: `scripts/__tests__/extension-commands.test.mjs; scripts/__tests__/plugin-surface-verification.test.mjs`
