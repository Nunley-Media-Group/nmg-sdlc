# Tasks: Require request_user_input Mode for Plugin Prompts

**Issues**: #110
**Date**: 2026-04-27
**Status**: Planning
**Author**: Codex

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 3 | [ ] |
| Skill Contracts | 4 | [ ] |
| Documentation | 2 | [ ] |
| Testing | 4 | [ ] |
| **Total** | 13 | |

---

## Task Format

Each task follows this structure:

```markdown
### TNNN: Task Title

**File(s)**: `path/to/file`
**Type**: Create | Modify
**Depends**: TNNN or None
**Acceptance**:
- [ ] Verifiable criterion
```

Skill-bundled file changes (`skills/**`, `references/**`, and `agents/**`) must be routed through `$skill-creator` per `steering/tech.md`; there is no hand-edit fallback for those files.

---

## Phase 1: Setup

### T001: Create shared prompt-config contract

**File(s)**: `references/prompt-config.md`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Defines the required Codex config keys: `[features].default_mode_request_user_input = true`, `[features].ask_user_questions = true`, and top-level `suppress_unstable_features_warning = true`.
- [ ] Defines no-op, changed, and error behavior for interactive prompt setup.
- [ ] Requires changed-config runs to stop before the original user-input gate and instruct close/reopen Codex.
- [ ] States that `.codex/unattended-mode` bypass behavior is separate and governed by `references/unattended-mode.md`.
- [ ] Avoids logging full config contents or secrets.

### T002: Implement zero-dependency Codex config updater

**File(s)**: `scripts/ensure-codex-prompt-config.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Locates `~/.codex/config.toml` by default and accepts a `--config <path>` override for tests.
- [ ] Creates a missing config file with the minimum required top-level and `[features]` settings.
- [ ] Updates missing or false required keys to `true`.
- [ ] Preserves unrelated config values, comments, plugin marketplace settings, project settings, and section order.
- [ ] Emits deterministic JSON with `path`, `changed`, and `keysChanged`.
- [ ] Exits non-zero with a concise diagnostic when config cannot be safely read or written.

### T003: Add config updater unit tests

**File(s)**: `scripts/__tests__/codex-prompt-config.test.mjs`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Tests missing file creation.
- [ ] Tests insertion into an existing config with no `[features]` section.
- [ ] Tests updating false prompt flags and warning suppression to `true`.
- [ ] Tests no-op behavior leaves an already-correct config unchanged.
- [ ] Tests comments, unrelated sections, marketplace/plugin settings, and project settings are preserved.

---

## Phase 2: Skill Contracts

### T004: Wire interactive gates to prompt-config setup

**File(s)**: `references/interactive-gates.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Manual-mode gate instructions require running the prompt-config setup before calling `request_user_input`.
- [ ] The no-op path continues to the existing `request_user_input` gate.
- [ ] The changed path stops the workflow and instructs restart.
- [ ] The error path stops the workflow and reports the failing config path.
- [ ] Unattended-mode instructions still say never call `request_user_input` and do not require prompt setup before bypassing gates.

### T005: Audit active skill and reference prompt wording

**File(s)**: `skills/*/SKILL.md`, `skills/*/references/*.md`, `references/*.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- [ ] Active user-input instructions use `request_user_input` rather than handwritten menus, ad hoc text prompts, or legacy prompt wording.
- [ ] Review gates and decision points point back to `references/interactive-gates.md` where appropriate.
- [ ] Any retained prose examples are clearly non-active examples or are normalized to the new contract.
- [ ] Historical spec files are not modified solely to remove old wording.

### T006: Normalize free-form fallback handling

**File(s)**: `references/interactive-gates.md`, `skills/*/SKILL.md`, `skills/*/references/*.md`
**Type**: Modify
**Depends**: T004, T005
**Acceptance**:
- [ ] Every prompt with predefined choices that may need clarification or alternate content documents the free-form `Other` path.
- [ ] Free-form handling says how the answer is mapped back into the workflow before continuing.
- [ ] Prompts whose choices are exhaustive explain why no alternate path is needed.
- [ ] Regression tests can detect loss of the shared `Other` / "Something else" guidance.

### T007: Update skill inventory baseline

**File(s)**: `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T001, T004, T005, T006
**Acceptance**:
- [ ] Inventory baseline reflects the new shared reference and any changed audited clauses.
- [ ] No unrelated inventory churn is introduced.
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes.

---

## Phase 3: Documentation

### T008: Document automatic prompt config management in README

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- [ ] Installation or setup docs state that nmg-sdlc automatically ensures the required Codex prompt settings for interactive use.
- [ ] Docs name `default_mode_request_user_input`, `ask_user_questions`, and `suppress_unstable_features_warning`.
- [ ] Docs explain that a first run which changes config stops and requires closing/reopening Codex.
- [ ] Docs keep `.codex/unattended-mode` separate from Codex prompt-mode feature flags.

### T009: Add changelog entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T004, T008
**Acceptance**:
- [ ] `[Unreleased]` documents automatic prompt-mode config management.
- [ ] The entry mentions restart behavior after config repair.
- [ ] The entry follows existing changelog style.

---

## Phase 4: Testing

### T010: Extend prompt-contract regression tests

**File(s)**: `scripts/__tests__/interactive-gates-contract.test.mjs`
**Type**: Modify
**Depends**: T004, T005, T006
**Acceptance**:
- [ ] Tests assert `references/interactive-gates.md` points to prompt-config setup before manual gates.
- [ ] Tests assert active skill entrypoints that consume interactive gates still mention `request_user_input`.
- [ ] Tests fail if active instructions reintroduce ad hoc prompt wording for user decisions.
- [ ] Tests assert free-form `Other` fallback guidance remains present.

### T011: Add documentation and contract tests for prompt setup

**File(s)**: `scripts/__tests__/prompt-config-contract.test.mjs`
**Type**: Create
**Depends**: T001, T008, T009
**Acceptance**:
- [ ] Tests assert README documents automatic config management and restart behavior.
- [ ] Tests assert `references/prompt-config.md` names all required config keys.
- [ ] Tests assert changed-config behavior is a hard stop before the original prompt.
- [ ] Tests assert `.codex/unattended-mode` remains a separate bypass contract.

### T012: Run inventory, compatibility, and unit validation

**File(s)**: `scripts/skill-inventory.baseline.json`, `scripts/__tests__/*.mjs`
**Type**: Modify
**Depends**: T003, T007, T010, T011
**Acceptance**:
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes.
- [ ] `npm --prefix scripts test -- --runInBand` passes or unrelated failures are documented.
- [ ] `npm --prefix scripts run compat` passes.
- [ ] `git diff --check` passes.

### T013: Exercise changed prompt setup paths

**File(s)**: `specs/feature-require-request-user-input-mode-for-plugin-prompts/verification-report.md`
**Type**: Create
**Depends**: T002, T004, T008, T010, T011, T012
**Acceptance**:
- [ ] Exercise or dry-run evidence covers an interactive skill reaching a gate with missing prompt settings and stopping after config repair.
- [ ] Exercise or dry-run evidence covers a rerun with all settings present proceeding to the normal `request_user_input` gate.
- [ ] Exercise or dry-run evidence covers `.codex/unattended-mode` bypassing manual gates without prompting.
- [ ] Any exercise limitation is documented explicitly instead of silently substituting static review.

---

## Dependency Graph

```text
T001 --> T002 --> T003
T001 --> T004 --> T005 --> T006 --> T007
T004 --> T008 --> T009
T004 --> T010 --> T012
T001 --> T011 --> T012
T002 --> T013
T004 --> T013
T012 --> T013
```

Critical path: T001 -> T002 -> T004 -> T005 -> T006 -> T010 -> T012 -> T013.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #110 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] All tasks map to actual project paths.
- [x] Dependencies are identified.
- [x] Each acceptance criterion has a corresponding Gherkin scenario.
- [x] Testing tasks include unit, contract, inventory, compatibility, and exercise coverage.
- [x] Documentation tasks cover public behavior changes.
- [x] Skill-bundled file routing through `$skill-creator` is explicitly included.
