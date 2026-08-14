# Defect Report: Scope Cumulative Feature Specs to the Active Issue

**Issue**: #162
**Date**: 2026-08-14
**Status**: Investigating
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-migrate-project-skill/

---

## Reproduction

### Steps to Reproduce

1. Create or amend a feature spec so `requirements.md`, `tasks.md`, and `feature.gherkin` contain elements contributed by multiple issues.
2. Include completed earlier work, the current issue's work, an existing element the current issue is expected to adopt, and future work in the same spec directory.
3. Run `$nmg-sdlc:write-code #N` for the current issue and reconstruct the implementation plan from the cumulative `tasks.md`.
4. Resume the implementation after one current task is completed.
5. Run `$nmg-sdlc:verify-code #N`, `$nmg-sdlc:status --json`, and `$nmg-sdlc:open-pr #N` for the same issue.
6. Observe that the consumers can enumerate or report the entire cumulative spec because no durable contract identifies which ACs, FRs, tasks, and scenarios belong to the active issue.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | Codex plugin workflow over cumulative BDD specifications |
| **Version / Commit** | nmg-sdlc 2.0.1 at `aa98ce66fd77d389eaac90b5f90d8fe62e2feb4b` |
| **Reproduction Repository** | Nunley-Media-Group/pathcast, issue #122 in the #108 cumulative spec |
| **Affected Consumers** | `write-spec`, `write-code`, `verify-code`, `status`, and `open-pr` |

### Frequency

Deterministic whenever a multi-issue feature spec contains more than one delivery slice and the active slice cannot be derived from explicit ownership metadata.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A canonical, machine-readable mapping assigns every AC, FR, task, and scenario to one owner and records explicit adoption and regression obligations per issue. Every lifecycle consumer resolves the same active delivery slice. |
| **Actual** | `**Issues**` and Change History show who contributed to the cumulative spec but do not map individual elements. Consumers can default to the whole document, allowing completed, unrelated, or future work to enter the current issue's implementation, verification, status, or pull-request claims. |

### Error Output

No deterministic error is currently required. The defect presents as an over-broad plan or report whose task and acceptance-criterion counts exceed the active issue's intended delivery slice.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Issue Ownership Is Machine-Readable

**Given** multiple issues contribute to one cumulative feature specification
**When** an amendment is accepted
**Then** the canonical spec records a deterministic mapping from each issue to its owned ACs, FRs, tasks, and scenarios, including any existing elements explicitly adopted by that issue

### AC2: Implementation Executes Only the Active Slice

**Given** earlier, current, and future issue elements coexist in the cumulative spec
**When** `write-code` runs for the current issue
**Then** it plans and executes only the active issue's mapped implementation tasks

### AC3: Resumption Preserves Active Scope

**Given** current-issue implementation is interrupted and later resumed
**When** `write-code` reconstructs progress
**Then** it enumerates only the active issue's incomplete mapped tasks and does not absorb unrelated tasks from the cumulative document

### AC4: Verification Separates Delivery From Regression

**Given** the current issue has a mapped delivery slice and earlier completed behavior supplies regression obligations
**When** `verify-code` runs
**Then** it verifies the current slice, verifies explicitly selected prior regression contracts, and excludes future issue work from completion claims

### AC5: Reports And Status Are Issue-Bound

**Given** several issues share the same spec directory
**When** verification evidence and lifecycle status are produced
**Then** each artifact identifies the active issue and its exact mapped scope, and evidence for one child cannot satisfy another child accidentally

### AC6: Pull Requests Remain Issue-Scoped

**Given** a cumulative feature spec contains work for multiple children
**When** `open-pr` prepares the current child's delivery
**Then** its summary, validation, and closing behavior describe only the current issue's mapped slice plus declared regression evidence

### AC7: Legacy Ambiguity Fails Safely

**Given** an older cumulative spec lacks a complete issue ownership map
**When** a consumer cannot infer active scope without ambiguity
**Then** it reports the missing mapping and requests an explicit repair instead of defaulting to the whole spec

### AC8: A Cumulative Fixture Proves Isolation

**Given** a fixture containing completed, active, adopted, and future elements
**When** the lifecycle is exercised for the active issue
**Then** automated coverage proves that implementation, resumption, verification, reporting, status, and PR preparation use the same isolated slice

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Define a versioned `issue-scope.json` contract that maps each contributing issue to owned and adopted AC, FR, task, and stable scenario IDs plus explicit prior regression AC, FR, and scenario obligations; validate the mapping against the cumulative spec inventory. | Must |
| FR2 | Make `write-spec` create or amend the scope manifest and make `write-code` and resumption resolve only the active issue's owned-plus-adopted delivery tasks before planning or editing. | Must |
| FR3 | Make `verify-code` distinguish the active delivery ACs/tasks/scenarios from declared regression ACs/FRs/scenarios and exclude all other elements from completion claims. | Must |
| FR4 | Bind verification reports, lifecycle status JSON/text, and spec-linked pull-request content to the same read-only scope result and active issue number. | Must |
| FR5 | Permit whole-spec inference only for an unambiguous single-issue feature or singular defect spec; return a stable repair-required result for multi-issue legacy specs with a missing or incomplete mapping. | Must |
| FR6 | Add a cumulative fixture and deterministic tests covering earlier-complete, active-owned, active-adopted, explicit regression, and future elements across every affected consumer. | Must |

---

## Out of Scope

- Splitting every cumulative feature spec into one directory per issue
- Treating future child work as current delivery scope
- Rewriting historical verification reports as if they were current
- Automatically guessing ambiguous legacy ownership
- Implementing PathCast issue #122 in this plugin defect
- Mapping prose-only design sections, which remain shared architectural context rather than completion units

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #162 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction steps cover implementation, resumption, verification, status, and delivery
- [x] Expected and actual behavior identify the missing element-level mapping
- [x] All eight issue acceptance criteria are retained in Given/When/Then form
- [x] Owned, adopted, regression, future, and legacy-ambiguity states are explicit
- [x] The single-issue compatibility boundary is defined
- [x] Historical and future elements cannot satisfy the current issue accidentally
- [x] Out of scope is bounded
