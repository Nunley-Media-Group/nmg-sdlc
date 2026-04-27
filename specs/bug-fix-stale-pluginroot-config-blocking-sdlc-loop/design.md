# Root Cause Analysis: Fix stale pluginRoot config blocking SDLC loop

**Issue**: #124
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## Root Cause

`$nmg-sdlc:init-config` writes an absolute `pluginRoot` into `sdlc-config.json`, and the recommended Codex install path is a versioned cache directory. That path is not durable: after plugin upgrades or cache cleanup, a checked-in project config can still point at the older cache version even though a newer nmg-sdlc plugin is installed. The current `$nmg-sdlc:run-loop` instructions derive the runner path directly from the configured `pluginRoot`, then stop if `<pluginRoot>/scripts/sdlc-runner.mjs` is missing. This detects the symptom but does not resolve the current installed root or guide the user through the supported repair path.

The runner itself also validates only that either `pluginRoot` or `pluginsPath` is configured. `validateConfig()` accepts any non-empty `pluginRoot`, `resolveSkillsBase()` returns it without checking the filesystem, and `readSkill()` is the first place that notices a missing skill file. That means direct runner invocations can fail after startup with `Skill file not found` instead of a root-level stale-config diagnostic.

`$nmg-sdlc:upgrade-project` already analyzes `sdlc-config.json`, but its current config analysis is structural: it adds missing keys and reports scalar drift. Existing scalar values are intentionally preserved, and unattended mode does not apply drift updates. That is correct for user-selected model, effort, timeout, and cleanup values, but it leaves a semantic path defect unhandled: a versioned nmg-sdlc cache root that no longer exists is not a valid custom value and should be treated as a non-destructive runner-config repair when a current installed plugin root can be verified.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/run-loop/SKILL.md` | 46-65 | Reads `sdlc-config.json`, derives the runner path from `pluginRoot` or `pluginsPath`, and currently stops when the derived runner path is missing. |
| `scripts/sdlc-runner.mjs` | 109-126, 200-209 | Loads config and validates only required fields, not plugin-root existence or shape. |
| `scripts/sdlc-runner.mjs` | 986-1007 | `resolveSkillsBase()` and `readSkill()` trust `PLUGIN_ROOT` until a specific `SKILL.md` file is missing. |
| `scripts/sdlc-runner.mjs` | 1015-1017 | `buildCodexArgs()` injects `skillRoot` from the same trusted root into child prompts. |
| `scripts/sdlc-runner.mjs` | 2513-2518 | Startup logging reports the chosen root but does not verify it before logging success context. |
| `skills/upgrade-project/references/verification.md` | 7-24 | Config analysis compares keys and scalar drift but does not semantically validate plugin path fields. |
| `skills/upgrade-project/SKILL.md` | 203-229 | Config drift updates are interactive-only and skipped in unattended mode, which is too conservative for a missing versioned cache root with a verified replacement. |
| `skills/upgrade-project/references/upgrade-procedures.md` | 67-74, 115-123 | Config apply logic adds missing keys and selected drift values but has no path-refresh operation. |
| `skills/init-config/SKILL.md` | 30-46 | Source of generated absolute versioned `pluginRoot`; this behavior is still useful but needs downstream repair support after cache turnover. |
| `scripts/__tests__/sdlc-runner.test.mjs` | 3458-3610 | Existing plugin-root and legacy `pluginsPath` regression tests that must stay green while stale-root coverage is added. |

### Triggering Conditions

- A checked-in or long-lived project `sdlc-config.json` contains a `pluginRoot` under the nmg-sdlc versioned Codex cache.
- That configured cache directory has been removed or is otherwise unavailable.
- A newer nmg-sdlc plugin root is installed and valid, but the stale project config has not been refreshed.
- The user starts `$nmg-sdlc:run-loop`, runs `scripts/sdlc-runner.mjs --config sdlc-config.json`, or runs `$nmg-sdlc:upgrade-project` expecting stale project artifacts to be reconciled.

---

## Fix Strategy

### Approach

Add a narrow plugin-root validation and recovery contract instead of broad config rewriting. A usable plugin root is one directory that contains `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`. Valid custom roots pass unchanged. Stale versioned nmg-sdlc cache roots fail the shape check and can be refreshed only when the workflow resolves another installed nmg-sdlc root that passes the same shape check.

The runtime side should fail early and clearly. `$nmg-sdlc:run-loop` should not stop at "runner not found" when the stale path is recognizable; it should resolve the current installed plugin root using the same discovery approach as `$nmg-sdlc:init-config`, verify the shape, and use that runner for this invocation or emit a direct correction message when no replacement is available. `sdlc-runner.mjs` should also validate the selected skills base before building child prompts so direct runner invocations surface the stale path before a child step fails.

The durable repair belongs in `$nmg-sdlc:upgrade-project`. Extend config analysis to record a runner-config path-refresh finding when `pluginRoot` is missing, points at an unavailable versioned nmg-sdlc cache root, and a verified installed replacement exists. Treat this as a non-destructive managed runner-config finding, not as generic scalar drift: it may apply in unattended mode because the existing value is unusable and the replacement is verified. Preserve all unrelated config values and skip valid custom plugin roots entirely.

Because the repair touches skill-bundled files (`skills/run-loop/SKILL.md`, `skills/upgrade-project/**`, and any shared `references/**` additions), implementation must route those edits through `$skill-creator` per `steering/tech.md`. Script and spec/test files can be edited normally.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` | Add a small plugin-root validator and run it against `resolveSkillsBase()` before startup proceeds into step execution; diagnostics name the selected field, configured value, missing required artifact, and the expected valid shape. | AC1 and AC4: direct runner invocations fail before child skill reads with actionable stale-root output while preserving existing precedence. |
| `scripts/sdlc-runner.mjs` | Optionally use the running script's own plugin root as a verified runtime fallback when the configured `pluginRoot` is a missing versioned nmg-sdlc cache root and the current runner resides in a valid plugin root. | AC1: a current runner launched by `$nmg-sdlc:run-loop` can keep the invocation moving without a temp config, while custom invalid roots still fail clearly. |
| `skills/run-loop/SKILL.md` | Through `$skill-creator`, update Step 3 so a missing configured runner path triggers installed-plugin-root discovery, shape validation, and either safe launch through the current valid root or an actionable diagnostic that points to `$nmg-sdlc:upgrade-project`. | AC1: the in-session skill no longer leaves users to invent a temporary config. |
| `skills/upgrade-project/references/verification.md` | Through `$skill-creator`, add semantic path analysis for `pluginRoot` and `pluginsPath`: valid roots are preserved, missing versioned nmg-sdlc cache roots become path-refresh findings when a verified replacement exists, and missing roots with no replacement become gaps. | AC2 and AC3: upgrade can distinguish stale cache roots from intentional custom roots. |
| `skills/upgrade-project/references/upgrade-procedures.md` | Through `$skill-creator`, add an apply procedure that updates only the stale path field(s), preserves JSON formatting, re-reads the file, and verifies the refreshed root shape after write. | AC2: approved or unattended-managed findings produce a durable config repair. |
| `skills/upgrade-project/SKILL.md` | Through `$skill-creator`, classify stale path refreshes as non-destructive runner-config findings that are auto-applied in unattended mode, while generic config drift remains report-only unless explicitly approved. | AC2 and AC3: stale unusable paths are repairable without weakening the custom-value preservation rule. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add unit coverage for stale `pluginRoot` detection, valid custom root preservation, no-replacement diagnostics, and unchanged legacy `pluginsPath` behavior. | FR6: regression coverage for runner-side path semantics. |
| `README.md` | If the user-facing recovery behavior changes, document that `sdlc-config.json` may contain a versioned `pluginRoot` and that `$nmg-sdlc:upgrade-project` repairs stale cache roots safely. | FR7: users know the supported maintenance path after plugin upgrades. |

### Blast Radius

- **Direct impact**: `scripts/sdlc-runner.mjs`, `scripts/__tests__/sdlc-runner.test.mjs`, `skills/run-loop/SKILL.md`, `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/verification.md`, and `skills/upgrade-project/references/upgrade-procedures.md`.
- **Indirect impact**: `$nmg-sdlc:init-config` remains the source of initial absolute `pluginRoot` values, but does not need to change unless implementation finds its discovery wording should be reused through a shared reference.
- **Compatibility impact**: Legacy `pluginsPath`-only configs must keep resolving as `{pluginsPath}/plugins/nmg-sdlc`. Configs that set both fields must keep `pluginRoot` precedence.
- **Risk level**: Medium. The fix touches both runner script behavior and prompt-based upgrade/run-loop instructions. The scope stays bounded by using explicit shape checks and preserving every valid custom path.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Valid local checkout roots are mistaken for stale cache roots and overwritten | Medium | AC3 requires shape validation and preservation of any existing root with `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`; add fixture coverage. |
| Legacy `pluginsPath` layouts regress while adding stale `pluginRoot` handling | Low | AC4 keeps existing #88 tests green and adds a regression case for pluginsPath-only configs. |
| Run-loop and direct runner paths diverge | Medium | Route both through the same root-shape definition and include tests or exercise evidence for `$nmg-sdlc:run-loop` plus direct `node scripts/sdlc-runner.mjs --config`. |
| Upgrade-project starts overwriting intentional scalar choices in unattended mode | Medium | Treat stale path refresh as a separate semantic finding; keep generic drift behavior unchanged and report-only in unattended mode. |
| Replacement discovery picks the wrong plugin when multiple cache entries exist | Low | Verify the resolved root contains the nmg-sdlc manifest, `skills/run-loop/SKILL.md`, and `scripts/sdlc-runner.mjs`; prefer the newest semver cache only after shape validation. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Tell users to regenerate `sdlc-config.json` with `$nmg-sdlc:init-config` | Avoids new upgrade/run-loop behavior. | Leaves checked-in configs stale and repeats the temporary-config workaround pattern the issue rejects. |
| Always rewrite `pluginRoot` to the newest cache version during upgrade | Simple deterministic update. | Breaks valid custom roots and local checkout workflows, violating AC3. |
| Remove `pluginRoot` from project configs and require `pluginsPath` only | Avoids versioned cache paths. | Regresses Codex plugin-cache layout support from issue #88 and violates AC4. |
| Auto-delete stale project configs | Forces regeneration. | Out of scope and destructive; users may have intentional model, effort, timeout, retry, and cleanup settings in the same file. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal - no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #124 | 2026-04-27 | Initial defect design |
