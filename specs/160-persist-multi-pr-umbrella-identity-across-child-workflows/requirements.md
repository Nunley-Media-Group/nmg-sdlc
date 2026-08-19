# Defect Report: Persist Multi-PR Umbrella Identity Across Child Workflows

**Issue**: #160
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. Publish a canonical umbrella specification and create child issues from its delivery phases.
2. Preserve the native parent/sub-issue relationship, but omit the `epic` label from the parent or omit the parent's `## Child Issues` checklist.
3. Start a fresh session for a child and run the normal manual lifecycle commands.
4. Observe that one command treats the parent as a genuine blocker, another falls back to ordinary spec discovery, and delivery can omit siblings that exist only in GitHub's native relationship graph.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | GitHub Issues and Codex plugin workflow; platform-independent contract |
| **Version / Commit** | nmg-sdlc 2.0.2 at `4df3888b038deed504b21465ea48c87e025043e7` |
| **Reproduction Repository** | Nunley-Media-Group/pathcast, umbrella #108 and child #122 |
| **Configuration** | Canonical cumulative spec with incomplete or stale umbrella metadata across fresh sessions |

### Frequency

Always when a later consumer cannot reconstruct the same coordination identity from durable GitHub metadata.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every producer persists the same machine-readable umbrella identity, every lifecycle consumer classifies it through one contract, canonical child work advances without resealing, native relationships supply authoritative sibling membership, and legacy inconsistencies have a safe approval-gated repair path. |
| **Actual** | Parent identity can remain session-only or depend on one incomplete signal. Consumers independently interpret labels, native relationships, and body checklists, causing false blockers, repeated sealing, missing siblings, and unrecoverable-looking legacy records. |

### Error Output

The defect normally appears as incorrect lifecycle routing rather than an exception: a coordination parent is listed as a blocker, a canonical child is sent to specification sealing again, or sibling-aware delivery sees an incomplete child set.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Umbrella Identity Is Durable

**Given** a feature is converted into an umbrella with child issues
**When** the planning session ends and a later command starts in a fresh session
**Then** the parent retains the `epic` identity, each child retains an `epic-child-of-N` identity, and supported native/body relationships identify the same parent without session state

### AC2: Lifecycle Consumers Share One Classification

**Given** a child belongs to a persisted umbrella
**When** `start-issue`, `write-spec`, `write-code`, `verify-code`, `status`, or `open-pr` evaluates the child
**Then** every consumer uses the shared relationship contract and derives the same role, parent number, consistency state, and genuine execution dependencies

### AC3: Genuine Dependencies Still Block

**Given** an umbrella child has an explicit execution dependency in addition to its coordination parent
**When** the dependency is incomplete
**Then** the child remains blocked by that dependency, the coordination parent is excluded from blockers, and missing or conflicting identity metadata fails safely

### AC4: Canonical Specs Are Not Resealed Per Child

**Given** the umbrella's cumulative spec is canonical on the refreshed default branch
**And** the active issue is consistently classified as its child
**When** the child advances after specification
**Then** the workflow proceeds to the child's implementation slice without creating a child-numbered seal commit or publication pull request

### AC5: Sibling Discovery Uses Authoritative Relationships

**Given** native sub-issue relationships exist and the parent checklist is missing or stale
**When** a lifecycle consumer enumerates siblings
**Then** it uses the native child set as authoritative, unions supported checklist evidence for degradation visibility, and reports discrepancies instead of silently omitting siblings

### AC6: Existing Umbrellas Can Be Recovered Safely

**Given** an existing repository contains incomplete or conflicting umbrella identity records
**When** the operator runs the supported upgrade audit
**Then** the workflow reports exact evidence and deterministic proposed metadata repairs, requires explicit approval for each mutation set, revalidates before writing, and is idempotent after repair

### AC7: The Complete Lifecycle Is Exercised

**Given** a fixture with a persisted umbrella, multiple children, a real sibling dependency, and stale checklist metadata
**When** fresh-session classification is exercised across planning, start, spec, implementation, verification, status, and pull-request preparation
**Then** automated coverage proves stable identity, no resealing loop, truthful blockers, consistent status, and complete sibling coordination

Additional AC7 regression examples cover these non-happy paths:

- A legacy record is recognized only after native discovery completes and both native and body relationships agree; it retains every available signal and names the exact upgrade repair.
- Conflicting, ambiguous, or unverifiable identity stops before mutation and reports the complete observed evidence without reclassification.
- Native discovery degradation preserves checklist evidence for reporting but cannot authorize completion, versioning, delivery, or another lifecycle mutation.
- A partial producer write preserves every created issue and surviving signal, never creates a replacement child, and converges idempotently after an exact approved repair and rerun.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Define one durable parent/child coordination identity using GitHub labels plus supported native and body relationship signals. | Must |
| FR2 | Centralize normalization and classification semantics for all lifecycle consumers, including machine-readable status output. | Must |
| FR3 | Preserve blocking behavior for genuine execution dependencies and fail safely on ambiguous or conflicting metadata. | Must |
| FR4 | Prevent consistently classified children of canonical umbrellas from entering the parent sealing flow. | Must |
| FR5 | Enumerate siblings from authoritative native relationships while surfacing stale supported checklist evidence. | Must |
| FR6 | Add an approval-gated, revalidated, idempotent upgrade audit and repair contract for legacy identity records. | Must |
| FR7 | Add deterministic contract, fixture, and lifecycle coverage for durable, legacy, conflicting, and degraded identity states. | Must |

---

## Out of Scope

- Treating every GitHub parent as a coordination epic
- Cross-repository parent-child coordination
- Automatically merging child pull requests
- Mutating legacy issue metadata without an explicit approval gate
- Changing PathCast product requirements or delivering PathCast child work
- Replacing GitHub Issues or adding a persistent plugin database

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #160 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] Every issue acceptance criterion is retained
- [x] At least one regression scenario is included
- [x] Legacy identity and exact repair guidance have regression coverage
- [x] Conflicting, ambiguous, and unverifiable identity have fail-closed regression coverage
- [x] Native-degraded fallback is report-only and mutation-blocking in regression coverage
- [x] Partial writes preserve evidence, avoid replacement children, and prove idempotent rerun behavior
- [x] Fix scope is bounded to umbrella identity persistence and consumption
- [x] Out of scope is defined
