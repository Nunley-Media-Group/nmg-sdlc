# Requirements: Write Specification

**Issue**: #5
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Create, approve, and publish one issue-owned BDD spec package from the default branch. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given an executable issue number, when specification runs, then one specs/{N}-{slug}/ package with singular Issue frontmatter is produced.

### AC2: Current behavior

Given the user approves the plan, when publication runs, then requirements.md, design.md, tasks.md, and feature.gherkin are committed and pushed.

### AC3: Current behavior

Given the spec PR is ready, when published, then it is squash-merged into the default branch without development-linking or closing the implementation issue.

### AC4: Current behavior

Given publication succeeds, when the loop continues, then the user may explicitly continue to implementation or finish.

## Normative Sources

- Surface: `/sdlc-write-spec #N`
- Implementation: `skills/write-spec/; scripts/publish-approved-spec.mjs`
- Verification: `scripts/__tests__/publish-approved-spec.test.mjs; scripts/__tests__/interactive-plan-contract.test.mjs`
