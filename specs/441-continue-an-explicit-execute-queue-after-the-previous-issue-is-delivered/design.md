# Root Cause Analysis: Continue an explicit execute queue after the previous issue is delivered

**Issue**: #441
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG

---

## Root Cause

`runExecute` in `scripts/sdlc-execute.mjs` iterates the queued issues. Each iteration reads the checkout and throws `active_issue_conflict` whenever `parseIssueBranch(current.branch)` names a different issue. Delivery leaves the checkout on the delivered issue's branch, so the second queued issue always hits that guard.

### Affected Code

| File | Lines / Symbol | Role |
|------|----------------|------|
| `scripts/sdlc-execute.mjs` | `runExecute` per-issue loop | Rejects any foreign issue branch |

---

## Fix Strategy

### Approach

When the branch belongs to another issue, require a clean worktree (ignoring `.omp/`) and `completed(cwd, run, branchIssue.issueNumber, current.branch, current.head)`. Then read `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, run `git switch <default>`, and re-read the checkout. Otherwise keep throwing `active_issue_conflict`. The existing start step already integrates fresh default history.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Leave a proven-delivered foreign issue branch for the default branch | Let explicit queues continue |
| `scripts/__tests__/sdlc-execute.test.mjs` | Queue regression and fail-closed coverage | Prove the boundary |

### Blast Radius

- **Direct impact**: explicit multi-issue `/sdlc-execute` queues.
- **Risk level**: Low. Only an exact-head merged, closed, clean branch is left.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Abandoning undelivered work | Low | Require exact-head MERGED PR, CLOSED issue, and a clean worktree |
| Wrong default branch | Low | Read `defaultBranchRef` from GitHub; fail closed when unreadable |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns
