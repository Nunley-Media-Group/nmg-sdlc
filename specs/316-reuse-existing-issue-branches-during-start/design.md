# Design: Reuse existing issue branches during start

**Issue**: #316
**Date**: 2026-08-28
**Status**: Approved

---

## Problem

`scripts/start-issue.mjs` treats every non-canonical current branch as a request to create a new GitHub development branch. A canonical branch left on `origin` by a merged spec-only pull request causes `gh issue develop` to reject the duplicate name.

## Decision

Resolve the canonical branch in strict precedence order:

1. Verify and check out an existing local `refs/heads/{N}-{slug}` branch.
2. Fetch the exact `refs/heads/{N}-{slug}` ref from `origin` into its remote-tracking ref and create a local tracking branch.
3. Only when that exact remote fetch reports no usable branch, retain `gh issue develop` branch creation.
4. Verify `git branch --show-current` equals the canonical name after every path.

No path uses force checkout, reset, stash, branch deletion, or a fuzzy branch match.

## Files

| Path | Change |
|------|--------|
| `scripts/start-issue.mjs` | Reuse exact local and origin branches before creation. |
| `scripts/__tests__/start-issue-controller.test.mjs` | Cover local reuse, origin reuse, missing-branch creation, and failed checkout. |
| `CHANGELOG.md` | Record the pending fix. |
