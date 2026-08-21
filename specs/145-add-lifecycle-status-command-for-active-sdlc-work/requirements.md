# Requirements: Lifecycle Status

**Issue**: #145
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Report current SDLC lifecycle evidence and the exact next action without mutation. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given empty arguments or --json, when status runs, then it reports bounded local and GitHub lifecycle evidence in human or stable machine-readable form.

### AC2: Current behavior

Given any other argument, when invoked, then usage is printed and the command exits non-zero.

### AC3: Current behavior

Given unavailable evidence, when status infers state, then unknowns and gaps are explicit and progress is not overstated.

### AC4: Current behavior

Given any repository state, when status runs, then files, refs, issues, pull requests, and processes remain unchanged.

## Normative Sources

- Surface: `/sdlc-status [--json]`
- Implementation: `skills/status/; scripts/sdlc-status.mjs`
- Verification: `scripts/__tests__/sdlc-status.test.mjs; scripts/__tests__/status-skill-contract.test.mjs`
