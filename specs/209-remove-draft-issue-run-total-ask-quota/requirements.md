# Requirements: Remove draft-issue run-total ask quota

**Issue**: #209
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/4-draft-issue-skill/

---

## User Story

**As a** Herdr OMP operator drafting a GitHub issue
**I want** `/sdlc-draft-issue` to keep asking until it has the preferences, acceptance criteria, and scope it cannot discover
**So that** a thin initial description still produces a complete groomed issue instead of a guessed one

---

## Background

Draft-issue currently applies a run-total budget of three `ask()` invocations across split confirmation, classification, milestone selection, and all interview probes. Required gates can consume the budget before the workflow has gathered missing preferences, acceptance criteria, or scope boundaries. `workflows/draft-issue/WORKFLOW.md`, `workflows/draft-issue/references/interview-depth.md`, and `workflows/draft-issue/references/multi-issue.md` each encode that limit.

`references/interactive-gates.md` separately limits each `ask()` call to at most three questions. That per-call shape rule remains. The independent three-ask budgets in write-spec, onboard-project, and upgrade-project also remain. This issue supersedes the bounded run-total gate in `specs/4-draft-issue-skill/` while keeping that historical specification in the working-tree archive.

---

## Acceptance Criteria

### AC1: interview continues until missing decisions are gathered

**Given** `/sdlc-draft-issue` has a need and has completed its required classification ask, milestone ask when `VERSION` is `X.Y.Z`, and split-confirm ask when multi-issue signals fire
**When** preferences, acceptance criteria, or scope boundaries remain unknown after investigation
**Then** the workflow issues further `ask()` calls until those missing decisions are gathered
**And** it does not stop interviewing solely because three `ask()` invocations have already occurred
**And** it then synthesizes and proposes without a review-the-draft ask

### AC2: required asks and non-quota interview rules remain

**Given** a `/sdlc-draft-issue` run
**When** it interviews
**Then** it still asks classification with exactly the Enhancement and Bug options
**And** it still asks milestone `v<major> (current)` versus `v<major+1> (next)` when root `VERSION` parses as `X.Y.Z`
**And** it still uses one split-confirm ask when multi-issue signals fire
**And** it still uses `ask` only for preferences and tradeoffs
**And** it still never uses `ask` for final draft approval or "does this match"
**And** each `ask()` call still has 2–4 options, recommended first, and at most three questions in that call

### AC3: missing detail is asked, not invented

**Given** investigation cannot determine a required preference, acceptance criterion, or scope boundary
**When** the workflow would previously have skipped the probe because the run-total budget was exhausted
**Then** it asks instead of synthesizing a silent default
**And** it still does not ask questions that `read`, `grep`, or `glob` can answer

### AC4: other interactive budgets stay

**Given** this change is delivered
**When** an operator inspects write-spec, onboard-project, and upgrade-project
**Then** those workflows still carry their existing three-ask budgets
**And** `references/interactive-gates.md` still requires at most three questions per `ask()` call

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Remove the draft-issue run-total cap of three `ask()` invocations. | Must | Remove every normative run-total or remaining-slot statement from the draft-issue workflow and its references. |
| FR2 | After required classification, milestone, and optional split-confirm asks, continue interviewing until all material undiscoverable preferences, acceptance criteria, and scope boundaries are gathered. | Must | Do not silently synthesize missing decisions. |
| FR3 | Keep classification, milestone, and split-confirm as required asks with their current option shapes. | Must | Classification remains exactly Enhancement and Bug. |
| FR4 | Keep tool-first discovery, preference/tradeoff-only asks, no approval via ask, 2–4 options, recommended first, and at most three questions per call. | Must | The per-call contract remains in `references/interactive-gates.md`. |
| FR5 | Leave write-spec, onboard-project, and upgrade-project ask budgets unchanged. | Must | This is a draft-issue-only cutover. |
| FR6 | Keep `specs/4-draft-issue-skill/` in the working-tree archive while this specification supersedes its bounded run-total gate. | Should | Do not delete or rewrite the historical package. |

---

## Out of Scope

- Removing write-spec, onboard-project, or upgrade-project ask budgets
- Removing the interactive-gates maximum-three-questions-per-call rule
- Dropping the required classification, milestone, or split-confirm asks
- Allowing `ask` for draft review or final approval
- Changing GitHub issue templates, labels, milestone selection, or multi-issue dependency rules

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #209 | 2026-08-22 | Initial feature spec |
