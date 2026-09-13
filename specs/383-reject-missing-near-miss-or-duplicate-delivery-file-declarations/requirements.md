# Defect Report: Reject missing, near-miss, or duplicate delivery File(s) declarations

**Issue**: #383
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Reproduction

1. Approve a spec with an admitted delivery task that uses `**Files**:` instead of `**File(s)**:`.
2. Run execute preflight or bind publication scope.
3. Observe `parseDeliveryTaskFileLines()` ignore the near-miss line.
4. Observe `inspectPublicationScope()` return only spec-owned paths, allowing implementation dispatch with misleading authorization.

The same omission occurs when an admitted task has no file declaration. Two canonical declarations are silently combined rather than rejected.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every admitted delivery task has exactly one canonical `**File(s)**:` declaration. Missing, near-miss, and duplicate declarations fail with located `publication_scope_unproven` before any pane or worker. |
| **Actual** | Only exact canonical lines are parsed. Missing and near-miss lines disappear; duplicate canonical lines are combined. Execute can dispatch with spec-only or over-combined authority. |

## Acceptance Criteria

### AC1: Missing declaration is rejected before dispatch

**Given** an Approved spec with an admitted delivery task that has no canonical `**File(s)**:` declaration
**When** publication scope is inspected during execute preflight
**Then** it fails with `publication_scope_unproven`, identifies the spec path and task ID, states that exactly one canonical declaration is required, and creates no pane or worker

### AC2: Near-miss label is rejected before dispatch

**Given** an admitted delivery task using `**Files**:` or another File(s)-like metadata label
**When** publication scope is inspected during execute preflight
**Then** it fails with located `publication_scope_unproven` before any pane or worker instead of returning spec-only authority

### AC3: Duplicate declarations are rejected before dispatch

**Given** an admitted delivery task containing two canonical `**File(s)**:` declarations
**When** publication scope is inspected during execute preflight
**Then** it fails with located `publication_scope_unproven` and does not combine or ignore either declaration

### AC4: One canonical declaration remains accepted

**Given** every admitted delivery task contains exactly one canonical `**File(s)**:` declaration whose value satisfies the existing grammar
**When** publication scope is inspected and bound
**Then** allowed paths remain the declared paths plus spec-owned paths with no authorization broadening

### AC5: Publication and authoring share the invariant

**Given** `/sdlc-write-spec` produces an Approved `tasks.md`
**When** publication validation and execute preflight evaluate it
**Then** both enforce exactly one canonical declaration for every admitted delivery task and return the same located failure contract

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Extend `parseDeliveryTaskFileLines()` as the single declaration grammar and cardinality authority | Must |
| FR2 | Require exactly one canonical `**File(s)**:` declaration for every admitted task ID | Must |
| FR3 | Reject missing, near-miss, and duplicate declarations as `publication_scope_unproven` with spec path, task ID, line when available, exact offending label or declaration when available, and accepted syntax | Must |
| FR4 | Keep out-of-task and non-admitted-task metadata non-authoritative | Must |
| FR5 | Reject invalid scope before execute creates any pane or worker | Must |
| FR6 | Preserve valid declaration values, bounded expansion, and spec-owned authorization from #379 | Must |
| FR7 | Update authoring and public documentation to state the exactly-one invariant | Must |
| FR8 | Add deterministic parser, publication, and execute regressions plus a real disposable workflow exercise | Must |

## Out of Scope

- Accepting `**Files**:` as an alias
- Mining paths from near-miss fields or prose
- Changing task admission in `issue-spec-scope`
- Changing review, verification, delivery, lease, recovery, or publication ownership
- Repairing PathCast issue #108 or its specification

## Change History

| Issue | Date | Summary |
|---|---|---|
| #383 | 2026-09-13 | Initial defect report |
