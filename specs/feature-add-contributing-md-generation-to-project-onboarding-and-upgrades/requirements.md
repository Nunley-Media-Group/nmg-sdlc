# Requirements: Add CONTRIBUTING.md Generation to Project Onboarding and Upgrades

**Issues**: #109
**Date**: 2026-04-26
**Status**: Draft
**Author**: Codex

---

## User Story

**As a** developer adopting nmg-sdlc on a project
**I want** onboarding and upgrade flows to create and maintain a project-level `CONTRIBUTING.md`
**So that** contributors understand the expected GitHub issue, steering, and BDD spec workflow before they start proposing or implementing work

---

## Background

Projects developed with nmg-sdlc depend on durable context outside source code. Product, technical, and structure guidance lives in `steering/`; work starts from GitHub issues; implementation traces through BDD specs in `specs/`; delivery flows through verification and PR creation. Today `$nmg-sdlc:onboard-project` bootstraps or reconciles many of those artifacts, and `$nmg-sdlc:upgrade-project` updates existing managed artifacts, but neither flow creates a contributor-facing guide that explains how those artifacts shape future work.

This feature adds a reusable contribution-guide contract shared by onboarding and upgrade workflows. The guide must preserve existing project-authored contribution policy, summarize nmg-sdlc expectations, consult steering for project-specific context, and keep the project README linked to the guide when a README already exists.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Greenfield Onboarding Creates CONTRIBUTING.md

**Given** a greenfield project has no `CONTRIBUTING.md`
**When** `$nmg-sdlc:onboard-project` completes steering bootstrap
**Then** a root `CONTRIBUTING.md` is created
**And** it explains contributor expectations for GitHub issues, BDD specs, and respecting project steering before implementation
**And** it references the project steering files that were just created

### AC2: Brownfield Onboarding Creates CONTRIBUTING.md

**Given** a brownfield project is being onboarded and has no `CONTRIBUTING.md`
**When** `$nmg-sdlc:onboard-project` completes or verifies the steering layer before reconciliation
**Then** a root `CONTRIBUTING.md` is created before onboarding exits
**And** it reflects that existing code and reconciled specs are part of the contribution context
**And** missing or incomplete steering is handled only after the existing onboarding steering bootstrap path succeeds

### AC3: Upgrade Creates Missing CONTRIBUTING.md

**Given** an already-initialized project has steering docs but no `CONTRIBUTING.md`
**When** `$nmg-sdlc:upgrade-project` runs
**Then** it proposes or applies creation of a root `CONTRIBUTING.md` according to the normal interactive vs unattended upgrade rules
**And** the creation is treated as a non-destructive upgrade operation
**And** the upgrade summary reports whether the file was created, skipped, or already present

### AC4: Existing CONTRIBUTING.md Is Preserved

**Given** a project already has a `CONTRIBUTING.md`
**When** onboarding enhancement mode or upgrade runs
**Then** existing contributor content is not overwritten
**And** any nmg-sdlc contribution expectations are added only as a targeted missing section or reported as already present
**And** unrelated sections, custom project policies, and formatting are preserved

### AC5: README Links the Contribution Guide

**Given** a project has a `README.md`
**When** onboarding or upgrade ensures `CONTRIBUTING.md`
**Then** the README links to `CONTRIBUTING.md` in a discoverable setup or contribution section
**And** re-running the same skill does not duplicate the link
**And** if no README exists, the skill records the missing README as a gap instead of creating an unrelated README

### AC6: Generated Content Accounts for Steering

**Given** `steering/product.md`, `steering/tech.md`, and `steering/structure.md` exist
**When** `CONTRIBUTING.md` content is generated or updated
**Then** it directs contributors to consult product, technical, and structure steering before drafting issues, writing specs, or implementing code
**And** it includes project-specific expectations derived from steering where the skill can safely summarize them
**And** it remains stack-agnostic when steering does not provide stack-specific details

### AC7: No Regression in Onboard and Upgrade Idempotency

**Given** onboarding or upgrade is run multiple times on the same project
**When** `CONTRIBUTING.md` and the README link are already up to date
**Then** the skills report that no contribution-guide changes are needed
**And** `git status` remains clean after the second run, aside from unrelated pre-existing changes

### AC8: Public Plugin Documentation Is Updated

**Given** this feature ships
**When** a user reads the nmg-sdlc README
**Then** the First-Time Setup and upgrade documentation mention that projects receive a root `CONTRIBUTING.md`
**And** the docs describe that the guide covers issue, spec, and steering expectations

### AC9: Contribution Guide Verification Exercises Both Workflows

**Given** this feature changes skill-bundled onboarding or upgrade behavior
**When** verification runs for the implementation
**Then** onboarding is exercised against a disposable project and confirms the generated `CONTRIBUTING.md` and README link
**And** upgrade is exercised against a disposable initialized project and confirms missing-guide creation, existing-guide preservation, and idempotent rerun behavior
**And** any exercise limitation is documented in the verification report instead of silently substituting static review

### AC10: Upgrade-Project Allows Managed File Creation

**Given** the current nmg-sdlc contract declares a missing project-root artifact as managed and non-destructive
**When** `$nmg-sdlc:upgrade-project` analyzes an initialized project
**Then** the skill may propose or apply creation of that missing managed artifact according to the normal interactive vs unattended upgrade rules
**And** the workflow no longer states a blanket prohibition against creating files
**And** unrelated project files are still not synthesized unless the current upgrade contract explicitly names them as managed artifacts

### Generated Gherkin Preview

```gherkin
Feature: Add CONTRIBUTING.md Generation to Project Onboarding and Upgrades
  As a developer adopting nmg-sdlc on a project
  I want onboarding and upgrade flows to create and maintain a project-level CONTRIBUTING.md
  So that contributors understand the expected GitHub issue, steering, and BDD spec workflow

  Scenario: Greenfield onboarding creates CONTRIBUTING.md
    Given a greenfield project has no CONTRIBUTING.md
    When onboard-project completes steering bootstrap
    Then a root CONTRIBUTING.md is created
    And it explains issue, spec, and steering expectations

  Scenario: Brownfield onboarding creates CONTRIBUTING.md
    Given a brownfield project is being onboarded and has no CONTRIBUTING.md
    When onboard-project completes or verifies the steering layer
    Then a root CONTRIBUTING.md is created before onboarding exits
    And it reflects existing code and reconciled specs as contribution context

  Scenario: Upgrade creates missing CONTRIBUTING.md
    Given an initialized project has steering docs but no CONTRIBUTING.md
    When upgrade-project runs
    Then CONTRIBUTING.md creation is handled as a non-destructive upgrade operation
    And the summary reports whether the file was created, skipped, or already present

  Scenario: Existing CONTRIBUTING.md is preserved
    Given a project already has a CONTRIBUTING.md
    When onboarding enhancement mode or upgrade runs
    Then existing contributor content is not overwritten
    And missing nmg-sdlc expectations are added only as a targeted section or reported as present

  Scenario: README links the contribution guide
    Given a project has a README.md
    When onboarding or upgrade ensures CONTRIBUTING.md
    Then the README links to CONTRIBUTING.md in a discoverable section
    And rerunning the skill does not duplicate the link

  Scenario: Generated content accounts for steering
    Given product, tech, and structure steering exist
    When CONTRIBUTING.md content is generated or updated
    Then contributors are directed to consult all three steering docs
    And project-specific expectations are derived from steering where safely summarizable

  Scenario: Onboard and upgrade reruns are idempotent
    Given CONTRIBUTING.md and the README link are already up to date
    When onboarding or upgrade is run again
    Then the skills report that no contribution-guide changes are needed
    And git status remains clean aside from unrelated pre-existing changes

  Scenario: Public plugin documentation is updated
    Given this feature ships
    When a user reads the nmg-sdlc README
    Then setup and upgrade docs mention the root CONTRIBUTING.md behavior
    And they describe issue, spec, and steering expectations

  Scenario: Verification exercises both workflows
    Given the implementation changes onboarding or upgrade behavior
    When verification runs
    Then onboarding and upgrade are exercised against disposable projects
    And generated guide, README link, preservation, and idempotency behavior are checked

  Scenario: Upgrade-project allows managed file creation
    Given the current nmg-sdlc contract declares a missing project-root artifact as managed and non-destructive
    When upgrade-project analyzes an initialized project
    Then it may propose or apply creation of that missing managed artifact
    And it no longer states a blanket prohibition against creating files
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Provide a reusable `CONTRIBUTING.md` generation/update contract for nmg-sdlc-managed projects | Must | Shared by onboarding and upgrade flows |
| FR2 | `$nmg-sdlc:onboard-project` creates `CONTRIBUTING.md` after steering exists in greenfield, greenfield-enhancement, brownfield, and brownfield-no-issues paths when the file is missing | Must | Must not run before required steering bootstrap succeeds |
| FR3 | `$nmg-sdlc:upgrade-project` detects missing or incomplete contribution-guide coverage and handles it as a non-destructive upgrade finding | Must | Interactive and unattended rules must be explicit |
| FR4 | The generated guide covers GitHub issue expectations, BDD spec expectations, steering-doc expectations, and the normal nmg-sdlc workflow from issue through PR | Must | Content remains stack-agnostic unless steering supplies project-specific detail |
| FR5 | README link insertion is idempotent and preserves existing README content | Must | Missing README is reported as a gap, not created |
| FR6 | Existing `CONTRIBUTING.md` content is preserved; only missing nmg-sdlc sections are added or reported | Must | No overwrite of custom contributor policy |
| FR7 | Generated content uses project steering as the source of project-specific contribution expectations and avoids hardcoded language/framework assumptions | Must | Applies to product, tech, and structure steering |
| FR8 | Update this plugin's README and CHANGELOG `[Unreleased]` section to document the new behavior | Must | Public docs must match shipped capability |
| FR9 | Verification exercises onboarding and upgrade against disposable projects and checks the generated `CONTRIBUTING.md` plus README link | Should | Exercise-based verification is required by steering for skill changes |
| FR10 | Replace `$nmg-sdlc:upgrade-project`'s blanket "never create files" rule with a managed-artifact creation policy for non-destructive project files declared by the current plugin contract | Must | `CONTRIBUTING.md` is the first artifact covered by this policy |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Reliability** | Re-running onboarding or upgrade must not duplicate contribution-guide sections or README links and must leave the working tree clean when already up to date. |
| **Safety** | Existing project-authored `CONTRIBUTING.md` and `README.md` content must be preserved; changes must be additive and scoped. |
| **Compatibility** | Behavior must work across macOS, Windows, and Linux and avoid shell or path assumptions beyond existing skill contracts. |
| **Automation** | Unattended mode must have deterministic non-blocking behavior for missing-guide and existing-guide cases. |
| **Stack-Agnosticism** | Generated guidance must avoid hardcoded language, framework, or tool assumptions unless they are sourced from project steering. |

---

## UI/UX Requirements

This feature has no graphical UI. User-facing skill output must remain concise and actionable.

| Element | Requirement |
|---------|-------------|
| **Interaction** | Interactive upgrade decisions, if any, use the existing Plan Mode `request_user_input` gate semantics. |
| **Summary Output** | Onboarding and upgrade summaries report whether `CONTRIBUTING.md` was created, updated, skipped, or already present. |
| **Error States** | Missing README is reported as a gap with no unrelated README creation. |
| **Empty States** | Projects without existing contribution guidance receive a complete nmg-sdlc contribution section after steering exists. |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `steering/product.md` | Markdown file | Exists after steering bootstrap; readable before guide generation | Yes |
| `steering/tech.md` | Markdown file | Exists after steering bootstrap; readable before guide generation | Yes |
| `steering/structure.md` | Markdown file | Exists after steering bootstrap; readable before guide generation | Yes |
| `CONTRIBUTING.md` | Markdown file | Optional existing user-authored content; preserve if present | No |
| `README.md` | Markdown file | Optional target for an idempotent contribution-guide link | No |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| `CONTRIBUTING.md` | Markdown file | Root contribution guide covering nmg-sdlc issue, spec, steering, and workflow expectations |
| `README.md` link | Markdown link | Discoverable link to `CONTRIBUTING.md` when a README exists |
| Skill summary entry | Text | Reports created, updated, skipped, or already-present state |
| Upgrade managed-artifact policy | Skill instruction text | Documents when `upgrade-project` may create missing managed project files |

---

## Dependencies

### Internal Dependencies
- [x] `skills/onboard-project/` steering bootstrap and brownfield reconciliation flow
- [x] `skills/upgrade-project/` non-destructive template/contract reconciliation flow and managed-artifact creation policy
- [x] `steering/product.md`, `steering/tech.md`, and `steering/structure.md`
- [x] `README.md` and `CHANGELOG.md` documentation conventions

### External Dependencies
- [ ] None beyond existing nmg-sdlc workflow dependencies

### Blocked By
- [ ] None

---

## Out of Scope

- Changing the core issue to spec to implementation to verification to PR workflow semantics
- Adding support for non-GitHub issue trackers
- Legal contribution policies such as CLA/DCO enforcement
- Overwriting or deleting existing project-specific contribution policies
- Creating a README in projects that do not already have one
- Creating arbitrary files from `$nmg-sdlc:upgrade-project` without an explicit managed-artifact contract
- Moving runtime artifacts out of `.codex/`

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Guide creation coverage | All onboarding and upgrade paths that have steering and no guide produce or propose `CONTRIBUTING.md` | Exercise greenfield, brownfield-style initialized, and upgrade disposable projects |
| Preservation | Zero overwritten custom contribution content | Diff existing-guide fixture before and after upgrade/onboarding rerun |
| Idempotency | Second run produces no contribution-guide or README-link diff | `git status --short` after repeated runs |
| Discoverability | README links to `CONTRIBUTING.md` when README exists | Markdown inspection in exercise fixtures |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #109 | 2026-04-26 | Initial feature spec |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases and error states are specified
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented or resolved
