# Defect Report: Fix Epic Membership Deadlocking Issue Selection

**Issue**: #149
**Date**: 2026-08-13
**Status**: Investigating
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. Create an open issue `#E` labeled `epic` in the active milestone.
2. Create an open child `#C` in the same milestone whose body contains `Depends on: #E` and whose native GitHub parent is `#E`.
3. Leave `#E` open and give `#C` no open sibling or non-epic prerequisite.
4. Run bare interactive `$nmg-sdlc:start-issue`.
5. Observe that `#C` is classified as blocked and removed from the selection list because its open coordination epic is treated as an execution dependency.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | Reproduced on macOS 26.5.2; contract is platform-independent |
| **Version / Commit** | Installed 1.69.0 and live `main` 1.70.0 at `6c4167dd9094` |
| **Browser / Runtime** | Codex skills, Node.js v26.7.0 runner, GitHub CLI 2.96.0 |
| **Configuration** | Open coordination epic with a child linked by both native parent and `Depends on:` body reference |

### Frequency

Always when an open child has only its still-open coordination epic as a parent or body dependency.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Epic membership is non-blocking coordination metadata. A child with no open sibling or non-epic prerequisite remains actionable in both manual and unattended selection, while downstream epic discovery remains intact. |
| **Actual** | Bare interactive selection merges the native parent and body cross-reference into the execution-dependency set, treats the open epic as a blocker, and filters the ready child. Runner behavior may differ only because a non-automatable epic is absent from its candidate pool. |

### Error Output

No stack trace is produced. The failure appears as an incorrect blocked count, omission of the actionable child from the shortlist, or a false no-actionable-work result.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bare Interactive Selection Does Not Block on Epic Membership

**Given** an open issue labeled `epic` and an open child linked to it using the current `$nmg-sdlc:draft-issue` epic format
**And** the child has no open sibling or non-epic prerequisite
**When** bare interactive `$nmg-sdlc:start-issue` resolves and filters candidates
**Then** the child remains actionable while the coordination epic is open
**And** closing the epic is not required to start the child

### AC2: Runner Selection Uses Explicit Epic Semantics

**Given** an automatable epic child whose open coordination epic is not automatable
**When** the SDLC runner selects the next issue
**Then** it explicitly classifies the epic relationship as non-blocking coordination
**And** the result does not depend on the epic being absent from the automatable candidate pool
**And** manual and unattended selection agree on whether the child is ready

### AC3: Genuine Dependencies Still Block

**Given** an epic child that also depends on an open sibling or non-epic issue
**When** either selector evaluates readiness
**Then** the child remains blocked
**And** the diagnostic names the genuine unresolved issue
**And** it does not name the open coordination epic as a blocker

### AC4: Downstream Epic Discovery Remains Intact

**Given** a child created by `$nmg-sdlc:draft-issue` or represented by a supported legacy or degraded epic-link format
**When** `$nmg-sdlc:write-spec` resolves the umbrella spec or `$nmg-sdlc:open-pr` resolves epic siblings
**Then** the correct coordination epic is still discovered
**And** umbrella-spec amendment and intermediate/final version classification continue to work
**And** users are not required to delete native parent links or epic cross-references to make selection work

### AC5: Ambiguous Parent Identity Fails Safely

**Given** a parent or body reference whose epic status cannot be confirmed because metadata lookup fails or whose parent is confirmed as non-epic
**When** readiness is evaluated
**Then** the relationship remains an execution dependency and is not silently discarded
**And** metadata lookup failure produces an actionable warning that identifies the affected relationship
**And** non-epic parent behavior remains backward-compatible

### AC6: Cross-Skill Regression Is Exercised

**Given** a disposable graph produced from the current `$nmg-sdlc:draft-issue` epic contract
**When** verification exercises bare `$nmg-sdlc:start-issue`, runner selection, parent-spec discovery, and sibling-aware release classification
**Then** the first child is selectable while the epic remains open
**And** later children remain ordered by their real sibling dependencies
**And** the downstream epic consumers still resolve the same parent
**And** automated tests cover current native-plus-body, body-only fallback, native-only, non-epic parent, and metadata-failure cases

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Distinguish epic coordination membership from execution dependencies using shared, documented semantics. | Must |
| FR2 | Apply the same readiness rule to bare `$nmg-sdlc:start-issue` and the SDLC runner. | Must |
| FR3 | Preserve `$nmg-sdlc:draft-issue`, `$nmg-sdlc:write-spec`, and `$nmg-sdlc:open-pr` epic-link compatibility. | Must |
| FR4 | Add runner unit tests and cross-skill exercise coverage for the regression and fail-safe paths. | Must |

---

## Out of Scope

- Redesigning GitHub's epic or sub-issue model
- Changing intermediate/final epic-child version-bump policy
- Solving the broader treatment of arbitrary dependencies outside the runner candidate pool
- Rewriting existing project issue graphs as the primary fix
- Refactoring unrelated SDLC workflow behavior

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #149 | 2026-08-13 | Initial defect report |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal -- no feature work mixed in
- [x] Out of scope is defined
