# Defect Report: Commit resolved queue-head merges and retry transient GitHub reads in /sdlc-execute

**Issue**: #575
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/573-accept-a-merge-of-origin-main-as-a-valid-implement-result-in-publication-proof/

## Reproduction

1. Run `/sdlc-execute` with two or more issues, so that a branch at the head of the merge queue is sent back to implement with `queue_integration_conflict`.
2. The implement worker merges `origin/<default>` into the issue branch and stages the conflict resolution.
3. `scripts/sdlc-safe-recoveries.mjs` offers no subcommand that concludes the merge. The worker stops with `MERGE_HEAD` present and no merge commit.
4. Separately, while the controller reads issue evidence, the `gh issue view` call fails once with a network or HTTP 5xx error.
5. `collectEvidence` records no issue, and the controller throws `issue #N evidence unavailable` and exits.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A supported helper commits a resolved integration merge so the worker can hand back. A transient GitHub read failure is retried with backoff, and the controller continues. |
| **Actual** | The worker has no supported way to conclude the merge and stalls. A single transient `gh` failure ends the controller run. |

## Acceptance Criteria

### AC1: A resolved merge can be committed

**Given** an implement worker that has resolved conflicts from merging `origin/main`
**When** it finishes the resolution
**Then** a supported helper commits the merge and the worker hands back

### AC2: Transient GitHub reads are retried

**Given** a GitHub read that fails once with a network or 5xx error
**When** the controller reads issue evidence
**Then** it retries, and on success continues without exiting or losing the pending decision

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `sdlc-safe-recoveries.mjs commit-merge --issue N --step implement --spec specs/N-SLUG [--controller-run-id R]` commits an in-progress integration merge with `git commit --no-edit` and prints `NMG_SDLC_PUBLICATION` with `passed: true` and the new commit SHA. | Must |
| FR2 | `commit-merge` refuses, without committing, in each of these cases: no `MERGE_HEAD` (`merge_not_in_progress`); a merge that is not an integration of the fetched default branch, or whose integration change set contains a denied path (`publication_scope_unproven`); unmerged index entries (`merge_unresolved`); unstaged or untracked non-runtime changes (`merge_unstaged`); and a branch that is not the issue's (`publication_branch_mismatch`). | Must |
| FR3 | write-code concludes a `queue_integration_conflict` merge, and any in-progress integration merge it finds with all conflicts resolved, by running `commit-merge` and then pushing and reconciling. It never concludes such a merge with raw `git commit`. | Must |
| FR4 | The controller's issue-evidence reads retry a failed `gh` call whose output shows a transient failure (network error, timeout, or HTTP 5xx) up to 3 more times, with backoff of 1 s, 2 s, then 4 s. A call that succeeds on a retry is used as the result. | Must |
| FR5 | A non-transient `gh` failure (for example HTTP 404 or an authentication error) is not retried. Git commands are never retried by this path. | Must |

## Out of Scope

- The integration-merge bind and reconcile acceptance owned by #573.
- Retrying GitHub writes, such as pull-request creation, merge, labels, or comments.
- The controller's own queue-head integration (`integrateDefault`).

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #575 | 2026-11-19 | Initial defect report |
