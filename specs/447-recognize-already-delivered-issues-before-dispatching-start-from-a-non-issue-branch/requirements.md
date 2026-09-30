# Defect Report: Recognize already-delivered issues before dispatching START from a non-issue branch

**Issue**: #447
**Date**: 2026-09-30
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/441-continue-an-explicit-execute-queue-after-the-previous-issue-is-delivered/

## Reproduction

1. In a disposable fixture repository, check out the default branch with a clean worktree.
2. Issue #42 is CLOSED, has an Approved spec, and exactly one same-repository MERGED pull request from branch `42-example` whose closing references include #42.
3. Run `/sdlc-execute #42 #43`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Execute prints `#42: MERGED and CLOSED`, dispatches no worker for #42, and proceeds to #43. |
| **Actual** | Execute dispatches a START worker for #42; START fails, the run exits 1, and #43 never runs. |

## Acceptance Criteria

### AC1: Delivered Issue Is Recognized Off-Branch

**Given** a clean non-issue branch and an explicit issue that is CLOSED with exactly one same-repository MERGED closing pull request whose head branch belongs to that issue
**When** `/sdlc-execute` processes that issue
**Then** it prints `#N: MERGED and CLOSED`, dispatches no worker for that issue, and continues with the next queued issue

### AC2: Closed Issue Without Delivery Proof Stops

**Given** a clean non-issue branch and an explicit issue that is CLOSED with no MERGED closing pull request
**When** `/sdlc-execute` processes that issue
**Then** the run exits 1 with stderr beginning `issue_closed_undelivered` and naming the issue, and dispatches no worker

### AC3: Ambiguous Or Unreadable Delivery Evidence Stops

**Given** a clean non-issue branch and an explicit CLOSED issue with more than one MERGED closing pull request, or a failed or malformed GitHub read of the issue or its closing pull request
**When** `/sdlc-execute` processes that issue
**Then** the run exits 1 with `merged_pr_ambiguous` or `delivery_evidence_unavailable` respectively, and dispatches no worker

### AC4: Open-Issue And On-Branch Routing Is Preserved

**Given** an OPEN explicit issue on a non-issue branch, or any issue on its own issue branch
**When** `/sdlc-execute` processes that issue
**Then** routing is unchanged: the OPEN issue still passes spec-created label, blocked-by dependency, and Approved-spec admission before START, and an on-branch delivered issue still prints `#N: MERGED and CLOSED`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | For an explicit issue on a non-issue branch, read the issue's live state and closing pull requests before admission checks; when CLOSED, decide delivery without requiring the local issue branch or the spec-created label | Must |
| FR2 | Delivery proof requires a same-repository pull request in state MERGED with `mergedAt`, a 40-hex merge commit, closing references containing the issue, and a head branch that parses to the issue number | Must |
| FR3 | CLOSED without proof fails `issue_closed_undelivered`; more than one MERGED closing pull request fails `merged_pr_ambiguous`; a failed or malformed GitHub read fails `delivery_evidence_unavailable`; none dispatch a worker or mutate git or GitHub | Must |

## Out of Scope

- Changing how START classifies a CLOSED issue
- Changing deliver's merge or closing-linkage checks

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #447 | 2026-09-30 | Initial defect report |
