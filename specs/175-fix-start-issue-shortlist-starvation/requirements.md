# Defect Report: Fix Start-Issue Shortlist Starvation

**Issue**: #175
**Date**: 2026-08-15
**Status**: Approved
**Author**: Codex
**Severity**: High
**Related Spec**: specs/10-start-issue-skill/

---

## Reproduction

1. Put more than ten open issues in one milestone.
2. Make nine of the first ten depend on open execution prerequisites.
3. Leave the tenth open but mark every readable GitHub Project status `Done`.
4. Keep at least four later issues open, unblocked, and not Done.
5. Invoke bare `$nmg-sdlc:start-issue`.

The workflow fetches only the first ten issues, filters nine as blocked, and offers the completed issue without inspecting later ready work.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Automatic discovery expands a bounded window until four selectable issues exist or the scope is exhausted, and confirmed all-Done Project work is omitted. |
| **Actual** | Dependency filtering happens after a fixed ten-issue fetch, so the shortlist starves and can contain only an already-completed coordination epic. |

## Acceptance Criteria

### AC1: Backfill After Readiness Filtering

**Given** the initial ten open issues contain fewer than four selectable candidates
**When** bare start-issue discovers work
**Then** it expands the fetch limit in bounded ten-issue increments
**And** reevaluates the ordered candidate prefix from fresh readiness evidence
**And** stops when four candidates exist, the scope is exhausted, or 100 issues have been inspected

### AC2: Exclude Confirmed Completed Project Work

**Given** an open issue has at least one readable Project status
**And** every readable status equals `Done` case-insensitively
**When** automatic discovery builds its shortlist
**Then** the issue is excluded and counted separately from dependency-blocked issues
**And** missing, unreadable, or mixed Project statuses do not prove completion

### AC3: Preserve Explicit Recovery

**Given** a user supplies an issue number explicitly or through manual entry
**When** every readable Project status is Done
**Then** the issue remains selectable
**And** the confirmation warns that starting it will move completed Project work back to In Progress

### AC4: Preserve Relationship and Deliverable Safety

**Given** an expanded ordered prefix contains coordination epics, execution dependencies, or structured deliverable requirements
**When** discovery evaluates issues needed to fill the shortlist
**Then** existing complete pagination, hydration, fail-closed classification, blocked counting, and topological ordering remain unchanged
**And** every expansion reevaluates the ordered candidate prefix from fresh evidence rather than appending stale partial results
**And** fail-closed evidence before the fourth verified choice stops selection
**And** unrelated trailing records fetched after the target is satisfied remain uninspected and cannot abort or reorder the shortlist

### AC5: Prove the PathCast Regression Without Mutation

**Given** a disposable fixture with ten initially blocked-or-Done candidates followed by four ready candidates and an unrelated malformed trailing candidate
**When** bare start-issue discovery runs
**Then** the later ready candidates are reported
**And** the Done coordination issue is omitted
**And** discovery creates no branch and performs no GitHub mutation

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Use a four-choice target, ten-issue initial/increment size, and 100-issue maximum. | Must |
| FR2 | Reevaluate the ordered candidate prefix from fresh evidence after every expansion and stop after four verified choices. | Must |
| FR3 | Exclude only open issues with one or more readable statuses that are all Done. | Must |
| FR4 | Continue when Project metadata is unavailable, with an exact warning and no inferred completion. | Must |
| FR5 | Preserve explicit issue-number recovery and disclose the Project-status transition. | Must |
| FR6 | Add static contract and disposable forward-exercise coverage. | Must |

## Out of Scope

- Closing stale consumer issues or coordination epics
- Rewriting consumer Project status during discovery
- Changing epic identity, dependency direction, or deliverable availability semantics
- Displaying more than four automatic issue choices
- Removing manual issue-number entry

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #175 | 2026-08-15 | Initial defect contract |
