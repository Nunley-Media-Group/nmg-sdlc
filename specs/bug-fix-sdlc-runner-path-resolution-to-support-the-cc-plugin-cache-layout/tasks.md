# Tasks: Fix sdlc-runner path resolution to support the CC plugin cache layout

**Issue**: #88
**Date**: 2026-04-20
**Status**: Planning
**Author**: Claude Code

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Implement `pluginRoot` support and the shared `resolveSkillsBase()` resolver in `sdlc-runner.mjs` | [ ] |
| T002 | Update config validation, example config, and startup logging | [ ] |
| T003 | Add Jest regression tests for AC1–AC5 | [ ] |
| T004 | Verify no regressions | [ ] |

---

### T001: Implement `pluginRoot` support and `resolveSkillsBase()`

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Module-level `PLUGIN_ROOT` variable declared alongside `PLUGINS_PATH` (near line 39) and populated from `config.pluginRoot` in the config-load block (near line 103).
- [ ] `__test__.setConfig()` accepts `pluginRoot` with the same `cfg.pluginRoot ?? PLUGIN_ROOT` pattern used by `pluginsPath` (near line 2400).
- [ ] New private `resolveSkillsBase()` helper returns `PLUGIN_ROOT` when set, else `path.join(PLUGINS_PATH, 'plugins', 'nmg-sdlc')`, and throws a config error with a message naming both supported fields when neither is set.
- [ ] The helper records the chosen source (`'pluginRoot'` vs `'pluginsPath'`) in a module-level `SKILL_ROOT_SOURCE` string so error messages and the startup log can read it.
- [ ] `readSkill()` (lines 892–898) calls `resolveSkillsBase()` and, on missing file, throws an error that includes (a) the chosen field name, (b) its configured value, and (c) the full composed skill-file path.
- [ ] `buildClaudeArgs()` `skillRoot` composition (lines 903–905) calls `resolveSkillsBase()` — no `plugins/nmg-sdlc/` literal remains in this function.
- [ ] When both `pluginRoot` and `pluginsPath` are set, `resolveSkillsBase()` deterministically picks `pluginRoot` and sets `SKILL_ROOT_SOURCE = 'pluginRoot'`.

**Notes**: This is the core fix — the rest of the tasks depend on the resolver existing. Keep the two call sites routed through the helper so they cannot drift.

### T002: Update config validation, example config, and startup logging

**File(s)**: `scripts/sdlc-runner.mjs`, `scripts/sdlc-config.example.json`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `validateConfig()` (line 190) gains a rule that errors when both `pluginRoot` and `pluginsPath` are absent, with a message that names both supported fields and explains at least one must be set.
- [ ] The ad-hoc `!PROJECT_PATH || !PLUGINS_PATH` check at lines 119–122 is replaced so `pluginRoot` alone is a valid configuration; `projectPath` remains required.
- [ ] `main()` startup logging (near line 2187) prints `Plugin root: <resolved value> (from <SKILL_ROOT_SOURCE>)` in place of the current `Plugins: ${PLUGINS_PATH}` line so the user can see which field won in every log file.
- [ ] `scripts/sdlc-config.example.json` documents a `pluginRoot` entry with an inline comment (or `_note` key, matching the existing `_cleanup_note` / `_draft_issue_note` convention) explaining that CC plugin-cache installs should set `pluginRoot` while monorepo installs can keep `pluginsPath`.

### T003: Add Jest regression tests for AC1–AC5

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Create (new `describe` block) + Modify (extend existing test helpers where needed)
**Depends**: T001, T002
**Acceptance**:
- [ ] A new `describe('skill path resolution (#88)', …)` block is added.
- [ ] AC1 test: with `pluginRoot` set and `pluginsPath` unset, `readSkill('write-spec')` resolves to `{pluginRoot}/skills/write-spec/SKILL.md` (mock `fs.existsSync` to return true and assert the path passed in). Scenario tagged `@regression` in the corresponding gherkin.
- [ ] AC2 test: with only `pluginsPath` set, `readSkill('write-spec')` resolves to `{pluginsPath}/plugins/nmg-sdlc/skills/write-spec/SKILL.md` — identical to today's behavior.
- [ ] AC3 test: when `fs.existsSync` returns false, `readSkill()` throws an error whose message includes the chosen field name (e.g., `pluginRoot`), its configured value, and the full composed path.
- [ ] AC4 test: `validateConfig({ projectPath: '/p' })` returns an error whose message names both `pluginRoot` and `pluginsPath` and indicates at least one is required.
- [ ] AC5 test: with both fields set, `resolveSkillsBase()` (or its observable effect via `readSkill()`/`buildClaudeArgs()`) composes against `pluginRoot`, and the same assertion confirms `SKILL_ROOT_SOURCE` reports `pluginRoot`.
- [ ] A shared-prefix regression assertion confirms that for the same step/skill, `readSkill()` and `buildClaudeArgs()` produce paths with the same `…/skills/<name>` prefix.

**Notes**: Follow the existing `validateConfig (#77)` test style — the new block can reuse `setupTestConfig()` with targeted overrides per test. Do not reach for real filesystem calls; `mockFs.existsSync` is already wired in `beforeEach`.

### T004: Verify No Regressions

**File(s)**: existing test files, runner smoke path
**Type**: Verify (no file changes)
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `npm test` (or the project's Jest invocation) passes with the new and existing tests green.
- [ ] A dry-run smoke invocation against a local `pluginRoot` (e.g., this repo) resolves at least one skill without `Skill file not found`, confirming the on-disk path composition works outside the mock.
- [ ] No changes in `skills/`, `references/`, or `steering/` — the fix is confined to `scripts/`.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #88 | 2026-04-20 | Initial defect report |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
