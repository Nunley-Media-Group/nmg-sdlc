# Defect Report: sdlc-runner skill path resolution broken under Claude Code plugin cache layout

**Issue**: #88
**Date**: 2026-04-20
**Status**: Draft
**Author**: Claude Code
**Severity**: High
**Related Spec**: `specs/feature-automation-mode-support/`

---

## Reproduction

### Steps to Reproduce

1. Install `nmg-sdlc` via the Claude Code plugin system (`/plugin install nmg-sdlc@nmg-plugins`). Claude Code materializes the plugin at `~/.claude/plugins/cache/nmg-plugins/nmg-sdlc/<version>/` with `skills/` at the plugin root.
2. Create an `sdlc-config.json` containing `pluginsPath` pointing at the Claude Code marketplace checkout, e.g. `~/.claude/plugins/marketplaces/nmg-plugins/`.
3. Run `node scripts/sdlc-runner.mjs --config sdlc-config.json`.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS (reported); behavior is path-layout dependent so it reproduces on Linux/Windows with the same Claude Code plugin installs |
| **Version / Commit** | nmg-sdlc 1.53.3 |
| **Runtime** | Node.js (`scripts/sdlc-runner.mjs`) |
| **Configuration** | `pluginsPath` pointed at the CC marketplace checkout or the CC plugin cache root |

### Frequency

Always — the runner crashes on the first `readSkill()` call at startup. Every invocation against a Claude Code plugin install is affected.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The runner resolves `SKILL.md` files against whichever layout the user's config points at (plugin-root layout under the CC plugin cache, or the legacy nested monorepo layout) and begins executing the configured SDLC steps without a fatal file-not-found error. |
| **Actual** | `readSkill()` and `buildClaudeArgs()` unconditionally join `{pluginsPath}/plugins/nmg-sdlc/skills/{name}/SKILL.md`. Under the CC plugin cache (`~/.claude/plugins/cache/nmg-plugins/nmg-sdlc/<version>/`) `skills/` sits at the plugin root — there is no `plugins/nmg-sdlc/` subtree — so every skill read throws `Error: Skill file not found` and the process exits. |

### Error Output

```
Error: Skill file not found: ~/.claude/plugins/marketplaces/nmg-plugins/plugins/nmg-sdlc/skills/<name>/SKILL.md
```

The message reports only the composed path; it does not disclose which config field produced the root, so users cannot tell whether they mis-set `pluginsPath` or the composition rule itself is wrong for their layout.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed — Skills Resolve Under Plugin-Root Layout via `pluginRoot`

**Given** `sdlc-config.json` contains a `pluginRoot` field pointing directly at the plugin root (e.g., `~/.claude/plugins/cache/nmg-plugins/nmg-sdlc/1.53.3/`)
**When** the runner starts and calls `readSkill('write-spec')` (or any other step-associated skill)
**Then** it composes the path as `{pluginRoot}/skills/write-spec/SKILL.md`, finds the file, and proceeds past startup without a `Skill file not found` error
**And** `buildClaudeArgs()` uses the same `{pluginRoot}/skills/{name}/` location when emitting `skillRoot` references in the generated prompts

### AC2: No Regression — Legacy `pluginsPath` Nested Layout Still Works

**Given** an existing `sdlc-config.json` that sets only `pluginsPath` to a monorepo root containing `plugins/nmg-sdlc/skills/...`
**When** the runner starts
**Then** it continues to resolve skills as `{pluginsPath}/plugins/nmg-sdlc/skills/{name}/SKILL.md` (the existing behavior) with no change to output or exit status

### AC3: Diagnostic Error Discloses Configured Root and Attempted Path

**Given** the config points at a location where the composed skill path does not exist (wrong `pluginRoot` or wrong `pluginsPath`)
**When** the runner attempts to read any skill and the file is missing
**Then** the thrown error identifies which config field was used (`pluginRoot` or `pluginsPath`), its configured value, and the full path the runner tried — not just the missing file path alone
**And** the user can tell from the message alone which config field to correct

### AC4: Configuration Validation — Neither Field Set

**Given** an `sdlc-config.json` that sets neither `pluginRoot` nor `pluginsPath`
**When** the runner starts and validates its configuration
**Then** it exits with a non-zero status and an error message that names both supported fields and explains that at least one must be set (replacing the current `config must include projectPath and pluginsPath` message, which no longer reflects the supported configurations)

### AC5: Precedence When Both Fields Are Set

**Given** an `sdlc-config.json` that sets both `pluginRoot` and `pluginsPath`
**When** the runner resolves a skill path
**Then** `pluginRoot` takes precedence — the composed path is `{pluginRoot}/skills/{name}/SKILL.md` and `pluginsPath` is ignored for skill-path composition
**And** a one-line log note records which field won so the user can see the resolution decision in the runner log

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add a `pluginRoot` field to the runner's config schema; when present, `readSkill()` and `buildClaudeArgs()` compose skill paths as `{pluginRoot}/skills/{name}/SKILL.md` | Must |
| FR2 | Preserve backward compatibility: when `pluginRoot` is absent and `pluginsPath` is present, retain the existing `{pluginsPath}/plugins/nmg-sdlc/skills/{name}/SKILL.md` composition | Must |
| FR3 | Enhance the `readSkill()` error message to include (a) which config field produced the root, (b) that field's value, and (c) the full path attempted | Should |
| FR4 | Update the runner's startup config validation so the `projectPath`-and-`pluginsPath`-required check accepts `pluginRoot` as a substitute for `pluginsPath`, and names both options in the error when neither is set | Must |
| FR5 | When both `pluginRoot` and `pluginsPath` are set, select `pluginRoot` deterministically and log which field was used at startup | Should |
| FR6 | Update `scripts/sdlc-config.example.json` to document `pluginRoot` as the recommended field for Claude Code plugin-cache installs, keeping `pluginsPath` as the compatibility path | Should |

---

## Out of Scope

- Changing the Claude Code plugin installation or cache directory structure itself.
- Runtime auto-detection of the plugin cache location (e.g., probing `~/.claude/plugins/cache/**/nmg-sdlc/**`).
- Symlink-based workarounds as the primary fix.
- Multi-plugin configurations or resolving skills across more than one nmg-* plugin in a single runner invocation.
- Refactoring the broader configuration schema (effort matrix, step overrides, cleanup patterns, etc.) — only the two path-composition call sites and the related validation/log/example-config lines change.

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included (AC2)
- [x] Fix scope is minimal — no feature work mixed in
- [x] Out of scope is defined
