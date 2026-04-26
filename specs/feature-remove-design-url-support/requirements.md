# Requirements: Remove Legacy Design URL Support

**Issues**: #105
**Date**: 2026-04-25
**Status**: Approved
**Author**: Rich Nunley

---

## User Story

**As a** developer using the Codex-only SDLC plugin
**I want** legacy Design and design archive URL support removed from the live workflow surface
**So that** the plugin no longer advertises or preserves legacy-provider design integration paths that do not belong in the Codex runtime contract

---

## Background

The plugin has been migrated to Codex-native terminology and behavior, but the live `$nmg-sdlc:draft-issue` and `$nmg-sdlc:onboard-project` workflow surfaces still describe optional Design URL / design archive ingestion. Those references include prompts, argument handling, fetch/decode instructions, downstream session state, and summary text that were useful for the old legacy Design path but are not part of the Codex runtime contract.

This feature removes the active support instead of maintaining compatibility shims. Historical specs and changelog entries may continue to describe past behavior, but current user-facing docs, skill contracts, and generated inventory baselines must no longer expose the removed capability as available.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Draft issue no longer exposes design URL support

**Given** a user invokes `$nmg-sdlc:draft-issue`
**When** the workflow gathers initial context
**Then** it does not prompt for, detect, fetch, decode, cache, cite, or carry Design URL / design archive context
**And** the draft-issue session state no longer includes design URL, design context, or design failure fields.

**Example**:
- Given: The user starts `$nmg-sdlc:draft-issue "add export reports"`
- When: Step 1 gathers context and the per-issue loop runs
- Then: no optional Design URL question appears, no `references/design-url.md` branch can run, and issue synthesis does not cite a design URL.

### AC2: Onboard project no longer exposes design URL support

**Given** a user invokes `$nmg-sdlc:onboard-project`
**When** the workflow handles greenfield or greenfield-enhancement setup
**Then** it does not accept `--design-url`, ask for a design archive URL, fetch design context, or include design fetch results in summaries
**And** starter issue seeding uses interview and steering context only.

**Example**:
- Given: A greenfield project has no code and no specs
- When: `$nmg-sdlc:onboard-project` reaches the greenfield branch
- Then: the branch starts with the intent and tech-selection interview, not a Design URL ingestion step.

### AC3: Public docs match the active workflow

**Given** users read the README and skill reference surfaces
**When** they look for supported inputs and workflow behavior
**Then** legacy Design, Design URL, and design archive support are not advertised as available capabilities
**And** command signatures no longer include design URL arguments.

**Example**:
- Given: README.md lists `$nmg-sdlc:draft-issue` and `$nmg-sdlc:onboard-project`
- When: a user scans the command table and first-time setup prose
- Then: neither row offers `[design-url]` or `--design-url <url>`.

### AC4: Archival specs are not bulk-rewritten

**Given** older specs and historical changelog entries document previously shipped behavior
**When** the removal is implemented
**Then** archival references may remain where they describe past decisions or release history
**And** live contract files must not continue to expose the removed capability.

**Example**:
- Given: `specs/feature-draft-issue-skill/requirements.md` documents issue #125 design archive ingestion as historical context
- When: the removal work searches for stale references
- Then: that archival spec is not rewritten only to erase history, while live skill files and README are updated.

### AC5: Verification catches stale live support

**Given** the implementation is complete
**When** the project validation gates run
**Then** compatibility and inventory checks pass
**And** any remaining live references to the removed Design URL workflow are either eliminated or explicitly justified as archival-only.

**Example**:
- Given: the implementation changed live skill files and documentation
- When: `npm --prefix scripts run compat`, `node scripts/skill-inventory-audit.mjs --check`, and targeted stale-reference searches run
- Then: the checks pass and no live workflow surface still describes Design URL support.

### AC6: Skill-bundled edits route through skill-creator

**Given** this change edits skill-bundled files such as `skills/draft-issue/SKILL.md`, `skills/draft-issue/references/*`, `skills/onboard-project/SKILL.md`, or `skills/onboard-project/references/*`
**When** `$nmg-sdlc:write-code` implements the removal
**Then** those file edits are routed through `$skill-creator`
**And** there is no direct-edit fallback for skill-bundled files.

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Remove Design URL / design archive prompts, argument handling, fetch/decode instructions, session state, and downstream design-context references from live skill workflows. | Must | Applies to `$nmg-sdlc:draft-issue` and `$nmg-sdlc:onboard-project`. |
| FR2 | Update README usage and skill reference documentation so users cannot discover legacy Design support as a current capability. | Must | README remains the primary public documentation. |
| FR3 | Preserve historical specs and historical changelog entries unless they are part of the active contract for current skill behavior. | Should | Stale-reference checks must distinguish live surfaces from archival material. |
| FR4 | Use `$skill-creator` for skill-bundled file edits, per project steering. | Must | Applies to `skills/**`, root `references/**`, and `agents/*.md`. |
| FR5 | Validate with repo-local checks, including the scripts package compatibility check and the skill inventory audit. | Must | Use `npm --prefix scripts run compat` and `node scripts/skill-inventory-audit.mjs --check`. |
| FR6 | Regenerate or update `scripts/skill-inventory.baseline.json` after live skill references change. | Must | The inventory audit should pass without stale design-url entries for live files. |
| FR7 | Remove now-unused draft-issue design URL reference material from the live skill bundle. | Must | `skills/draft-issue/references/design-url.md` should not remain as a loadable live branch. |
| FR8 | Update greenfield onboarding instructions so interview defaults and starter issue synthesis no longer source values from design context. | Must | `interview_context` and steering data remain valid sources. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Security** | Removal must eliminate the live external fetch/decode path for design archives and must not add a replacement network ingestion surface. |
| **Reliability** | Removing Design URL support must not break the normal draft-issue or onboard-project happy paths; workflows should continue from user input, steering docs, and repository investigation. |
| **Cross-Platform** | Validation and stale-reference searches must use repo-standard commands and avoid platform-specific scripts. |
| **Traceability** | Remaining references must be explainable as archival specs or release history, not current workflow instructions. |
| **Maintainability** | Live skill contracts should be simpler after removal; do not replace the feature with dead session fields or no-op placeholder steps. |

---

## Data Requirements

### Removed Input Data

| Field | Previous Source | Removal Requirement |
|-------|-----------------|---------------------|
| `designUrl` / Design URL argument | `$nmg-sdlc:draft-issue` argument or prompt | Remove from live draft-issue input handling. |
| `--design-url <url>` | `$nmg-sdlc:onboard-project` greenfield argument | Remove from public docs and live onboarding instructions. |
| `design_context` / `session.designContext` | Design archive fetch/decode result | Remove from live state and downstream references. |
| `designFailureNote` | Fetch/decode failure handling | Remove from live summaries and multi-issue state. |

### Remaining Input Data

| Field | Source | Required |
|-------|--------|----------|
| Initial issue description | User prompt or argument | Yes for draft-issue. |
| Product context | `steering/product.md` when present | No, but consumed when available. |
| Interview context | Onboard-project greenfield interview | Yes for greenfield onboarding. |
| Repository investigation | Local source/spec search | Context-dependent. |

---

## Dependencies

### Internal Dependencies

- [ ] `$skill-creator` is available for skill-bundled edits.
- [ ] Existing `scripts/skill-inventory-audit.mjs` can regenerate or verify the skill inventory baseline.
- [ ] Existing `scripts/codex-compatibility-check.mjs` can validate Codex compatibility.

### External Dependencies

- [ ] GitHub issue #105 remains the source issue for this spec.

### Blocked By

- [ ] None.

---

## Out of Scope

- Adding a Codex replacement for legacy Design ingestion
- Supporting non-GitHub issue trackers
- Bulk-normalizing historical specs that only record past behavior
- Changing unrelated SDLC pipeline behavior
- Rewriting historical changelog entries outside `[Unreleased]`

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Live Design URL references | 0 unsupported references | Targeted `rg` over README, live skills, live references, and inventory baseline. |
| Validation checks | 100% pass | `npm --prefix scripts run compat` and `node scripts/skill-inventory-audit.mjs --check` exit 0. |
| Workflow continuity | No broken command paths | Manual or dry-run review confirms draft-issue and onboard-project still have coherent Step 1 / greenfield flows. |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #105 | 2026-04-25 | Initial feature spec |
