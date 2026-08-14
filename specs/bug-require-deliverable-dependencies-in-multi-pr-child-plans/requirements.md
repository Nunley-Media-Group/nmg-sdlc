# Defect Report: Require Deliverable Dependencies in Multi-PR Child Plans

**Issue**: #163
**Date**: 2026-08-14
**Status**: Fixed
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. Define a multi-PR umbrella spec whose task inventory assigns a foundational task or artifact to child A.
2. Describe child B as able to begin after that task or artifact is produced, before child A is complete.
3. Create child A and child B as independent branches from the repository default branch.
4. Leave the GitHub execution-dependency graph without a whole-issue edge from child B to child A.
5. Evaluate child B through `$nmg-sdlc:start-issue` or `$nmg-sdlc:status` while child A remains open and its pull request is unmerged.
6. Observe that child B can appear ready even though its required baseline is unavailable from the branch point.

Legacy free-form checkpoint prose is a separate compatibility case: before an audit converts it into an approved structured record and execution edge, `start-issue` and `status` do not gate on the heuristic match alone. The initialized-project audit reports it without silently making it authoritative.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | GitHub issue graph with independent feature branches |
| **Version / Commit** | nmg-sdlc 2.0.1 at `aa98ce66fd77d389eaac90b5f90d8fe62e2feb4b` |
| **Reproduction Repository** | Nunley-Media-Group/pathcast, issues #122, #123, and #124 |
| **Observed Checkpoint** | Task T054 owned by #122 but required by #123 and #124 before #122 delivery |

### Frequency

Deterministic whenever a child plan relies on a sibling-owned task or artifact that has no independently merged deliverable boundary.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every cross-child prerequisite resolves to a deliverable issue and matching execution edge. A valid graph may remain `blocked` while its owner is open; merged default-branch closing-PR evidence is required before the downstream child is reported `ready`. The spec, issue bodies, execution-dependency graph, readiness result, and audit output all describe that same whole-issue ordering. |
| **Actual** | A child can depend on prose describing a midpoint task checkpoint inside an open sibling. GitHub models no task-level edge, so the child is reported ready although no independent branch can consume the baseline. |

### Error Output

No deterministic error is currently required. The defect presents as false readiness followed by missing-baseline implementation work or an execution loop.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Cross-Child Prerequisites Are Detected

**Given** a child plan references a task or artifact owned by another child
**When** the multi-PR plan is validated
**Then** the workflow identifies the reference as a cross-child delivery prerequisite

### AC2: Every Prerequisite Has a Deliverable Boundary

**Given** a downstream child needs a prerequisite before its sibling is complete
**When** the plan is finalized
**Then** the workflow requires either a separate baseline issue and pull request or a whole-issue dependency that waits for the sibling's delivery

### AC3: Spec and GitHub Graphs Agree

**Given** a valid multi-PR child plan
**When** issue bodies, native relationships, execution-dependency edges, deliverable records, and spec task ownership are compared
**Then** they describe the same executable ordering without prose-only midpoint dependencies

### AC4: Readiness Is Truthful

**Given** a required baseline has not been merged into the default branch available to a child
**When** `$nmg-sdlc:start-issue` or `$nmg-sdlc:status` evaluates that child
**Then** a structured prerequisite is not reported ready, while legacy prose alone remains audit-only and does not gate either consumer before approved repair

### AC5: Existing Plans Can Be Audited

**Given** an existing umbrella contains cross-child task or artifact references
**When** the supported initialized-project audit runs
**Then** it reports every unrepresentable checkpoint and proposes either baseline extraction or whole-issue dependency repair

### AC6: Repairs Are Idempotent and Approval-Gated

**Given** an operator approves one exact manual dependency-repair handoff
**When** the operator applies the line-level repair and the audit runs again
**Then** issue and spec relationships change once, remain consistent, and no further mutation occurs without a new approved difference

### AC7: Independent Branch Delivery Is Exercised

**Given** multiple children use independent branches from the repository default branch
**When** the lifecycle exercise advances them according to the generated graph
**Then** every reported-ready child can obtain all prerequisites from merged deliverables

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Define one structured, line-anchored child-body record for each sibling-owned task or artifact prerequisite and detect bounded legacy prose as an audit candidate. | Must |
| FR2 | Require every prerequisite to resolve to a separate baseline issue or to the whole issue that owns it, with a matching execution-dependency edge. | Must |
| FR3 | Validate task ownership, child-body records, issue dependency edges, and default-branch merge evidence as one consistent plan. | Must |
| FR4 | Make start and status fail closed when a required deliverable edge is missing, its metadata is unverifiable, or its closing pull request has not merged to the default branch. | Must |
| FR5 | Extend the initialized-project audit with exact, approval-gated, drift-checked, idempotent manual whole-issue repair handoffs and baseline-extraction guidance; never perform an unconditional full-body overwrite without a documented server-enforced compare-and-set. | Must |
| FR6 | Add deterministic contract and lifecycle exercises for valid, blocked, missing-edge, manually-closed, wrong-base, legacy-checkpoint, repaired, and independent-branch states. | Must |

---

## Out of Scope

- Adding stacked-branch workflow support
- Creating task-level GitHub dependency objects
- Automatically merging prerequisite pull requests
- Inferring dependencies between unrelated issues
- Automatically extracting a baseline into a new issue without a separately reviewed spec change
- Automatically overwriting a GitHub issue body when the selected API provides no documented server-enforced compare-and-set precondition
- Changing PathCast implementation content or mutating its issue graph as part of this plugin delivery
- Treating an issue's manually closed state, without a merged default-branch delivery, as proof that its artifact is available

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #163 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction names the independent-branch failure mode and unavailable baseline
- [x] Expected behavior requires merged deliverable evidence, not issue closure alone
- [x] All seven issue acceptance criteria are retained in Given/When/Then form
- [x] Spec, body, graph, readiness, audit, and repair responsibilities are explicit
- [x] Baseline extraction and whole-issue waiting are the only supported boundaries
- [x] Existing-plan repair is a manual approval-gated, drift-checked, idempotent handoff without unconditional full-body overwrite
- [x] Out-of-scope boundaries preserve independent branches and prohibit task-level GitHub objects
