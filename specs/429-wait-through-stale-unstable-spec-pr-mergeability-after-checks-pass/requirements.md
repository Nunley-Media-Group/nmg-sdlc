# Defect Report: Wait through stale UNSTABLE spec PR mergeability after checks pass

**Issue**: #429
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

## Reproduction

While publishing smoke issue #144's approved spec, `scripts/publish-approved-spec.mjs merge` opened spec-only PR #145 at exact head `7080e860318a34da50cf2308443d7ab4f0b3fe59`. At 11:00, after the terminal passing checks were reported/expected, the helper returned `pr_merge_blocked` for `mergeStateStatus: UNSTABLE`. The same PR and head soon reported successful checks and CLEAN without a branch mutation; publication had already stopped before merge. `publicationSnapshot` (lines 422–450) currently treats `!pending && UNSTABLE` as a proven blocker, while `awaitPublicationReady` (lines 453–460) otherwise keeps polling. This is an observation race, not evidence of an explicit non-CI policy violation.

## Acceptance Criteria

### AC1: Observe stale UNSTABLE through CLEAN at the pinned head
**Given** an OPEN approved spec-only PR at head H whose expected and reported checks are all terminal passing but whose aggregate `mergeStateStatus` temporarily reads UNSTABLE
**When** publication obtains successive observations of that same PR, branch, base, and H
**Then** it does not classify UNSTABLE alone as a proven non-CI blocker, create a duplicate PR, mutate H, or merge while UNSTABLE
**And** it continues observing without an artificial wall-clock deadline until fresh passing checks and CLEAN are reconfirmed for H
**And** it issues exactly one squash merge guarded by `--match-head-commit H` only after the fresh CLEAN recheck.

### AC2: Preserve fail-closed safety gates
**Given** a terminal failed check, a separately evidenced explicit non-CI policy blocker (including BLOCKED), a changed head/branch/base, a closed PR, or a draft PR
**When** publication rechecks readiness before merge
**Then** it fails with distinct actionable PR, head, check or blocker evidence as appropriate, without merging or marking the spec delivered
**And** UNKNOWN and absent, unreported, or pending expected/reported checks remain non-passing
**And** publication never uses force merge, administrator bypass, auto-merge, or weakened branch protection.

### AC3: Reproduce and retain the regression while reusing the existing PR
**Given** a deterministic fixture where a single existing PR at unchanged H reports all expected and reported checks passing while mergeability transitions UNSTABLE to CLEAN
**When** the focused regression runs against pre-fix and post-fix behavior
**Then** pre-fix reproduces premature `pr_merge_blocked` without a merge, and post-fix observes the transition, reuses the same PR without creating another, and merges exactly once with `--match-head-commit H`
**And** a truly BLOCKED policy state, failed checks, and identity drift remain rejecting cases.

## Scope and boundaries

Change only plugin-owned spec publication readiness and focused tests for this issue. Preserve #407's CI wait, required-context discovery, second fresh snapshot, existing-PR reuse, and post-merge checkout/label/error semantics. The current work is only the four-file Approved specification; implementation, tests, documentation, GitHub mutation, review/CI, installation, and live smoke are subsequent approved delivery work. Preserve smoke PR #145 and its exact-head evidence; do not retry or merge it during spec drafting. Do not touch #420/#425 branches or PennyScan. Do not invoke `/sdlc-*` to repair the plugin itself.
