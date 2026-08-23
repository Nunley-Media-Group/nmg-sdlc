# Defect Report: Bare write-spec omits issues needing specs

**Issue**: #238
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG

---

## Bug Summary

Bare `/sdlc-write-spec` treats empty arguments as invalid usage instead of immediately presenting open issues that do not have the exact `spec-created` label. The intended shortlist exists only in the post-publication loop and uses a different approved-package filter.

## User Impact

A user who invokes the discoverable bare command must type or re-enter an issue number before starting the first specification. This hides the repository's actionable missing-spec set and adds an unnecessary interaction.

---

## Acceptance Criteria

### AC1: bare invocation immediately presents missing-spec issues

**Given** an interactive TUI invocation with empty or whitespace-only arguments
**And** one or more open issues lack the exact label `spec-created`
**When** `/sdlc-write-spec` starts
**Then** its first interaction is one `ask` with no prior usage or enter-number gate
**And** it authors at most the three lowest-numbered matches as `#M — {title}`, recommended index 0
**And** the final authored option is exactly `Finished — stop without writing a spec`
**And** automatic Other accepts `#M` or `M`
**And** selecting a listed issue or valid Other number enters the existing initial Discovery, Interview, and first-spec `xd://propose` path
**And** selecting Finished stops without printing publication or execute lines

### AC2: explicit and invalid argument behavior does not regress

**Given** an explicit `#N` or `N`
**When** write-spec starts
**Then** it skips the bare picker and follows the existing initial path unchanged
**And** a non-empty argument outside `^#?\d+$` still prints exactly `Usage: /sdlc-write-spec #N` and stops
**And** the post-publication loop still uses approved-package `candidates` and its existing `Finished — stop writing specs` option

### AC3: an empty missing-label set stops without asking

**Given** empty or whitespace-only arguments
**And** no open issue lacks the exact `spec-created` label
**When** write-spec starts
**Then** it prints exactly `No open issues missing spec-created.`
**And** it stops without `ask`, a usage line, or an enter-number option

### AC4: listing failure fails closed

**Given** empty or whitespace-only arguments
**And** open-issue or label evidence is malformed or unreadable
**When** write-spec starts
**Then** it prints the helper `reasonCode` or failure output
**And** it stops without inventing choices or asking for an issue number

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Treat trimmed-empty arguments as the bare picker path; preserve non-empty validation. | Must | TUI workflow only. |
| FR2 | Add a deterministic helper result containing open issues whose labels omit exact case-sensitive `spec-created`. | Must | Closed issues excluded. |
| FR3 | Sort matches numerically and author at most three plus the exact bare Finished label. | Must | Automatic Other remains available. |
| FR4 | Empty results print the exact no-open-missing-label message and do not call ask. | Must | No usage line. |
| FR5 | Helper/listing failure stops before ask and surfaces a stable reason. | Must | No guessed list. |
| FR6 | Explicit invocation, invalid non-empty usage, first-spec proposal/publication, and post-publish candidates remain unchanged. | Must | Separate filters and Finished labels. |

---

## Out of Scope

- Changing the post-publication candidate filter or Finished wording
- Changing `/sdlc-execute` selection
- Multi-select or more than three authored issue chips
- Adding `spec-created` before a specification is published

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #238 | 2026-08-23 | Initial defect report |
