# Requirements: GitHub blocked-by as the sole issue dependency

**Issue**: #236
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG

---

## User Story

**As a** developer running nmg-sdlc in Oh My Pi or Herdr
**I want** issue sequencing to use only GitHub's official blocked-by relation
**So that** drafting, upgrading, execution, start, and status share one fail-closed dependency graph

---

## Background

Production dependency decisions currently parse `Depends on:` and `Blocks:` body lines. Empty execute selection lists every open `spec-created` issue before dependency filtering, while start, status, and backlog selection each evaluate the body relation separately. Drafting writes those lines instead of GitHub relationships, and upgrade does not reconcile the complete repository graph.

GitHub now exposes official issue dependency endpoints. nmg-sdlc must use `blocked_by` as the single read/write authority. Legacy body relations may be migration evidence during an approved upgrade but become inert for eligibility and status.

---

## Acceptance Criteria

### AC1: official blocked-by is the sole dependency authority

**Given** an nmg-sdlc issue graph
**When** draft-issue, upgrade-project, execute, start-issue, or status reads or writes dependencies
**Then** it uses only GitHub's official blocked-by relation
**And** body `Depends on:` / `Blocks:` lines, spike relations, sub-issue links, labels, and other relationship types do not grant or deny eligibility

### AC2: draft-issue applies approved blocked-by edges

**Given** an approved multi-issue split or explicit sequencing against named existing issues
**When** draft-issue creates the issues
**Then** it preflights the complete proposed graph and applies official blocked-by edges from split topology and explicit precursor language
**And** it requires no confirmation beyond the existing split/plan approval
**And** it does not link an existing issue unless the need names or clearly sequences it

### AC3: upgrade screens and reconciles every existing issue

**Given** a repository with official dependencies, legacy body relations, or clear sequencing language
**When** `/sdlc-upgrade-project` detects and applies the dependency-graph category
**Then** detection reads every existing repository issue and its official blocked-by edges
**And** the approved reconciliation adds missing official blocked-by edges discovered from legacy or explicit sequencing evidence
**And** it refuses a dangling target or cycle among open issues before writing

### AC4: execute presents only eligible issues

**Given** open `spec-created` issues with resolved, unresolved, or unreadable blocked-by state
**When** `/sdlc-execute` runs without arguments
**Then** it presents only issues whose official blockers are all closed and whose reachable open graph is acyclic
**And** any unreadable dependency evidence aborts selection without a picker
**And** if no eligible issue remains it prints `No open spec-created issues.` and shows no picker

### AC5: explicit execute and start refuse unsafe graphs before mutation

**Given** an issue with an open blocker, dangling target, reachable open cycle, or unreadable dependency evidence
**When** `/sdlc-execute #N` or start-issue runs
**Then** it fails before branch, worker, run-state, or project mutation
**And** status reports the issue as blocked or unknown with the same graph reason

### AC6: invalid graphs are refused and independent work remains valid

**Given** a proposed or existing dependency graph
**When** the shared graph validator runs
**Then** missing targets and open-issue cycles fail with stable reason codes and exact cycle/edge evidence
**And** closed blockers satisfy their edges
**And** an issue with no blocked-by edge remains valid and executable

### AC7: dependency reads fail closed everywhere

**Given** GitHub dependency evidence cannot be completely read or parsed
**When** execute, start, status, draft, or upgrade needs that evidence
**Then** the operation reports `dependency_unreadable`
**And** it does not infer eligibility from body text or partially loaded API pages

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add one shared official blocked-by client and graph validator used by every production dependency consumer. | Must | No forked parsers. |
| FR2 | Reads use GitHub's `dependencies/blocked_by` REST endpoint with complete pagination; writes use its POST endpoint with numeric issue ids. | Must | Repository-local issues only. |
| FR3 | Draft plans carry explicit dependency edges referencing created plan ids or named existing issue numbers; publication resolves ids, preflights, then applies edges. | Must | No body relation emission. |
| FR4 | Upgrade detection screens all existing issues and treats legacy body fields/clear sequencing phrases only as migration evidence for proposed official edges. | Must | Body text is never runtime authority. |
| FR5 | Missing issue targets, repository mismatch, malformed API data, incomplete pages, and read failures fail closed. | Must | `dependency_dangling` or `dependency_unreadable`. |
| FR6 | Cycles are rejected among open issues; closed blockers satisfy edges and do not create an execution deadlock. | Must | Return deterministic cycle path. |
| FR7 | No-argument execute filters before displaying its picker and uses the existing empty message when zero eligible issues remain. | Must | No empty picker. |
| FR8 | Explicit execute and start validate before any branch, worker, run-state, or project mutation; status reuses the same evidence. | Must | Same reason codes. |
| FR9 | Independent issues without blocked-by edges remain executable. | Must | No dependency record required. |
| FR10 | Legacy `Depends on:` / `Blocks:` parsing is removed from production eligibility, start, status, and draft output. | Must | May remain only in upgrade migration detection/history repair. |
| FR11 | README, product/technical steering, contribution guidance, draft/upgrade workflows, and tests teach official blocked-by as the sole relation. | Should | Remove spike/epic/body-edge current-product language. |
| FR12 | The serial execute lifecycle, `spec-created` gate, spec approval gate, and Project Done exclusion remain unchanged. | Must | Dependency scope only. |

---

## Out of Scope

- Reintroducing epic, spike, native sub-issue, label-derived, or body-derived runtime dependency types
- Rewriting historical issue body prose during migration
- Supporting cross-repository blockers or non-GitHub trackers
- Adding a dependency dashboard
- Changing execute step order or post-eligibility serial delivery behavior

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #236 | 2026-08-23 | Initial feature spec |
