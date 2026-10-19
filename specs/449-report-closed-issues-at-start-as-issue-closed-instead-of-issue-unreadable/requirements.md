# Defect Report: Report closed issues at START as issue_closed instead of issue_unreadable

**Issue**: #449
**Date**: 2026-10-18
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

## Reproduction

1. In a disposable fixture, `gh issue view 42 --json number,title,body,labels,state` exits 0 and returns issue #42 with state `CLOSED`.
2. Run START for #42 (`startIssue({ issue: 42 })`, or `node scripts/start-issue.mjs --issue 42`).
3. Read `.omp/sdlc/handoffs/42-start.json`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The failed handoff has `reasonCode: "issue_closed"` and summary `GitHub issue #42 is CLOSED`. |
| **Actual** | The failed handoff has `reasonCode: "issue_unreadable"` and summary `GitHub issue #42 is unreadable`. |

## Acceptance Criteria

### AC1: Closed Issue Is Reported As Closed

**Given** a successful GitHub read of the requested issue whose `number` equals the requested number and whose `state` is `CLOSED`
**When** START runs
**Then** it writes a failed handoff with `reasonCode: "issue_closed"`, summary `GitHub issue #N is CLOSED`, `intervention: true`, `step: "start"`, and `next: null`, before any blocked-by read, git command, or GitHub mutation

### AC2: Unreadable Issue Is Unchanged

**Given** a failed GitHub read, unparseable output, a parsed issue whose `number` differs from the requested number, or a parsed issue whose `state` is neither `OPEN` nor `CLOSED`
**When** START runs
**Then** it writes a failed handoff with `reasonCode: "issue_unreadable"` and summary `GitHub issue #N is unreadable`, and runs no blocked-by read, git command, or GitHub mutation

### AC3: Open Issue Is Unchanged

**Given** a successful read of the requested issue with state `OPEN`
**When** START runs
**Then** it proceeds through blocked-by, branch, and handoff behavior unchanged

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | After a successful read whose `number` equals the requested issue, a string `state` equal to `CLOSED` (case-insensitive) fails with `issue_closed` and summary `GitHub issue #N is CLOSED`; a failed, unparseable, or number-mismatched read, or a `state` that is not a string equal to `OPEN` or `CLOSED` (case-insensitive), fails with `issue_unreadable` and summary `GitHub issue #N is unreadable` | Must |
| FR2 | The `issue_closed` and `issue_unreadable` handoffs are written before any blocked-by read, runtime untrack, git command, or GitHub mutation | Must |

## Out of Scope

- `issue_unreadable` handling in `scripts/publish-approved-spec.mjs` and `scripts/sdlc-deliver.mjs`
- Execute's routing of CLOSED issues before START

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #449 | 2026-10-18 | Initial defect report |
