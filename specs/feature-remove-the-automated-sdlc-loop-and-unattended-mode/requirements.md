# Requirements: Remove the Automated SDLC Loop and Unattended Mode

**Issues**: #151
**Date**: 2026-08-13
**Status**: Approved
**Author**: Rich Nunley

---

## User Story

**As a** developer using nmg-sdlc's interactive, spec-driven workflow
**I want** the plugin to provide only the manual SDLC pipeline
**So that** its product surface stays focused on the workflow that provides value with current AI models

---

## Background

The automated loop no longer provides enough value to justify its product, maintenance, and migration surface. Current AI models can carry the interactive SDLC workflow effectively without a plugin-specific headless orchestrator, while the runner adds parallel execution semantics, special labels, runtime state, configuration, recovery paths, and cross-skill conditional behavior.

Version 2 makes a clean break. Active plugin surfaces provide only the manual issue-to-review pipeline, while onboarding and upgrade retain the useful managed repository assets that were previously coupled to runner configuration. Existing projects receive an ownership-aware, idempotent cleanup of obsolete runner artifacts. Historical specs and released changelog entries remain truthful records of capabilities that existed in prior releases.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Fresh Install Has No Automated Loop Surface

**Given** a user installs nmg-sdlc v2 into a new project
**When** the installed skills, scripts, configuration templates, tests, and packaged metadata are inventoried
**Then** no automated loop, runner configuration, runner lifecycle, or stop-loop capability is present
**And** no compatibility or deprecation stub exposes the removed commands

### AC2: Skills Use Interactive Contracts Only

**Given** a current SDLC skill reaches a decision or review gate
**When** the skill runs after the removal
**Then** it follows its interactive human-judgment contract
**And** no plugin-specific sentinel, unattended default, automatic approval, escalation branch, or orchestrator handoff changes that behavior

### AC3: Automation Eligibility Is Removed from Issue Workflows

**Given** a user drafts or selects a GitHub issue
**When** automation suitability would previously have been evaluated
**Then** the plugin does not ask about automation eligibility
**And** it does not create, apply, filter by, or display the `automatable` label

### AC4: Active Product Surfaces Describe the Manual Pipeline

**Given** a user reads current plugin metadata, documentation, steering, templates, shared guidance, agent contracts, fixtures, or skill output
**When** those active surfaces describe nmg-sdlc capabilities and workflows
**Then** they describe only the interactive pipeline from issue drafting through review-comment handling
**And** they contain no current claim that the plugin supports unattended or automated loop execution

### AC5: Useful Managed Repository Assets Remain Available

**Given** a new project is onboarded or an existing project is upgraded
**When** nmg-sdlc manages repository setup
**Then** the contribution-check workflow and structured GitHub issue form can still be installed or reconciled
**And** neither capability depends on `init-config` or runner configuration

### AC6: Upgrade Removes Only Known Obsolete Runner Artifacts

**Given** an existing project contains nmg-sdlc-owned runner artifacts
**When** `upgrade-project` applies the v2 migration
**Then** it removes `sdlc-config.json`, `.codex/unattended-mode`, `.codex/sdlc-state.json`, and their nmg-sdlc-managed ignore entries when present
**And** it preserves the managed contribution-check workflow and structured issue form
**And** it preserves unrelated user files, ignore rules, workflows, issue templates, and configuration
**And** repeated migration is safe and reports an already-clean state

### AC7: Existing GitHub Labels and Issue History Are Not Mutated

**Given** an existing repository has an `automatable` label or issues carrying that label
**When** the plugin is installed or upgraded
**Then** the repository label and existing issue labels remain unchanged
**And** the plugin simply stops creating or consuming that metadata

### AC8: Historical Records Remain Truthful and Intact

**Given** historical specs and prior changelog entries document automation features that existed in earlier releases
**When** active automation contracts are removed
**Then** those historical records are retained without bulk rewriting or deletion
**And** inventory and verification checks use an explicit historical boundary so archived references do not count as active product support

### AC9: Conflicting Open Backlog Is Reconciled

**Given** an open issue depends on the removed runner or unattended-mode behavior
**When** the v2 removal is delivered
**Then** that issue is either closed as superseded or amended to a valid manual-only scope
**And** #144, #145, and #149 are explicitly reviewed against this rule

### AC10: Manual Pipeline and Migration Are Verified

**Given** the removal is implemented
**When** plugin inventory checks, repository tests, migration safety tests, and affected-skill exercises run
**Then** no active automation contract or packaged runner asset remains
**And** migration proves ownership-aware deletion, preservation, and idempotence
**And** the interactive pipeline still works end to end from issue drafting through review-comment handling

### Generated Gherkin Preview

```gherkin
Feature: Remove the automated SDLC loop and unattended mode
  As a developer using nmg-sdlc's interactive, spec-driven workflow
  I want the plugin to provide only the manual SDLC pipeline
  So that its product surface stays focused on the workflow that provides value with current AI models

  Scenario: Fresh install has no automated loop surface
    Given a user installs nmg-sdlc v2 into a new project
    When the installed plugin surface is inventoried
    Then no automated loop capability or compatibility stub is present

  Scenario: Upgrade removes only known obsolete runner artifacts
    Given an existing project contains nmg-sdlc-owned runner artifacts
    When upgrade-project applies the v2 migration
    Then only the known runner artifacts and managed ignore entries are removed
    And unrelated project content is preserved

  # All ten acceptance criteria are represented in feature.gherkin.
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Hard-remove the automated loop, unattended execution mode, runner lifecycle, runner configuration, and automation-only support surfaces without compatibility stubs. | Must | Removal covers source, packaged, fresh-install, and upgraded active surfaces. |
| FR2 | Preserve the interactive SDLC pipeline from `draft-issue` through `address-pr-comments`. | Must | Existing phase outputs and downstream preconditions remain compatible. |
| FR3 | Remove automation eligibility behavior from issue drafting and issue selection without mutating existing GitHub labels or issue history. | Must | Existing `automatable` metadata becomes inert historical repository data. |
| FR4 | Keep the managed contribution-check workflow and structured issue form, with onboarding responsible for new projects and `upgrade-project` responsible for existing projects. | Must | Setup assets are decoupled from runner configuration. |
| FR5 | Make v2 consumer cleanup scoped to known nmg-sdlc-owned runner artifacts, safe for unrelated content, and idempotent. | Must | Ambiguous or user-owned content is preserved and reported rather than deleted. |
| FR6 | Remove current automation claims and instructions from all active user-facing, packaged, steering, template, reference, agent, fixture, audit, and test surfaces. | Must | Negative regression fixtures may name removed surfaces but must not expose runnable behavior. |
| FR7 | Preserve historical specs and prior release notes as truthful project history, with an explicit allowlist or equivalent boundary for active-surface audits. | Must | `specs/` and released changelog sections are historical sources, not active capability declarations. |
| FR8 | Reconcile open automation-dependent backlog so no active issue continues to require removed behavior. | Must | Explicitly review #144, #145, and #149. |
| FR9 | Verify the manual pipeline through exercise testing and verify migration cleanup through ownership, preservation, and repeat-run cases. | Must | Published fresh-install and upgrade proof remains a distinct release gate. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Active-surface validation and migration analysis remain bounded to declared paths and complete in time appropriate for normal plugin verification. |
| **Security** | Migration never signals processes, escalates privileges, executes repository-derived text, or deletes paths outside the exact owned artifact set. |
| **Accessibility** | All manual gates and migration results use concise plain-text labels and actionable diagnostics. |
| **Reliability** | Cleanup is idempotent, partial failures identify the exact artifact, and historical records are not rewritten as a side effect of validation. |
| **Platforms** | Source validation and migration behavior remain compatible with macOS, Windows, and Linux per `steering/tech.md`. |

---

## UI/UX Requirements

The plugin has a command-and-prompt interface rather than a graphical UI.

| Element | Requirement |
|---------|-------------|
| **Interaction** | Surviving decision points wait for explicit user input through `request_user_input`; no plugin sentinel changes gate behavior. |
| **Skill discovery** | Removed automation commands do not appear in installed skill discovery, aliases, redirects, or compatibility guidance. |
| **Migration output** | `upgrade-project` lists exact proposed cleanup paths before approval and reports removed, already-clean, preserved, and failed outcomes. |
| **Error states** | Ambiguous ownership, read failures, and deletion failures name the affected path and leave unrelated content unchanged. |
| **Empty states** | A project with no obsolete runner artifacts reports an already-clean v2 state. |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Active plugin root | Directory | Readable manifest-declared plugin tree with expected skills root | Yes for surface validation |
| `sdlc-config.json` | File presence | Exact project-root path; contents are not needed for deletion | No |
| `.codex/unattended-mode` | File presence | Exact project-root-relative path | No |
| `.codex/sdlc-state.json` | File presence | Exact project-root-relative path | No |
| Managed runner-ignore block | Text block | Recognized nmg-sdlc runner header plus exact owned entries | No |
| Existing GitHub labels/issues | Remote metadata | Read-only inspection only | No |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| Surface violations | Structured diagnostics | Forbidden active path, token category, and source path for each finding |
| Upgrade cleanup status | Plain-text status block | Removed, already-clean, preserved-unmanaged, and failed artifacts with gaps |
| Managed asset status | Plain-text status blocks | Contribution-gate and issue-form creation/reconciliation outcomes |
| Verification evidence | Report data | Local source/fixture results plus separate published-install proof state |

---

## Dependencies

### Internal Dependencies

- [x] `$nmg-sdlc:onboard-project` — owns managed repository assets for new projects.
- [x] `$nmg-sdlc:upgrade-project` — owns existing-project reconciliation and v2 cleanup.
- [x] `scripts/verify-plugin-surface.mjs` — existing active-surface validator extended for automation removal.
- [x] `scripts/skill-inventory-audit.mjs` — inventory baseline regenerated after contract removal.
- [x] `$skill-creator` — mandatory implementation route for every skill-bundled edit.

### External Dependencies

- [x] Git and the filesystem for repository inspection and owned-artifact cleanup.
- [x] GitHub CLI for read-only backlog reconciliation and normal manual pipeline exercises.
- [x] A published v2 plugin artifact for final fresh-install and real-upgrade verification.

### Blocked By

- None for local implementation and verification.
- Published-install closure is blocked until the v2 artifact and marketplace pointer exist.

---

## Out of Scope

- Deleting or bulk-rewriting historical specs and prior changelog entries.
- Removing existing `automatable` labels from GitHub repositories or altering labels on existing issues.
- Changing Codex native Auto Mode or its permission behavior.
- Adding a replacement orchestrator, headless mode, compatibility stub, or separate repository-setup skill.
- Redesigning the manual SDLC pipeline beyond changes required to remove automation-specific branches and wording.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active automation surface | Zero forbidden paths, commands, aliases, loader tokens, or current capability claims | Run the surface validator against source, staged release, fresh-install, and upgraded active roots |
| Migration safety | 100% preservation of unrelated files, ignore rules, workflows, issue templates, labels, and history | Ownership/preservation fixtures plus before/after comparisons |
| Migration idempotence | Second run reports already clean with no additional diff | Repeat the same upgrade exercise twice |
| Managed asset continuity | Contribution gate and issue form remain installable and reconcilable | Onboarding and upgrade exercise fixtures |
| Manual pipeline continuity | Every surviving stage remains executable with its documented human gates and downstream postconditions | Disposable-project issue-to-review exercise |
| Release closure honesty | Published fresh-install and upgrade claims cite version, commit SHA, active root, and fresh-session evidence | Post-publication verification report |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #151 | 2026-08-13 | Initial feature spec |

---

## Validation Checklist

- [x] User story follows "As a / I want / So that" format.
- [x] All acceptance criteria use Given/When/Then format.
- [x] Requirements describe observable contracts rather than implementation mechanics.
- [x] All criteria are testable and unambiguous.
- [x] Success metrics are measurable.
- [x] Cleanup error, preservation, and idempotence boundaries are specified.
- [x] Dependencies and the post-publication gate are identified.
- [x] Out of scope is defined.
- [x] Open questions are resolved.
