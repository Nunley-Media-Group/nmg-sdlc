# Tasks: Wait through stale UNSTABLE spec PR mergeability after checks pass

**Issue**: #429
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

### T001: Reproduce the stale aggregate transition before changing behavior

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Add a deterministic existing-PR fixture with one unchanged head H, passing expected and reported checks, UNSTABLE followed by enough CLEAN views for the fresh recheck.
- [ ] Record a focused pre-fix run that returns `pr_merge_blocked` without merging; after the fix, require observation order, no duplicate PR, and exactly one `--match-head-commit H` merge.
- [ ] Replace the existing assertion that UNSTABLE with complete checks is itself a terminal policy blocker; keep genuine BLOCKED and failed-check regressions. Do not make an indefinitely UNSTABLE test hang.

### T002: Correct plugin-owned spec publication readiness

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Acceptance**:
- [ ] Treat UNSTABLE alone after passing checks as not yet ready; continue observing the same PR, branch, base, and pinned head until two fresh passing CLEAN observations.
- [ ] Retain #407's expected/required/unfiltered check gate, absence/pending/UNKNOWN handling, immediate failed-check and genuine BLOCKED failure, drift rejection, and exact-head squash merge without force/admin bypass or wall-clock timeout.
- [ ] Reject closed or draft PRs and independently evidenced non-CI policy blockers with actionable diagnostics; preserve existing-PR reuse and post-merge semantics.

### T003: Verify rejection boundaries and complete plugin checks

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/publish-approved-spec.mjs`
**Type**: Verify
**Acceptance**:
- [ ] Exercise deterministic BLOCKED/non-CI policy, failed checks, changed head/branch/base, closed/draft, and incomplete/UNKNOWN check states; no rejecting case issues a merge or reports delivery.
- [ ] Run the focused pre/post-fix regression and full `scripts/` test suite; validate `node scripts/verify-plugin-surface.mjs --root . --label repository` and the applicable plugin candidate surface.
- [ ] Record exact command outcomes and keep pre-existing #145 evidence intact. Candidate installation and registered fresh-fixture smoke must use the reviewed plugin candidate, not a direct mutation of #145.

### T004: Verify the installed candidate and deliver the plugin fix

**File(s)**: `scripts/publish-approved-spec.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Verify
**Acceptance**:
- [ ] Verify candidate installation and registered `repository.nmg-sdlc-smoke` smoke through the configured plugin delivery workflow, with fresh authorized fixtures and invocation-bound evidence; do not repurpose smoke PR #145 as a fixture.
- [ ] Complete review/CI and exact-head plugin PR merge before any separate authorized resumption of #144 publication through its existing PR/head; preserve #420/#425 and PennyScan.
- [ ] Keep any later user-facing documentation and changelog aligned during implementation delivery, not during this spec-only drafting step.
