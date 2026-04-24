# Defect Report: Drop unsupported `parent` field from `gh issue view` JSON query in sdlc-runner

**Issue**: #91
**Date**: 2026-04-21
**Status**: Draft
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/`

---

## Reproduction

### Steps to Reproduce

1. Install `gh` 2.86.0 (or any version that does not expose `parent` on `gh issue view --json`).
2. Configure an `sdlc-config.json` pointing at a repo with open, unblocked issues in the active milestone.
3. Run `node scripts/sdlc-runner.mjs --config <config>` (or invoke `/run-loop`).

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | Any (macOS, Linux, Windows) |
| **Version / Commit** | nmg-sdlc 1.54.0 |
| **Runtime** | Node.js + `gh` 2.86.0 |

### Frequency

Always — the field rejection is deterministic on `gh` versions that do not expose `parent` on `gh issue view --json`.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | `gh issue view` fetches metadata using only supported JSON fields, `selectNextReadyIssue` returns a non-null `issue`, and the pipeline proceeds past Step 2 (`startIssue`). |
| **Actual** | Every `gh issue view <N> --json …,parent,…` call fails with `Unknown JSON field: "parent"`, every candidate lands in `fetchFailed`, and the runner logs `FAILURE LOOP DETECTED: all issues blocked` and exits 1 before selecting any issue. |

### Error Output

```
Unknown JSON field: "parent"
Available fields: assignees, author, body, closed, closedAt, closedByPullRequestsReferences,
comments, createdAt, id, isPinned, labels, milestone, number, projectCards, projectItems,
reactionGroups, state, stateReason, title, updatedAt, url
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** `gh` 2.86.0 is installed
**And** an `sdlc-config.json` targets a repo with open, unblocked issues in the active milestone
**When** `node scripts/sdlc-runner.mjs --config <config>` is run
**Then** no `Unknown JSON field: "parent"` warnings are emitted
**And** `selectNextReadyIssue` returns a non-null `issue`
**And** the runner proceeds past Step 2 (`startIssue`) instead of logging `FAILURE LOOP DETECTED: all issues blocked`

### AC2: Parent-Based Dep Blocking Preserved on Supportive gh

**Given** a future `gh` version that does expose `parent` on `gh issue view --json`
**When** the runner fetches candidate issues
**Then** parent-based dependency blocking continues to work as before
**And** the existing `if (d.parent && typeof d.parent.number === 'number' …)` guard still resolves parent numbers into the dependency set

### AC3: No Regression on Existing Dep Resolution

**Given** issues with `Depends on: #N` / `Blocks: #N` body cross-refs
**When** the runner selects the next ready issue
**Then** topological ordering and blocking behavior are unchanged
**And** the lowest-numbered ready issue is still selected

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Remove `parent` from the `--json` field list in `selectNextIssueFromMilestone` (`scripts/sdlc-runner.mjs` ~line 1548) so `gh issue view` succeeds on `gh` 2.86.0 and similar releases. | Must |
| FR2 | Preserve the existing parent-field guard logic so the runner continues to honour parent-link dep blocking on `gh` versions that do expose the field (the guard already tolerates a missing/absent `parent`). | Should |

---

## Out of Scope

- Capability probe at startup to conditionally include `parent` when supported (separate follow-up enhancement).
- GraphQL `subIssuesOf` / REST API fallback for parent-link tracking on newer `gh` versions (separate follow-up).
- Any other changes to `sdlc-runner.mjs` beyond the one-line field-list fix and its accompanying regression test.

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed (High — blocks the runner from selecting any issue)
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included (AC2 and AC3)
- [x] Fix scope is minimal — no feature work mixed in
- [x] Out of scope is defined
