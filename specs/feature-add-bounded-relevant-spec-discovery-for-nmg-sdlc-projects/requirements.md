# Requirements: Add Bounded Relevant-Spec Discovery for nmg-sdlc Projects

**Issues**: #139
**Date**: 2026-04-30
**Status**: Approved
**Author**: Codex

---

## User Story

**As a** developer using nmg-sdlc across projects
**I want** every SDLC workflow to understand the active change and its surrounding spec context by default
**So that** implementations, reviews, issue drafts, and new specs are not produced in a silo.

---

## Background

nmg-sdlc already writes canonical BDD specs under project-root `specs/`, and downstream skills can consume the active spec for an issue. The missing behavior is broader context: SDLC work should always understand the contract around the change area, including related specs that may constrain implementation, verification, or whether a new issue should amend an existing feature spec.

The feature must avoid replacing one failure mode with another. Loading every spec body by default bloats context and makes Codex less effective; ignoring neighboring specs makes changes siloed. The expected behavior is a balanced, bounded discovery contract: scan compact metadata first, load the active spec fully, load only a capped and well-ranked set of related specs, and expose ranking reasons so ambiguous choices can be reviewed.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: SDLC Always Establishes Spec Context

**Given** a project uses nmg-sdlc
**When** any SDLC skill starts work on an issue, implementation, or verification
**Then** it treats project-root `specs/` as the canonical surrounding-context archive
**And** it establishes the active spec plus relevant neighboring specs before making workflow decisions.

### AC2: Legacy Spec Locations Are Not Used As Context

**Given** a project still has legacy `.codex/specs/` or `.codex/steering/` artifacts
**When** an SDLC skill starts
**Then** the existing legacy-layout gate blocks the workflow
**And** the skill does not use legacy spec files as surrounding context.

### AC3: Metadata-First Discovery Prevents Context Bloat

**Given** a project has many specs
**When** surrounding spec context is established
**Then** discovery scans compact metadata first, including slug/title, frontmatter issue links, related-spec links, headings, acceptance criteria names, functional requirement names, affected paths, symbols, and component names
**And** it fully loads only the active spec plus a capped, ranked set of related specs.

### AC4: Write-Spec Considers Existing Surrounding Contracts

**Given** `$nmg-sdlc:write-spec` is writing an enhancement spec
**When** existing feature specs relate through issue links, related-spec links, affected files, symbols, component names, title overlap, or strong keyword overlap
**Then** the skill considers amending the relevant existing contract before creating a disconnected new spec
**And** parent-link resolution remains the strongest signal before ranked metadata matching.

### AC5: Ambiguous Spec Context Requires a Gate

**Given** discovery produces multiple plausible neighboring specs
**When** the run is interactive
**Then** ranked candidates and ranking reasons are presented for selection before amendment or creation proceeds
**And** when the run is unattended, the workflow uses a deterministic top-ranked candidate only when it meets the contract threshold.

### AC6: Project Guidance Makes Spec Context the Default

**Given** `$nmg-sdlc:onboard-project` or `$nmg-sdlc:upgrade-project` runs in a consumer project
**When** root `AGENTS.md` is missing or lacks nmg-sdlc spec-context guidance
**Then** the plugin creates or appends a managed section that directs Codex to use bounded `specs/` discovery for SDLC and prompt-level spec requests
**And** existing project-authored instructions are preserved.

### AC7: Idempotent Coverage and Verification

**Given** the feature is implemented
**When** verification runs
**Then** tests or exercise coverage prove ranking caps, ambiguous-candidate handling, `AGENTS.md` idempotency, active-spec-first behavior, and no full-archive loading by default
**And** the checks demonstrate the context-use balance: enough surrounding context to be effective, without loading unrelated spec bodies.

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Provide a shared bundled spec-context contract that says SDLC workflows always establish bounded active-plus-neighboring spec context before decisions. | Must | Shared reference, not duplicated workflow prose. |
| FR2 | Update `$nmg-sdlc:draft-issue` and `$nmg-sdlc:write-spec` to use the shared contract before drafting issues or specs. | Must | Highest-impact paths for preventing siloed work. |
| FR3 | Update `$nmg-sdlc:write-code` and `$nmg-sdlc:verify-code` to preserve active-spec-first loading while consulting related surrounding specs when implementation or verification scope can be affected. | Should | Must not slow simple active-spec work with broad body loading. |
| FR4 | Have `$nmg-sdlc:onboard-project` and `$nmg-sdlc:upgrade-project` manage additive root `AGENTS.md` guidance that makes bounded spec-context discovery a project-level Codex default. | Must | Preserve project-authored instructions. |
| FR5 | Avoid a persistent generated `specs/INDEX.md` in the first implementation. | Must | Prevent stale-index maintenance until evidence shows scanning is too slow. |
| FR6 | Define deterministic ranking inputs, cap behavior, no-match behavior, ambiguous-match behavior, and broken-link handling. | Must | Include ranking reasons in the result shape. |
| FR7 | Add tests or exercise coverage proving bounded ranking, threshold behavior, managed `AGENTS.md` idempotency, and no full-archive loading by default. | Must | Include both static contract tests and disposable-project exercise where practical. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Discovery must scan compact metadata before full bodies and cap related full-spec loading to avoid context bloat. |
| **Security** | Spec metadata extraction must not execute project content, shell snippets, or untrusted spec text. |
| **Reliability** | No-match, ambiguous-match, unsupported GitHub parent fields, and broken related-spec links must have deterministic behavior. |
| **Platforms** | All commands and instructions remain stack-agnostic and cross-platform per `steering/tech.md`. |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Active issue number | integer | Parsed from argument, branch, or issue context | Yes for issue-scoped skills |
| Active spec path | path | Must exist under project-root `specs/` when required by the consuming skill | Skill-dependent |
| Spec metadata | structured text | Extracted from Markdown headings, frontmatter, AC/FR labels, related-spec fields, paths, and symbols | Yes when specs exist |
| Project guidance state | file content | Root `AGENTS.md` exists/missing and equivalent nmg-sdlc guidance detection | Yes for onboarding/upgrade |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| Active spec | path | Fully loaded spec directory for the current issue or change |
| Related specs | array of paths | Capped ranked set of neighboring specs fully loaded for context |
| Ranking reasons | array of strings | Human-readable reasons explaining why each related spec was selected |
| Metadata-only specs | count/list | Specs scanned but not fully loaded |
| Guidance status | string | `AGENTS.md: created | updated | already present | skipped (<reason>)` |

---

## Dependencies

### Internal Dependencies

- [x] Existing project-root `specs/` convention and legacy-layout gate
- [x] Existing shared-reference architecture under `references/`
- [x] Existing onboarding/upgrade managed-artifact patterns
- [x] Existing skill-inventory audit and Jest test harness

### External Dependencies

- [x] GitHub CLI for issue metadata where parent links are supported; body cross-reference fallback remains required.

### Blocked By

- [x] None.

---

## Out of Scope

- Creating a persistent generated `specs/INDEX.md`.
- Loading every spec body by default.
- Changing the canonical spec directory away from project-root `specs/`.
- Rewriting project-authored `AGENTS.md` content.
- Adding stack-specific ranking rules unless supplied by steering.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Siloed-change prevention | Affected SDLC skills establish active-plus-neighboring context before decisions | Static contract tests and exercise output |
| Context efficiency | Only active spec plus capped related specs are fully loaded | Exercise test counts loaded bodies |
| Guidance idempotency | Re-running onboarding/upgrade does not duplicate AGENTS.md guidance | Exercise test diff after rerun |
| Discovery transparency | Ambiguous candidates include ranking reasons | Contract and exercise tests |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #139 | 2026-04-30 | Initial feature spec |

