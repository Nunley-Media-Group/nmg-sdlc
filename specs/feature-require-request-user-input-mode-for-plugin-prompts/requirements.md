# Requirements: Require request_user_input Mode for Plugin Prompts

**Issues**: #110
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## User Story

**As a** developer using the nmg-sdlc Codex plugin
**I want** the plugin to automatically enable Codex user-question feature flags and route every user-input prompt through that contract
**So that** interactive workflows are consistent, typed, and always provide a free-form "something else" path

---

## Background

nmg-sdlc already has a shared Plan Mode input-gate contract in `references/interactive-gates.md`. That contract says manual gates use `request_user_input`, produce one decision-complete `<proposed_plan>`, and rely on the tool-provided free-form `Other` answer when predefined choices are insufficient. The repo also has `references/unattended-mode.md`, which separately controls `.codex/unattended-mode` for headless runner sessions.

The missing piece is first-run setup for Codex's prompt feature flags. If a user invokes an interactive nmg-sdlc skill before `~/.codex/config.toml` enables `[features].default_mode_request_user_input = true`, `[features].ask_user_questions = true`, and top-level `suppress_unstable_features_warning = true`, the documented prompt contract is not guaranteed to be available. nmg-sdlc should repair those settings automatically before manual gates, preserve unrelated user config, stop the current workflow after a successful repair, and tell the user to close and reopen Codex before retrying.

This feature keeps prompt-mode setup separate from `.codex/unattended-mode`: prompt feature flags enable the manual `request_user_input` surface, while `.codex/unattended-mode` suppresses manual gates for the runner.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Config Flags Are Added Automatically Before Interactive Prompts

**Given** an interactive nmg-sdlc skill is invoked and `~/.codex/config.toml` does not enable `[features].default_mode_request_user_input = true`, `[features].ask_user_questions = true`, and `suppress_unstable_features_warning = true`
**When** the skill reaches a user-input gate
**Then** nmg-sdlc adds or updates all required settings in the user's Codex config
**And** the current workflow is blocked with a message telling the user to close and reopen Codex before retrying

### AC2: All User Input Uses request_user_input

**Given** any bundled skill or shared/per-skill reference asks the user for input
**When** active instructions are audited
**Then** the prompt is expressed as a `request_user_input` gate
**And** active instructions do not use handwritten menus, ad hoc text prompts, or legacy prompt wording for user decisions

### AC3: Free-Form Something Else Path Is Always Available

**Given** a `request_user_input` gate offers predefined choices
**When** the user needs to provide an answer outside those choices
**Then** the final available path is the tool-provided free-form `Other` / "Something else" answer
**And** the skill documents how to handle that free-form text before continuing

### AC4: Setup Documentation Explains Automatic Config Management

**Given** a user installs, upgrades, or adopts the nmg-sdlc plugin
**When** they read the README or run setup/onboarding guidance
**Then** they see that nmg-sdlc automatically manages `[features].default_mode_request_user_input = true`, `[features].ask_user_questions = true`, and `suppress_unstable_features_warning = true` in `~/.codex/config.toml` for interactive plugin use

### AC5: Regression Coverage Pins the Prompt Contract

**Given** a developer changes skill or reference instructions
**When** the prompt-contract tests run
**Then** they fail if active prompt instructions omit `request_user_input`, omit free-form fallback handling, reintroduce ad hoc prompt wording, or drop automatic feature-flag setup guidance

### AC6: Under-Development Feature Warnings Are Suppressed Automatically

**Given** nmg-sdlc enables `[features].default_mode_request_user_input = true` and `[features].ask_user_questions = true`
**When** Codex would emit an under-development feature warning for either feature flag
**Then** nmg-sdlc also writes top-level `suppress_unstable_features_warning = true` to `~/.codex/config.toml` so future invocations do not display the warning

### AC7: Restart Required After Automatic Config Update

**Given** nmg-sdlc changed `~/.codex/config.toml` to add or update any required prompt feature setting
**When** the config write succeeds
**Then** the skill stops before continuing
**And** it tells the user to close and reopen Codex for the change to take effect
**And** when the user reruns the skill after reopening Codex, the skill proceeds to the normal `request_user_input` gate without repeating the config-update block if the settings are already present

### AC8: Existing User Config Is Preserved

**Given** `~/.codex/config.toml` already contains user settings, marketplace entries, plugin enablement, projects, or comments
**When** nmg-sdlc adds the request-user-input and ask-user-questions feature flags plus the warning suppression setting
**Then** it preserves unrelated config values and comments
**And** it only changes the required keys

### Generated Gherkin Preview

```gherkin
Feature: Require request_user_input mode for plugin prompts
  As a developer using the nmg-sdlc Codex plugin
  I want the plugin to automatically enable Codex user-question feature flags
  So that interactive workflows are consistent, typed, and include a free-form path

  Scenario: Config flags are added automatically before interactive prompts
    Given an interactive nmg-sdlc skill is invoked without the required Codex prompt settings
    When the skill reaches a user-input gate
    Then nmg-sdlc adds or updates all required settings in the user's Codex config
    And it blocks the workflow with close-and-reopen Codex instructions

  Scenario: All user input uses request_user_input
    Given any active bundled skill or reference asks the user for input
    When active instructions are audited
    Then the prompt is expressed as a request_user_input gate
    And no ad hoc menu or legacy prompt wording is used for the decision

  Scenario: Free-form something else path is always available
    Given a request_user_input gate offers predefined choices
    When the user needs to provide an answer outside those choices
    Then the final path is the tool-provided free-form Other answer
    And the skill documents how that text is handled

  Scenario: Setup documentation explains automatic config management
    Given a user installs, upgrades, or adopts nmg-sdlc
    When they read setup documentation
    Then the required Codex config keys and automatic management behavior are documented

  Scenario: Regression coverage pins the prompt contract
    Given a developer changes skill or reference instructions
    When prompt-contract tests run
    Then they fail on missing request_user_input wording, free-form fallback handling, or config setup guidance

  Scenario: Under-development feature warnings are suppressed automatically
    Given nmg-sdlc enables Codex prompt feature flags
    When Codex would warn about under-development features
    Then suppress_unstable_features_warning is also enabled

  Scenario: Restart is required after automatic config update
    Given nmg-sdlc changed the user's Codex config
    When the write succeeds
    Then the skill stops and instructs the user to close and reopen Codex
    And a rerun after restart proceeds without repeating the setup block

  Scenario: Existing user config is preserved
    Given the user's Codex config contains unrelated settings and comments
    When nmg-sdlc applies the required prompt settings
    Then unrelated config values and comments are preserved
    And only the required keys change
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Automatically ensure `[features].default_mode_request_user_input = true`, `[features].ask_user_questions = true`, and top-level `suppress_unstable_features_warning = true` in the user's `~/.codex/config.toml` before interactive nmg-sdlc prompts. | Must | Runs only on manual-gate paths, not unattended bypasses. |
| FR2 | Add shared config-management wording or a reusable reference consumed by all interactive skill entrypoints before they present user-input gates. | Must | Prefer the existing `references/interactive-gates.md` path so every current consumer inherits the precondition. |
| FR3 | Audit all bundled skills and shared/per-skill references for user-input prompts and normalize them to `request_user_input`. | Must | Active instructions only; historical specs may retain old wording. |
| FR4 | Ensure every menu-style prompt leaves a final free-form `Other` / "Something else" path when the user may need to supply an answer outside predefined choices. | Must | Document handling for free-form text in the relevant prompt flow. |
| FR5 | Add or extend regression coverage for feature-flag config management, warning suppression, prompt-tool wording, and free-form fallback handling. | Must | Extend `scripts/__tests__/interactive-gates-contract.test.mjs` or add focused tests. |
| FR6 | Keep `.codex/unattended-mode` runner behavior separate from Codex prompt-mode configuration. | Should | Unattended mode continues to skip request-user-input gates. |
| FR7 | Preserve unrelated `~/.codex/config.toml` contents when adding or updating the required settings. | Must | Preserve comments, plugin marketplace config, project config, and unrelated keys. |
| FR8 | After writing required Codex config settings, stop the active skill and instruct the user to close and reopen Codex before retrying. | Must | Do not continue into the original interactive prompt in the same session after a write. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Reliability** | Re-running the setup check against already-correct config must be a no-op and must not dirty the config file. |
| **Safety** | The updater must not rewrite unrelated TOML sections, remove comments, reorder marketplace entries, or mutate repository files while repairing user config. |
| **Compatibility** | Config handling must be cross-platform and avoid hardcoded path separators; default config location is derived from the user's home directory. |
| **Automation** | `.codex/unattended-mode` paths must not call `request_user_input` and must not be forced through prompt-mode setup before bypassing a gate. |
| **Testability** | Config mutation behavior must be testable against temporary config files without touching the real `~/.codex/config.toml`. |

---

## UI/UX Requirements

This feature has no graphical UI. User-facing output is Codex session text and `request_user_input` gates.

| Element | Requirement |
|---------|-------------|
| **Setup Block** | When config is changed, the message names the changed settings and tells the user to close and reopen Codex before retrying. |
| **Interaction** | Manual decisions use `request_user_input` in Plan Mode after the setup precondition is satisfied. |
| **Error States** | If config cannot be read or written, the skill reports the failing path and stops before presenting the original user-input gate. |
| **Empty States** | If `~/.codex/config.toml` or `[features]` is missing, nmg-sdlc creates the minimum required structure and preserves future extensibility. |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| `~/.codex/config.toml` | TOML text file | May be missing; if present, must be readable before mutation | No |
| `[features].default_mode_request_user_input` | Boolean | Must be `true` after setup | Yes |
| `[features].ask_user_questions` | Boolean | Must be `true` after setup | Yes |
| `suppress_unstable_features_warning` | Boolean | Must be top-level `true` after setup | Yes |
| Existing config comments and sections | TOML text | Preserve unless they are the required keys being updated | No |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| Updated `~/.codex/config.toml` | TOML text file | Contains the required prompt settings while preserving unrelated config |
| Setup status | Text or structured script output | Reports no-op, changed, or error state to the calling skill |
| Restart instruction | User-facing text | Required when any setting was changed |

---

## Dependencies

### Internal Dependencies
- [x] `references/interactive-gates.md` as the shared input-gate contract.
- [x] `references/unattended-mode.md` as the separate headless-runner contract.
- [x] `skills/*/SKILL.md` and per-skill references that present manual gates.
- [x] `scripts/__tests__/interactive-gates-contract.test.mjs` for prompt-contract regression coverage.
- [x] `README.md` and `CHANGELOG.md` documentation conventions.

### External Dependencies
- [ ] Codex reads `~/.codex/config.toml` at startup.
- [ ] Node.js runtime for zero-dependency helper scripts.

### Blocked By
- [ ] None.

---

## Out of Scope

- Changing Codex CLI feature flag semantics.
- Removing or redefining `.codex/unattended-mode`.
- Mutating this machine's `~/.codex/config.toml` as part of writing this spec.
- Adding new non-Codex prompt tooling.
- Migrating historical spec prose that is not part of active skill or reference instructions.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Prompt setup no-op stability | Second setup check produces no file diff | Unit test with an already-correct temp config |
| Prompt contract coverage | Active skill/reference audit has zero ad hoc prompt findings | Jest prompt-contract tests |
| Config preservation | Comments and unrelated sections remain byte-for-byte except touched key lines | Unit fixture comparison |
| Restart handoff | Changed-config path always stops before the original prompt | Contract test and exercise evidence |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #110 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] User story follows "As a / I want / So that" format.
- [x] All acceptance criteria use Given/When/Then format.
- [x] Implementation details are limited to requirements needed to make the contract testable.
- [x] All criteria are testable and unambiguous.
- [x] Success metrics are measurable.
- [x] Edge cases and error states are specified.
- [x] Dependencies are identified.
- [x] Out of scope is defined.
- [x] Open questions are documented or resolved.
