# Root Cause Analysis: sdlc-runner skill path resolution broken under Claude Code plugin cache layout

**Issue**: #88
**Date**: 2026-04-20
**Status**: Draft
**Author**: Claude Code

---

## Root Cause

`sdlc-runner.mjs` was written when the plugin lived as a subtree inside the `nmg-plugins` monorepo, and the skill-path formula was frozen against that one layout. Both of the skill-path call sites — `readSkill()` at `scripts/sdlc-runner.mjs:892-898` and the `skillRoot` composition inside `buildClaudeArgs()` at `scripts/sdlc-runner.mjs:900-905` — hardcode `path.join(PLUGINS_PATH, 'plugins', 'nmg-sdlc', 'skills', <name>, 'SKILL.md')`. The intermediate `plugins/nmg-sdlc/` segment was correct only under the pre-split monorepo.

Claude Code now installs the plugin at `~/.claude/plugins/cache/nmg-plugins/nmg-sdlc/<version>/`, and a local clone materializes the plugin at its repo root — both expose `skills/` directly at the root with no `plugins/nmg-sdlc/` subtree. Pointing `pluginsPath` at either of those roots (or at the marketplace checkout, which has no `plugins/` tree at all) produces a path that never resolves, so `fs.existsSync(skillPath)` is false and `readSkill()` throws on the very first step that requires a skill. The startup validation at `scripts/sdlc-runner.mjs:119-122` only checks that `pluginsPath` is set — it does not check that the resulting skill tree actually exists, so the failure surfaces several layers deeper as an opaque `Skill file not found` message that names the composed path but not the config field that produced it.

The fix is scoped to these three pieces — the two path-composition call sites, the startup validation, and the error message — plus a new `pluginRoot` config field so users on the CC plugin cache layout can point the runner at the plugin root directly. The existing `pluginsPath`-with-nested-`plugins/nmg-sdlc/` composition is preserved as a fallback so no working configuration breaks.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-runner.mjs` | 39, 103, 119–122, 190–224 | Module-level `PLUGINS_PATH` declaration, config load, required-field validation, `validateConfig()` |
| `scripts/sdlc-runner.mjs` | 892–898 | `readSkill()` — composes the skill file path and throws when missing |
| `scripts/sdlc-runner.mjs` | 900–905 | `buildClaudeArgs()` — composes `skillRoot` for the `Resolve relative file references from …` directive it injects into prompts |
| `scripts/sdlc-runner.mjs` | 2183–2189 | `main()` startup logging — currently logs `Plugins: ${PLUGINS_PATH}` only |
| `scripts/sdlc-runner.mjs` | 2398–2414 | `__test__.setConfig()` — test harness needs to accept `pluginRoot` alongside `pluginsPath` |
| `scripts/sdlc-config.example.json` | 1–26 | Documented config template — needs a `pluginRoot` entry (commented-out or alternative) with guidance |

### Triggering Conditions

- `sdlc-config.json` sets `pluginsPath` to any directory that does not contain a `plugins/nmg-sdlc/skills/` subtree — i.e., the CC plugin cache root, the marketplace checkout, or a local clone of the standalone `nmg-sdlc` repo.
- The runner reaches any step whose `step.skill` is set (the first is typically `startIssue`), so the fault is not caught by a dry-run startup path.
- The condition was not caught earlier because the existing test suite (`scripts/__tests__/sdlc-runner.test.mjs:117`) uses a mocked `pluginsPath` and mocks `fs.existsSync` to return false by default, so the test environment never exercises a real skill file on disk under any layout.

---

## Fix Strategy

### Approach

Introduce a single resolver — `resolveSkillsBase()` — that returns the directory containing `skills/` based on a fixed precedence: `pluginRoot` wins if set; otherwise fall back to the legacy `path.join(pluginsPath, 'plugins', 'nmg-sdlc')`; if neither is set, throw a config error. Both `readSkill()` and `buildClaudeArgs()` call the resolver instead of inlining the formula, so the two call sites stay in lockstep by construction. The resolver also records (via a module-level variable populated at config load) which field was used, so `readSkill()`'s error message and the `main()` startup log can both name it. Startup validation moves from the ad-hoc `!PROJECT_PATH || !PLUGINS_PATH` check into `validateConfig()`, which already owns the other config-shape errors — keeping the validation surface in one place.

This is the minimal correct fix: it does not change what gets read (still `SKILL.md` under a `skills/` subtree), does not add new dependencies, does not auto-detect the cache location at runtime, and does not touch any other step or skill. All existing working configurations keep working unchanged.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` | Add a module-level `PLUGIN_ROOT` variable next to `PLUGINS_PATH` (line 39) and load it from `config.pluginRoot` in the config-load block (line 103 area) and in `__test__.setConfig()` (line 2400 area) | Parallel to existing `PLUGINS_PATH` plumbing — same lifecycle, same test hook |
| `scripts/sdlc-runner.mjs` | Introduce `resolveSkillsBase()` that returns `PLUGIN_ROOT || path.join(PLUGINS_PATH, 'plugins', 'nmg-sdlc')` and remembers the source field (`'pluginRoot'` vs `'pluginsPath'`) in a module-level `SKILL_ROOT_SOURCE` string | Single source of truth for the composition; both call sites use it; error messages and startup logs can name the chosen field |
| `scripts/sdlc-runner.mjs` | Rewrite `readSkill()` (892–898) to call `resolveSkillsBase()` and, on `ENOENT`, throw an error containing (a) the chosen field name, (b) its configured value, and (c) the full composed path | AC3 — diagnostic error discloses enough to self-diagnose config mistakes |
| `scripts/sdlc-runner.mjs` | Rewrite `buildClaudeArgs()` (903–905) to compute `skillRoot` via `resolveSkillsBase()` + `path.join(..., 'skills', step.skill)` | AC1 — the `Resolve relative file references from …` prompt directive must point at the same plugin layout `readSkill()` just used |
| `scripts/sdlc-runner.mjs` | Replace the ad-hoc startup check at 119–122 with a `validateConfig()` rule: error when both `pluginRoot` and `pluginsPath` are absent; keep `projectPath`-required separate | AC4 — consolidated validation, clearer error naming both supported fields |
| `scripts/sdlc-runner.mjs` | In `main()` startup logging (2187), log `Plugin root: <value> (from <field>)` so the log reflects which field was chosen | AC5 — deterministic precedence is observable in the runner log without a separate debug flag |
| `scripts/sdlc-config.example.json` | Add a `pluginRoot` entry with a comment block explaining which installs want which field (CC plugin cache → `pluginRoot`; monorepo → `pluginsPath`) | FR6 — users need the example to show the recommended field for CC plugin-cache installs |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add Jest cases for: `pluginRoot`-only config resolving to `{pluginRoot}/skills/<name>/SKILL.md`; legacy `pluginsPath`-only config resolving to the nested path; both-set precedence going to `pluginRoot`; `readSkill()` error message containing the field name and value; `validateConfig({})` with neither field set returning an error naming both | Regression test surface per AC1/AC2/AC3/AC4/AC5 — matches the existing `validateConfig (#77)` test style |

### Blast Radius

- **Direct impact**: `scripts/sdlc-runner.mjs` (path-composition, validation, logging) and `scripts/sdlc-config.example.json` only. No skill file, no steering doc, no reference file is touched.
- **Indirect impact**: Every SDLC step that reads a skill (`startIssue`, `writeSpecs`, `implement`, `verify`, `createPR`) goes through the new resolver. The resolver's legacy branch produces the exact same string the current inline formula produces, so a user on the monorepo layout sees no behavioral change.
- **Out-of-process impact**: The `skillRoot` the runner injects into each `claude -p` prompt changes value for `pluginRoot` users — but only to point at the correct on-disk location, which is the whole point.
- **Risk level**: Low. The fix is additive (new field, new resolver, richer error) with a documented fallback that preserves every working configuration byte-for-byte.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing `pluginsPath`-only configs silently change resolution | Low | Regression test (AC2) pins the exact `{pluginsPath}/plugins/nmg-sdlc/skills/<name>/SKILL.md` string for the legacy branch |
| `pluginRoot` is set but typo'd; runner exits with the same opaque message as before | Low | AC3 regression test asserts the error body contains the field name, its value, and the full composed path |
| Developer sets both fields during migration and is surprised which one wins | Low | AC5 regression test pins `pluginRoot`-wins precedence; `main()` startup log surfaces the decision in every run |
| `buildClaudeArgs()` and `readSkill()` drift out of sync after future edits | Low | Both now route through `resolveSkillsBase()`; a unit test asserts they produce paths with the same prefix so any future divergence is caught at test time |
| Test-only `__test__.setConfig()` consumers (outside this PR's tests) break when `pluginRoot` is introduced | Low | `setConfig` adds `pluginRoot` with `cfg.pluginRoot ?? PLUGIN_ROOT` — existing callers that omit the field keep their current behavior |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Auto-detect the plugin cache location at runtime (glob `~/.claude/plugins/cache/**/nmg-sdlc/**`) | Runner probes the filesystem to find the highest-version cached plugin | Rejected by the issue's Out-of-Scope list; also tightly couples the runner to CC's internal cache layout, which is a moving target |
| Symlink `{pluginsPath}/plugins/nmg-sdlc/` → the real plugin root | Keep the formula, ask users to create a symlink | Rejected by the issue's Out-of-Scope list; shifts the problem onto users and breaks on Windows without developer mode |
| Rename `pluginsPath` in place to mean "plugin root" and drop the nested composition | Simpler runner, same behavior going forward | Breaks every existing `sdlc-config.json` — violates AC2 and the "backwards-compatible" framing of FR2 |
| Probe both layouts in `readSkill()` and use whichever file exists first | Zero config change; runner figures it out | Silent fallbacks hide config drift; AC3 specifically wants the error to name the field that was used |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references (lines 39, 103, 119–122, 892–905, 2398–2414 in `sdlc-runner.mjs`; `scripts/sdlc-config.example.json`)
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md` — scripts layer owns the runner; no skill or steering changes)
