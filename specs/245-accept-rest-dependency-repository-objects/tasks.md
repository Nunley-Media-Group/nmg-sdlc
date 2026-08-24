# Tasks: Accept REST dependency repository objects

**Issue**: #245
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/236-adopt-github-blocked-by-as-the-only-issue-dependency-type/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Normalize repository identity to a string | [ ] |
| T002 | Add REST-object and shape regression tests | [ ] |
| T003 | Verify detector, post-detect, and existing suites | [ ] |

---

### T001: Normalize repository identity to a string

**File(s)**: `scripts/issue-dependencies.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `repositoryIdentity` is added beside `repositoryFromUrl` with the exact precedence in design.md
- [ ] `normalizeIssue` compares `repositoryIdentity(raw) ?? repository` and never compares a repository object to the selected string
- [ ] `dependency_dangling` / `dependency_unreadable` reason-code selection is unchanged
- [ ] No PennyScan, issue `#8`, or upgrade-contract special case is introduced

**Notes**: Follow the fix strategy from design.md. Keep changes minimal.

### T002: Add REST-object and shape regression tests

**File(s)**: `scripts/__tests__/issue-dependencies.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `readBlockedBy` accepts a REST blocker with `repository: { full_name: 'acme/widgets' }`, no `nameWithOwner`, matching `repository_url`, and open or closed `state`
- [ ] GraphQL `{ nameWithOwner: 'acme/widgets' }`, string `repository: 'acme/widgets'`, and URL-only records still normalize
- [ ] A repository object without string `nameWithOwner`/`full_name` plus a matching `repository_url` is accepted
- [ ] Cross-repo `full_name`, `nameWithOwner`, string `repository`, and `repository_url` fail closed with `dependency_dangling` when `dependency: true`
- [ ] `dependencyRun` can attach `repository: { full_name: 'acme/widgets' }` to blocked-by payloads only; listing records stay URL-shaped
- [ ] `detectIssueDependencyUpgrade` completes for existing official edges whose blocked-by payloads use that REST object
- [ ] `applyUpgrade` post-detect after those edges are present does not set `postDetectError.reasonCode` to `dependency_dangling`

### T003: Verify no regressions

**File(s)**: `scripts/__tests__/issue-dependencies.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] Existing official blocked-by, cycle, dangling-target, and upgrade-reconciliation tests still pass
- [ ] Focused command in Verification runs green
- [ ] No public upgrade approval-contract change

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #245 | 2026-08-24 | Initial defect report |
