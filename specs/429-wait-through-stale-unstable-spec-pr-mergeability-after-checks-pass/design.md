# Root Cause Analysis: Stale aggregate UNSTABLE after successful CI

**Issue**: #429
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

## Root Cause

`scripts/publish-approved-spec.mjs` already enforces #407's exact-head expected and reported check gate. In `publicationSnapshot`, `!pending && ['BLOCKED', 'UNSTABLE'].includes(details.mergeStateStatus)` converts either aggregate state into `pr_merge_blocked`. GitHub can lag after checks pass: #145 at unchanged `7080e860318a34da50cf2308443d7ab4f0b3fe59` showed UNSTABLE before CLEAN. Therefore an UNSTABLE aggregate alone cannot prove a non-CI policy blocker. The existing `awaitPublicationReady` loop and two successful snapshots can continue observing this transition without relaxing the merge condition.

## Fix Strategy

Keep the readiness decision in `scripts/publish-approved-spec.mjs` and retain the same PR, branch, base, and pinned local head for every observation. Continue to fetch the PR view, effective ruleset/branch-protection expected contexts, required checks, and unfiltered checks; fail immediately on a terminal failed check or changed PR identity. Missing expected contexts, zero checks, pending checks, and UNKNOWN mergeability never grant readiness. An UNSTABLE aggregate with passing checks is a wait state, not an assertion of policy failure or permission to merge. Explicit BLOCKED/non-CI policy evidence remains a terminal `pr_merge_blocked` failure with the observed status; do not reinterpret BLOCKED as transient merely because CI is passing. A draft PR must be rejected using reliable draft evidence rather than waiting for CLEAN; a closed PR must also reject. A malformed/unavailable PR or check response remains a readiness failure, not success.

`awaitPublicationReady` continues periodic observation without a wall-clock deadline for healthy observable CI/mergeability. Both successive fresh snapshots must independently report the same exact head, complete successful checks, and CLEAN before `mergeSpec` issues its existing squash `gh pr merge --match-head-commit H`. Preserve existing PR discovery/reuse and post-merge checkout, fast-forward pull, label, and reconciliation behavior. No force/admin bypass, branch-protection weakening, auto-merge, or additional PR is part of the fix.

## Verification strategy

In `scripts/__tests__/publish-approved-spec.test.mjs`, model a deterministic sequence: same OPEN non-draft PR and H, complete passing expected/reported checks, UNSTABLE on one or more views, then CLEAN on enough fresh views to satisfy the two-snapshot gate. The fixture must not advance a head or change checks to make the test pass. Capture the pre-fix `pr_merge_blocked` failure, then assert post-fix observation order, no early merge or `pr create` on the existing-PR route, and exactly one guarded merge. Replace the old assertion that an indefinitely UNSTABLE status is a proven blocker: without independent policy evidence it is indeterminate, so a fixture should transition or provide a genuine BLOCKED signal rather than hang. Retain and expand negative cases for genuine BLOCKED, failed checks, identity/base/branch drift, closed/draft PR, and incomplete/UNKNOWN checks. Verify focused and full scripts tests, plugin surface, candidate installation, and a registered fresh-fixture smoke run during implementation delivery; local tests alone do not prove hosted readiness or installed behavior.

## Risks

- UNSTABLE might also accompany a genuine blocker. Do not infer permission from it; only explicit blocker evidence fails immediately and only fresh CLEAN plus successful checks permits merge.
- A permanently UNSTABLE PR without explicit blocker evidence remains not ready; a healthy observable wait has no arbitrary deadline. External cancellation or a later explicit failure remains authoritative.
- A PR can change between observations or before the merge command. Re-read identity and checks, then retain GitHub's exact-head guard; never merge a new head or treat a failed merge as successful without existing reconciliation proof.
