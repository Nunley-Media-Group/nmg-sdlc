# Defect Report: Require observed closing-issue linkage before exact-head merge

**Issue**: #448
**Date**: 2026-10-06
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/8-open-pr-skill/

## Reproduction

1. In a deterministic delivery fixture, issue #42 has an open, non-draft pull request #77 on its issue branch with passing required checks, `CLEAN` mergeability, a full Pass registered verification, and body text containing `Closes #42`.
2. GitHub reports `closingIssuesReferences: []` for pull request #77.
3. Run ordinary delivery: `runDeliver({ cwd, issue: 42, run })` (equivalently `node scripts/sdlc-deliver.mjs --issue 42`).

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Delivery does not issue `gh pr merge`. It fails the deliver handoff with `closing_linkage_unobserved`, leaving the pull request open and the issue branch intact. The deliver worker waits for CI and the pull request's other checks and processes to complete, re-observes live linkage, diagnoses repository-specific causes, and reruns ordinary delivery; the merge happens only after linkage is observed. |
| **Actual** | Delivery runs the exact-head squash merge first, then `reconcilePostMerge` reads `closingIssuesReferences` and fails `delivery_linkage_unproven` with the pull request irreversibly merged and the issue still OPEN. |

## Acceptance Criteria

### AC1: Missing Linkage Blocks The Merge

**Given** a merge-ready pull request whose live closing references do not include an entry with the issue number and the same-repository issue URL
**When** ordinary delivery runs
**Then** no merge is issued, the deliver handoff fails with reason `closing_linkage_unobserved` and summary `PR #P does not link issue #N; exact-head merge not attempted`, and the issue branch, its remote ref, and the open pull request remain intact

### AC2: Observed Linkage Allows The Merge

**Given** a merge-ready pull request whose live closing references include the issue number and the same-repository issue URL
**When** ordinary delivery runs
**Then** delivery reads those closing references after the registered gate and before the merge command, performs the exact-head merge, and proves the MERGED pull request and CLOSED issue as before

### AC3: Worker Waits And Diagnoses Without A Fixed Limit

**Given** delivery reported `closing_linkage_unobserved`
**When** the deliver worker follows the inlined open-pr workflow
**Then** the workflow directs it to wait for CI and the pull request's other checks and processes to complete, re-observe live closing linkage, diagnose repository-specific causes, and rerun ordinary delivery with no numeric observation limit; it never merges outside ordinary delivery, force-pushes, or synthesizes a handoff; and when linkage still cannot be established it keeps the branch and pull request, leaves the delivery-written failed handoff, and reports the exact gap

### AC4: Post-Merge Reconciliation Is Preserved

**Given** a pull request that GitHub already reports as MERGED, including after a lost merge acknowledgment
**When** delivery reconciles it
**Then** no new merge is issued, existing post-merge proof passes when linkage and CLOSED state are observed, and a merged pull request without linkage still fails `delivery_linkage_unproven` with summary `Merged PR #P does not link issue #N`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Immediately before the exact-head merge, read the pull request's live closing references and require one matching the issue number and the same-repository issue URL | Must |
| FR2 | When that reference is absent, do not merge; fail the deliver handoff with `closing_linkage_unobserved` and summary `PR #P does not link issue #N; exact-head merge not attempted`, with no in-script timeout or observation count for linkage | Must |
| FR3 | The open-pr workflow and its terminal-delivery reference treat `closing_linkage_unobserved` as a non-terminal worker condition: wait for CI and other checks and processes to complete, re-observe linkage, diagnose repository-specific causes, and rerun ordinary delivery; forbid merging outside ordinary delivery, force-pushing, and handoff synthesis | Must |

## Out of Scope

- Changing post-merge reconciliation or the `delivery_linkage_unproven` reason
- Changing execute's handling of failed deliver handoffs
- Repairing the existing undefined `reconciliationFailure` call sites in `scripts/sdlc-deliver.mjs`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #448 | 2026-10-06 | Initial defect report |
