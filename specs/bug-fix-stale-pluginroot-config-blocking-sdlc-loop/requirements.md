# Defect Report: Fix stale pluginRoot config blocking SDLC loop

**Issue**: #124
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex
**Severity**: High
**Related Spec**: `specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/`

---

## Reproduction

### Steps to Reproduce

1. Configure a project for the SDLC runner with an `sdlc-config.json` whose `pluginRoot` points at an unavailable versioned nmg-sdlc plugin cache, such as `/Users/rnunley/.codex/plugins/cache/nmg-plugins/nmg-sdlc/1.59.0`.
2. Ensure a newer nmg-sdlc plugin cache is installed and valid, such as `/Users/rnunley/.codex/plugins/cache/nmg-plugins/nmg-sdlc/1.65.1`, with `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`.
3. Run `$nmg-sdlc:run-loop` from the configured project, or invoke `scripts/sdlc-runner.mjs --config sdlc-config.json` with the stale project config.
4. Work around the failure by creating a temporary config whose `pluginRoot` points at the currently installed plugin cache.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS with Codex plugin cache |
| **Version / Commit** | Reproduced with stale project config referencing nmg-sdlc cache 1.59.0 while a newer nmg-sdlc cache such as 1.65.1 is installed |
| **Runtime** | `$nmg-sdlc:run-loop`, `scripts/sdlc-runner.mjs`, `$nmg-sdlc:upgrade-project` |
| **Configuration** | Checked-in `sdlc-config.json` with absolute `pluginRoot` into a versioned cache directory |

### Frequency

Always when the configured `pluginRoot` or the derived runner path no longer exists.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The loop or upgrade path detects that `pluginRoot` points at an unavailable versioned nmg-sdlc cache and either refreshes it through a safe supported path or stops with a direct correction message. Users do not need to maintain a separate temporary config to run the SDLC loop. |
| **Actual** | `$nmg-sdlc:run-loop` and `sdlc-runner.mjs` trust the stale configured path, fail before the SDLC loop can proceed, and leave the checked-in project config stale. `$nmg-sdlc:upgrade-project` can report generic scalar drift, but it does not semantically validate that `pluginRoot` exists or safely repair stale versioned cache roots. |

### Error Output

Representative failures include the runner path or skill path being unavailable:

```text
Error: Cannot find module '/Users/rnunley/.codex/plugins/cache/nmg-plugins/nmg-sdlc/1.59.0/scripts/sdlc-runner.mjs'
```

```text
Skill file not found: /Users/rnunley/.codex/plugins/cache/nmg-plugins/nmg-sdlc/1.59.0/skills/<skill>/SKILL.md
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Stale `pluginRoot` Is Detected Before a Temporary Config Is Needed

**Given** a project `sdlc-config.json` points `pluginRoot` at an unavailable versioned nmg-sdlc cache
**And** a current installed nmg-sdlc plugin root can be resolved and verified
**When** `$nmg-sdlc:run-loop` starts from that project
**Then** the stale `pluginRoot` is detected before the user has to create a temporary config
**And** the run either uses a safe recovered plugin root for this invocation or stops with an actionable correction message naming the stale path and the expected valid plugin-root shape.

### AC2: `$nmg-sdlc:upgrade-project` Repairs Stale Cache Roots Safely

**Given** `$nmg-sdlc:upgrade-project` analyzes a project `sdlc-config.json` whose `pluginRoot` points at an unavailable versioned nmg-sdlc cache
**And** a current installed nmg-sdlc plugin root can be resolved and verified
**When** upgrade-project presents or applies non-destructive runner-config findings
**Then** the findings include a runner-config path refresh
**And** applying the finding updates only the stale plugin path fields needed for the runner to locate the installed plugin.

### AC3: Valid Custom Plugin Roots Are Preserved

**Given** `pluginRoot` intentionally points at an existing local checkout or other valid plugin root containing `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`
**When** runner startup or upgrade-project config analysis runs
**Then** that configured root is treated as valid
**And** it is not blindly replaced by the newest versioned cache path.

### AC4: Existing Path Compatibility Does Not Regress

**Given** a config uses legacy `pluginsPath` only, or sets both `pluginRoot` and `pluginsPath`
**When** skill path resolution runs
**Then** legacy fallback behavior and current `pluginRoot` precedence remain intact
**And** existing tests for plugin-root and monorepo layouts continue to pass.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Validate that the configured plugin root and derived runner path exist before `$nmg-sdlc:run-loop` proceeds into the loop. | Must |
| FR2 | Validate the plugin-root shape with concrete filesystem checks for `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs` before treating a configured or recovered root as usable. | Must |
| FR3 | Teach `$nmg-sdlc:upgrade-project` to detect stale versioned nmg-sdlc cache roots in `sdlc-config.json` and propose or apply a safe refresh to the current installed plugin root. | Must |
| FR4 | Preserve unrelated user-selected config values, including project path, model, effort, timeout, retry, cleanup, and valid custom plugin-root settings. | Must |
| FR5 | Preserve legacy `pluginsPath` compatibility and existing `pluginRoot` precedence when both path fields are set. | Must |
| FR6 | Add regression coverage for stale cache roots, valid custom roots, missing cache roots with no resolvable replacement, and legacy `pluginsPath` compatibility. | Must |
| FR7 | Update README/config guidance if the recovery path changes how users should maintain `sdlc-config.json` after plugin upgrades. | Should |

---

## Out of Scope

- Changing Codex's plugin cache directory layout.
- Automatically deleting checked-in project configs.
- Broad `sdlc-config.json` schema redesign.
- Rewriting unrelated model, effort, timeout, retry, cleanup, or project-path settings.
- Replacing valid custom plugin roots with the newest cache version just because a cache version exists.

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal - no feature work mixed in
- [x] Out of scope is defined

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #124 | 2026-04-27 | Initial defect report |
