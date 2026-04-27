# Requirements: Add Managed GitHub Issue Form for SDLC-Ready Issues

**Issues**: #135
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## User Story

**As a** developer using nmg-sdlc in this repository or a consumer project
**I want** GitHub's manual issue flow to collect the same structured fields expected from `$nmg-sdlc:draft-issue`
**So that** issues are spec-ready even when they are created directly in GitHub instead of through the skill

---

## Background

`$nmg-sdlc:draft-issue` creates structured, BDD-ready GitHub issues with user story or defect context, Given/When/Then acceptance criteria, functional requirements, scope boundaries, priority, and automation suitability. Manual GitHub issue creation can bypass those fields, leaving `$nmg-sdlc:write-spec` and later SDLC stages with weaker inputs.

This feature adds a managed GitHub Issue Form YAML template to the plugin repository and installs that same managed form into consumer projects through setup and upgrade flows. The design follows the existing managed-artifact pattern used by the contribution guide and contribution gate, with one intentional difference from the contribution gate: the issue-form target path is owned by nmg-sdlc and may be overwritten when setup or upgrade applies the current form.

Retrospective learnings apply directly here: managed files need explicit path, overwrite, idempotency, status, and preservation rules; automation-facing flows need deterministic unattended behavior; and external GitHub schema limitations need tests so docs and generated YAML do not advertise unsupported behavior.

---

## Acceptance Criteria

### AC1: Repository Issue Form Exists

**Given** a contributor opens a new issue in the nmg-sdlc GitHub repository
**When** they choose the SDLC issue form
**Then** GitHub presents a structured Issue Form YAML template for SDLC-ready issues
**And** the form lives under `.github/ISSUE_TEMPLATE/` in this repository
**And** required fields enforce the core `$nmg-sdlc:draft-issue` expectations before submission.

### AC2: Draft-Issue Expectations Are Captured

**Given** the SDLC issue form is displayed
**When** a contributor fills out the required fields
**Then** the form captures issue type, user story or bug/spike context, Given/When/Then acceptance criteria, functional requirements, scope boundaries, priority, and automation suitability
**And** the resulting issue body is usable as input to downstream `$nmg-sdlc:write-spec` work.

### AC3: Submitted Issue Body Is Spec-Ready

**Given** a contributor submits the SDLC issue form
**When** GitHub converts the form responses into an issue body
**Then** the body contains recognizable sections for issue type, context, acceptance criteria, functional requirements, scope, priority, and automation suitability
**And** acceptance criteria remain in a format that can be translated one-to-one into Gherkin scenarios.

### AC4: Init Config Installs the Managed Form

**Given** a consumer project runs `$nmg-sdlc:init-config`
**When** the skill installs managed project artifacts
**Then** it writes the nmg-sdlc managed issue form into the project's `.github/ISSUE_TEMPLATE/` directory
**And** the final status reports the issue-form installation outcome.

### AC5: Upgrade Project Reconciles the Managed Form

**Given** an existing consumer project runs `$nmg-sdlc:upgrade-project`
**When** the skill analyzes managed project artifacts
**Then** it detects a missing or outdated nmg-sdlc managed issue form
**And** it installs or updates the form as part of the upgrade findings and summary.

### AC6: Existing Target-Path Templates Are Overwritten

**Given** a consumer project already has a file at the managed issue-form target path
**When** `$nmg-sdlc:init-config` or `$nmg-sdlc:upgrade-project` applies the managed issue form
**Then** the nmg-sdlc form replaces the existing file
**And** the status summary clearly reports that the target-path template was overwritten.

### AC7: Unrelated Issue Templates Are Preserved

**Given** a consumer project has other files under `.github/ISSUE_TEMPLATE/`
**When** `$nmg-sdlc:init-config` or `$nmg-sdlc:upgrade-project` applies the managed issue form
**Then** unrelated issue templates are not moved, deleted, renamed, reformatted, or overwritten
**And** only the approved nmg-sdlc issue-form target path is managed.

### AC8: Public Docs Describe the Managed Issue Form

**Given** users read the plugin README and CHANGELOG
**When** this feature ships
**Then** the docs describe the managed GitHub issue form, the setup and upgrade flows that install it, and the overwrite behavior for the managed target path.

### AC9: Install Paths Are Exercised

**Given** the implementation is verified against disposable projects
**When** `$nmg-sdlc:init-config` and `$nmg-sdlc:upgrade-project` are exercised
**Then** both flows produce the expected `.github/ISSUE_TEMPLATE/` issue form
**And** the verification evidence confirms the generated YAML contains the required draft-issue fields.

### AC10: GitHub Form Schema Remains Valid

**Given** the managed issue form is created or installed
**When** tests inspect the YAML template
**Then** it satisfies GitHub Issue Form schema expectations for required top-level keys, supported body field types, unique ids, unique labels, and required validations
**And** dropdown options that could be parsed as booleans are quoted.

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add a GitHub Issue Form YAML template for SDLC-ready issues to this repository. | Must | Approved repository path: `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`. |
| FR2 | Require form fields aligned to `$nmg-sdlc:draft-issue` output expectations, including issue type, structured context, Given/When/Then acceptance criteria, functional requirements, scope, priority, and automation suitability. | Must | The form body must be directly readable by `$nmg-sdlc:write-spec`. |
| FR3 | Define a shared managed issue-form contract for lifecycle skills to install, overwrite, reconcile, and summarize the form consistently. | Must | Use the existing shared-reference pattern rather than duplicating install rules in each skill. |
| FR4 | Update `$nmg-sdlc:init-config` so runner setup installs the managed issue form into consumer projects. | Must | Runs alongside existing managed contribution-gate setup. |
| FR5 | Update `$nmg-sdlc:upgrade-project` so project upgrades install or reconcile the managed issue form. | Must | Missing or outdated forms are managed project artifact findings. |
| FR6 | Replace any existing file at the managed issue-form target path and report the overwrite in setup or upgrade summaries. | Must | This overwrite rule applies only to the approved target path. |
| FR7 | Preserve unrelated files under `.github/ISSUE_TEMPLATE/` and unrelated workflows under `.github/workflows/`. | Must | Managed issue-form installation must not disturb other project-owned templates or CI. |
| FR8 | Update `README.md` and `CHANGELOG.md` to document the managed issue form and setup/upgrade behavior. | Must | README is the public entry point for adopting projects. |
| FR9 | Verify behavior by exercising both setup and upgrade installation paths against disposable projects. | Must | Exercise coverage should include create, overwrite, idempotent rerun, and unrelated-template preservation cases. |
| FR10 | Validate the YAML template against GitHub Issue Form schema constraints in static tests. | Must | Cover required top-level keys, field ids/labels, required validations, and boolean-like dropdown values. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Schema Validity** | The form follows GitHub Issue Form YAML conventions: required `name`, `description`, and `body` keys; supported input types; non-empty body; unique ids and labels. |
| **Reliability** | Re-running init or upgrade against an already-current form produces no unrelated diffs and reports `already present` or equivalent current-state status. |
| **Preservation** | Only `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` is managed. Other issue templates, workflows, README content, and contributor policy remain project-owned. |
| **Observability** | Setup and upgrade summaries clearly distinguish `created`, `updated`, `overwritten`, `already present`, and gap states. |
| **Automation** | Unattended mode applies the managed issue form deterministically without prompting and records the outcome in the final summary. |
| **Portability** | Installation logic uses cross-platform path handling and does not rely on shell-specific path manipulation. |
| **Security** | The form must not request secrets, credentials, tokens, private keys, or sensitive internal URLs. |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Issue type | Dropdown | Options cover Feature/Enhancement, Bug, Epic, and Spike; option strings that look boolean are quoted when present | Yes |
| Structured context | Textarea | Captures user story for features or reproduction/research context for bugs and spikes | Yes |
| Acceptance criteria | Textarea | Requires Given/When/Then structure and supports multiple ACs | Yes |
| Functional requirements | Textarea | Supports ID, requirement, priority, and notes rows | Yes |
| Scope boundaries | Textarea | Captures in-scope and out-of-scope lists | Yes |
| Priority | Dropdown | MoSCoW-aligned values | Yes |
| Automation suitability | Dropdown | Captures whether hands-off SDLC automation is appropriate | Yes |
| Additional notes | Textarea | Optional references, constraints, or known gaps | No |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` | YAML | Canonical issue form in this plugin repository and installed managed artifact in consumer projects |
| Issue Form status | Summary text | Stable status block reporting create/update/overwrite/current outcome, target path, and gaps |
| GitHub issue body | Markdown | GitHub-generated issue content from form responses, structured enough for `$nmg-sdlc:write-spec` |

---

## Dependencies

### Internal Dependencies

- [x] `$nmg-sdlc:draft-issue` issue-body contract and templates
- [x] `$nmg-sdlc:init-config` managed project artifact setup flow
- [x] `$nmg-sdlc:upgrade-project` managed project artifact reconciliation flow
- [x] Existing contribution-gate managed-artifact pattern
- [x] `scripts/skill-inventory-audit.mjs` baseline audit for new shared references

### External Dependencies

- [x] GitHub Issue Forms YAML support
- [x] GitHub issue template chooser behavior
- [ ] No repository secrets or project settings changes required

### Blocked By

- [ ] None

---

## Out of Scope

- Changing the `$nmg-sdlc:draft-issue` interview workflow itself.
- Supporting non-GitHub issue trackers.
- Adding GitHub Projects automation or project-board rules.
- Direct changes to `$nmg-sdlc:onboard-project` beyond behavior it already receives through `$nmg-sdlc:init-config` or `$nmg-sdlc:upgrade-project`.
- Dynamically applying labels from a single GitHub Issue Form field; GitHub Issue Forms do not provide conditional label assignment from dropdown answers.
- Replacing the managed GitHub Actions contribution gate or project CI.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Form completeness | All draft-issue-equivalent fields are present and required where appropriate | Static contract test over canonical YAML |
| Install coverage | Init and upgrade exercise tests both produce the managed form | Disposable-project tests |
| Overwrite transparency | Existing target-path file is replaced and summary reports overwrite | Fixture exercise with pre-existing target path |
| Preservation | Unrelated issue templates remain byte-for-byte unchanged | Fixture diff before/after init and upgrade |
| Schema validity | YAML parses and satisfies GitHub form schema constraints covered by tests | Static parser/contract test |
| Documentation coverage | README and CHANGELOG explain setup, upgrade, and overwrite behavior | Static docs assertions |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #135 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements beyond managed artifact contracts and GitHub form constraints
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases and error states are specified
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented or resolved
