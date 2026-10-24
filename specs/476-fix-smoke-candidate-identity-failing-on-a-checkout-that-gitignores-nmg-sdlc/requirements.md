# Defect Report: Fix smoke candidate identity failing on a checkout that gitignores .nmg-sdlc

**Issue**: #476
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Reproduction

1. In the nmg-sdlc checkout, where `.gitignore` lists `.nmg-sdlc/` and `.nmg-sdlc/` exists, run `git read-tree HEAD` then `git add -A -- . ':(exclude).nmg-sdlc'` against a temporary `GIT_INDEX_FILE`.
2. git 2.50.1 prints `The following paths are ignored by one of your .gitignore files: .nmg-sdlc` and exits 1.
3. The registered gate reports `repository.nmg-sdlc-smoke: incomplete — nmg-sdlc-smoke candidate identity unavailable` after provisioning.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The candidate tree is computed whether or not `.nmg-sdlc` is ignored, and it never contains `.nmg-sdlc` content. |
| **Actual** | `candidateTree` returns `null` and the smoke gate stops `incomplete` before delivery. |

## Acceptance Criteria

### AC1: A checkout that ignores .nmg-sdlc yields a candidate tree

**Given** a plugin checkout whose `.gitignore` lists `.nmg-sdlc/` and which has files under `.nmg-sdlc/`
**When** `candidateTree` runs
**Then** it returns the tree SHA of the working tree without `.nmg-sdlc` content

### AC2: A checkout that does not ignore .nmg-sdlc still leaves it out

**Given** a plugin checkout that does not ignore `.nmg-sdlc/` and has files under it
**When** `candidateTree` runs
**Then** the returned tree contains no `.nmg-sdlc` entry

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `candidateTree` passes `:(exclude).nmg-sdlc` only when `git check-ignore -q .nmg-sdlc` exits 1, and returns `null` on any other check-ignore failure | Must |

## Out of Scope

- The verification-report exclusion, which is unchanged
