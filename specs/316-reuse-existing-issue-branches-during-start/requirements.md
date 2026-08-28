# Requirements: Reuse existing issue branches during start

**Issue**: #316
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/

---

## User Story

**As a** maintainer running `/sdlc-execute` after spec approval
**I want** start to reuse the canonical issue branch when it already exists
**So that** a stale spec branch does not stop delivery with `branch_checkout_failed`

---

## Acceptance Criteria

### AC1: Reuse a Local Canonical Issue Branch

Given a clean checkout on another branch and an existing local `{N}-{slug}` branch, start checks out that branch and does not call `gh issue develop`.

### AC2: Reuse an Existing Origin Issue Branch

Given no local canonical branch and an exact `origin/{N}-{slug}` branch, start fetches that exact ref, creates a tracking local branch, and does not call `gh issue develop`.

### AC3: Create a Missing Issue Branch

Given neither canonical branch exists, start retains the current `gh issue develop --checkout --name ... --base ...` behavior.

### AC4: Fail Closed on Checkout Failure

If any selected checkout path does not leave the exact canonical branch active, start writes `branch_checkout_failed` without forcing, resetting, stashing, or discarding user work.

---

## Out of Scope

- Changing canonical branch naming.
- Deleting stale local or remote branches.
- Changing worker ownership or later execute stages.
