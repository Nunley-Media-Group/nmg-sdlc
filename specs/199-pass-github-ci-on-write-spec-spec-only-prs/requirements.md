# Defect Report: Pass GitHub CI on write-spec spec-only PRs

**Issue**: #199
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/125-add-github-actions-contribution-gates-to-project-setup/

---

## Reproduction

1. Run `/sdlc-write-spec #N` through approval for an issue whose approved four-file package is not already on the default branch (directory name not already in `CURRENT_SPEC_DIRECTORIES`).
2. Observe the spec-only PR titled `docs: approve spec for #N` with changes only under `specs/{N}-{slug}/`.
3. Wait for `nmg-sdlc contribution gate` and `nmg-sdlc contract verification` on that pull request.
4. Observe failed checks from the gate and/or from `verify-current-specs.mjs` (`Obsolete or mismatched spec directories remain`), and a failed or blocked squash-merge.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | On a spec-only write-spec PR, both `nmg-sdlc contribution gate` and `nmg-sdlc contract verification` succeed, including when the PR adds `specs/{N}-{slug}/`. Squash-merge into the default branch succeeds. Issue `#N` remains open. |
| **Actual** | The contribution gate fails missing-evidence rules on spec-only PRs. Independently, contract verification fails because `CURRENT_SPEC_DIRECTORIES` rejects the new spec directory. Squash-merge fails when those jobs are red. |

## Acceptance Criteria

### AC1: Contribution gate and contract verification succeed on spec-only write-spec PRs

**Given** `/sdlc-write-spec #N` opened a spec-only PR titled `docs: approve spec for #N` whose changed paths are only under `specs/{N}-{slug}/`, including a package directory that was not previously on the default branch
**When** `nmg-sdlc contribution gate` and `nmg-sdlc contract verification` complete on that pull request
**Then** both jobs succeed, including the contract-verification step that runs `verify-current-specs.mjs`

### AC2: Spec-only squash-merge succeeds and leaves the issue open

**Given** that spec-only PR with both of those jobs successful
**When** write-spec squash-merges it into the repository default branch
**Then** the merge succeeds, the approved spec package is on the default branch, and issue `#N` remains open because the PR body does not use `Closes`, `Fixes`, or `Resolves`

### AC3: Consumer contribution gate succeeds for the same spec-only PR shape

**Given** a consumer repository that uses the managed nmg-sdlc contribution gate
**When** an equivalent spec-only write-spec PR is opened
**Then** that contribution-gate check succeeds

### AC4: Implementation PRs still require full evidence

**Given** a pull request that changes non-spec product paths and does not provide verification evidence
**When** the contribution gate runs
**Then** the gate still fails missing-evidence rules, and a docs-only exception still cannot cover spec or source paths

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Spec-only write-spec PRs succeed on `nmg-sdlc contribution gate` and `nmg-sdlc contract verification` | Must |
| FR2 | Adding `specs/{N}-{slug}/` on a write-spec PR does not fail contract verification | Must |
| FR3 | Those PRs squash-merge into the default branch without those jobs blocking | Must |
| FR4 | The implementation issue stays open after spec merge | Must |
| FR5 | Implementation PRs keep full contribution-gate evidence rules | Must |

## Out of Scope

- Changing `/sdlc-execute` implementation-PR evidence rules
- Auto-closing the implementation issue from the spec PR
- Skipping or deleting GitHub Actions so write-spec PRs avoid checks
- Changing skill-inventory audit or marketplace-pointer workflows

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #199 | 2026-08-21 | Initial defect report |
