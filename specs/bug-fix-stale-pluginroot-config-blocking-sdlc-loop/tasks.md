# Tasks: Fix stale pluginRoot config blocking SDLC loop

**Issue**: #124
**Date**: 2026-04-27
**Status**: Planning
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add runner plugin-root validation and stale-root diagnostics | [ ] |
| T002 | Update run-loop stale-root recovery instructions through `$skill-creator` | [ ] |
| T003 | Teach upgrade-project to detect and repair stale cache roots through `$skill-creator` | [ ] |
| T004 | Add regression coverage and BDD scenarios | [ ] |
| T005 | Update user-facing config guidance if behavior changes | [ ] |
| T006 | Verify runner, skill, and config behavior | [ ] |

---

### T001: Add Runner Plugin-Root Validation

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] A helper validates a plugin root by checking for `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`.
- [ ] Runner startup validates the selected `resolveSkillsBase()` root before executing SDLC steps or building child prompts.
- [ ] Stale-root diagnostics name the selected field (`pluginRoot` or `pluginsPath`), the configured value, the missing artifact, and the expected valid plugin-root shape.
- [ ] Existing `pluginRoot` precedence and legacy `pluginsPath` path composition remain unchanged for valid paths.
- [ ] Direct `node scripts/sdlc-runner.mjs --config <config>` invocations fail before child skill reads when the selected root is stale and no verified replacement exists.

**Notes**: Keep this zero-dependency and cross-platform; use `node:path` / `node:fs` patterns already present in the runner.

### T002: Update Run-Loop Stale-Root Recovery

**File(s)**: `skills/run-loop/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Edit is routed through `$skill-creator` because `skills/run-loop/SKILL.md` is a skill-bundled file.
- [ ] Step 3 detects when the configured runner path derived from `pluginRoot` or `pluginsPath` is missing.
- [ ] When the configured path is stale, the skill resolves and verifies a current installed nmg-sdlc plugin root using the same discovery priorities as `$nmg-sdlc:init-config`.
- [ ] If a verified replacement exists, the skill uses the replacement runner path for the current invocation and tells the user the project config should be repaired by `$nmg-sdlc:upgrade-project`.
- [ ] If no verified replacement exists, the skill stops with an actionable message naming the stale path and required valid root shape, rather than suggesting an ad hoc temporary config.

**Notes**: Do not have run-loop rewrite `sdlc-config.json` directly. Durable config repair belongs to upgrade-project.

### T003: Add Upgrade-Project Path Refresh Findings

**File(s)**: `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/verification.md`, `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Edits are routed through `$skill-creator` because upgrade-project skill files and references are skill-bundled files.
- [ ] Config analysis detects stale versioned nmg-sdlc cache roots when `pluginRoot` or the selected legacy path no longer exists.
- [ ] Valid custom plugin roots with `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs` are preserved and not reported as stale.
- [ ] When a verified current installed nmg-sdlc root exists, upgrade-project records a non-destructive runner-config path-refresh finding.
- [ ] Applying the finding updates only the stale path field(s) required for the runner to locate the installed plugin, preserving all unrelated config values.
- [ ] In unattended mode, stale path-refresh findings are auto-applied; generic config drift remains report-only unless explicitly approved in interactive mode.
- [ ] If no verified replacement exists, the summary records a gap with a direct remediation message and makes no path changes.

**Notes**: Keep this separate from generic config value drift so unattended mode does not begin applying arbitrary scalar defaults.

### T004: Add Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, `specs/bug-fix-stale-pluginroot-config-blocking-sdlc-loop/feature.gherkin`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Runner tests cover stale `pluginRoot` detection and no-replacement diagnostics.
- [ ] Runner tests cover valid custom plugin roots being accepted unchanged.
- [ ] Runner tests cover legacy `pluginsPath` compatibility and existing `pluginRoot` precedence.
- [ ] Upgrade-project behavior is covered by static or exercise-based verification that checks stale path findings, valid custom-root preservation, unattended auto-apply, and no-replacement gaps.
- [ ] Every acceptance criterion in `requirements.md` has a matching `@regression` Gherkin scenario.

**Notes**: Prefer deterministic fixture directories and mocked `fs` behavior for runner unit tests. Skill behavior can be validated through exercise output if direct unit tests are not appropriate.

### T005: Update Config Guidance

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T002, T003
**Acceptance**:
- [ ] If the implemented recovery behavior changes user-facing maintenance guidance, README explains that `sdlc-config.json` may contain a versioned `pluginRoot`.
- [ ] README points users to `$nmg-sdlc:upgrade-project` as the supported durable repair for stale versioned cache roots.
- [ ] README does not recommend manually creating temporary configs as the normal recovery path.

**Notes**: Skip this task only if implementation changes are fully internal and the existing README remains accurate.

### T006: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, changed skill-bundled files, `README.md`, `specs/bug-fix-stale-pluginroot-config-blocking-sdlc-loop/feature.gherkin`
**Type**: Verify
**Depends**: T004, T005
**Acceptance**:
- [ ] `cd scripts && npm test` passes.
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes when skill files or references changed.
- [ ] Exercise `$nmg-sdlc:run-loop` against a disposable project with a stale `pluginRoot`, or document why exercise testing was not feasible and verify the generated behavior through a dry-run/static substitute.
- [ ] Exercise or dry-run `$nmg-sdlc:upgrade-project` against a disposable project config with a stale versioned cache root and a valid custom root case.
- [ ] `git diff --check` passes.

**Notes**: Full live GitHub loop execution is not required for this defect; the verification target is config/root handling before the loop enters GitHub-dependent SDLC steps.

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix - no feature work
- [x] Regression test is included
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #124 | 2026-04-27 | Initial defect task plan |
