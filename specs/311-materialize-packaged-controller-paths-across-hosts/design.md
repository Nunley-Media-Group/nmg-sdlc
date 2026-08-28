# Root Cause Analysis: Materialize packaged controller paths across hosts

**Issue**: #311
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/266-fix-controller-path-rewriting-of-project-commands/

---

## Root Cause

#252 introduced `materializeControllerPaths` so installed commands resolve plugin controllers independently of consumer cwd. #266 narrowed that helper to explicit ownership: only `<plugin-root>/scripts/<name>.mjs` (shell and quoted-argv) is rewritten; unqualified `node scripts/*.mjs` stays project-local.

Packaged workflow sources later accumulated contributor-host absolute paths of the form `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/<name>.mjs`. `renderAutomatedCommandMarkdown` copies workflow bodies without materializing, so `commands/sdlc-execute.md`, `commands/sdlc-open-pr.md`, `commands/sdlc-verify-code.md`, and `commands/sdlc-status.md` stay byte-identical to those host-specific sources. On a different OS, Node receives the foreign literal path and fails with `MODULE_NOT_FOUND` before the controller starts.

`materializeControllerPathsWithPolicy` in `scripts/plugin-controller-path.mjs` only matches the two `<plugin-root>` regexes. A foreign absolute source path is not recognized, so it passes through even when `rewriteInteractiveInput` or `workerPrompt` later call `materializeControllerPaths`. The public-surface audit `ships no cwd-relative controller dispatch in public prompt surfaces` only rejects `node scripts/[A-Za-z0-9._-]+\.mjs`, so synchronized host-absolute controller paths are allowed.

**Version bump**: patch

### Affected Code

| File | Role |
|------|------|
| `scripts/plugin-controller-path.mjs` | `materializeControllerPathsWithPolicy` — canonical-token matcher only |
| `src/sdlc-commands.mjs` | `rewriteInteractiveInput` / `materializeRuntimeMessages` / `renderAutomatedCommandMarkdown` |
| `scripts/sdlc-execute.mjs` `workerPrompt` | Materializes worker text against `packageRoot` after `renderPrompt` |
| `workflows/**/*.md` and `commands/sdlc-*.md` | Packaged sources currently containing `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/` |
| `scripts/__tests__/extension-commands.test.mjs` | Cwd-relative audit; command/workflow byte-identity |
| `scripts/__tests__/plugin-controller-path.test.mjs` | Materialization unit coverage |
| `scripts/__tests__/start-issue-selection-contract.test.mjs` | Currently requires the contributor-host `start-issue.mjs` invocation |

### Triggering Conditions

- Packaged prompt text contains an absolute path whose normalized form ends in `/nmg-sdlc/scripts/<name>.mjs`.
- Runtime materialization does not treat that path as a plugin-owned controller.
- The current host cannot open the foreign filesystem location.

---

## Fix Strategy

### Approach

Keep one resolver (`resolvePluginController`) and one canonical stored token (`<plugin-root>/scripts/<name>.mjs`). Expand `materializeControllerPathsWithPolicy` so recognized foreign absolute plugin-controller paths rewrite to `JSON.stringify(controller)` on the active host, using the same `controllerPath` / `preserveUnresolved` policy as today. Restore host-neutral tokens in packaged `workflows/` and regenerated `commands/`. Extend the existing public-surface audit so host-absolute plugin-controller invocations fail the contract the same way cwd-relative dispatch already does.

Do not add a second resolver, env fallback, or cwd `scripts/` lookup.

### Recognition rule (locked)

A path identifies a packaged nmg-sdlc controller when all of these hold:

1. It is absolute POSIX (`/...`) or absolute Windows (`X:\...` or `X:/...`).
2. After replacing `\` with `/`, it matches `(?:^|/)nmg-sdlc/scripts/([A-Za-z0-9._-]+\.mjs)$`.
3. The captured basename is passed to existing `controllerPath` → `resolvePluginController`.

Do not match `node scripts/<name>.mjs`, `node ./scripts/<name>.mjs`, or any absolute path whose normalized form does not contain `/nmg-sdlc/scripts/`.

Replacement order stays quoted-first, then unquoted `node <path>`:

- Quoted (single, double, JSON argv): replace the entire quoted path with `JSON.stringify(controller)` when `controllerPath` returns a path; if `preserveUnresolved` and the controller is missing, leave the original match.
- Unquoted `node <absolute-or-placeholder>`: replace with `node ${JSON.stringify(controller)}` under the same policy.
- Keep the two existing `<plugin-root>` regexes; they remain the canonical stored form.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/plugin-controller-path.mjs` | Recognize foreign absolute `nmg-sdlc/scripts/<name>.mjs` paths in `materializeControllerPathsWithPolicy` | AC1, AC2, AC5 — already-shipped and in-flight prompts rewrite on the active host |
| `workflows/**/*.md` | Replace `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/` with `<plugin-root>/scripts/` (keep surrounding quotes when present) | AC3 — host-neutral sources. Read `skill://skill-creator` before editing these bundled files |
| `commands/sdlc-execute.md`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md` | Overwrite with `renderAutomatedCommandMarkdown(name, skill, description, packageRoot)` from `src/sdlc-commands.mjs` after workflow edits | AC3 — keep byte-identity with `AUTOMATED_COMMANDS` |
| `scripts/__tests__/plugin-controller-path.test.mjs` | Cover POSIX foreign, Windows-separator foreign, checkout-style `/nmg-sdlc/scripts/`, project-local relative, non-plugin absolute, and missing-controller fail-closed | AC1–AC5 |
| `scripts/__tests__/extension-commands.test.mjs` | Extend the public-surface audit to reject absolute `nmg-sdlc/scripts/<name>.mjs` controller invocations under `commands/` and `workflows/` | AC3 |
| `scripts/__tests__/start-issue-selection-contract.test.mjs` | Require `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/start-issue.mjs" --issue N` (or the unquoted canonical token) instead of the contributor-host path | AC3 |

Regenerate only the four `AUTOMATED_COMMANDS` files. Do not rewrite `specs/`, historical verification reports, or test inputs that intentionally supply a foreign packaged path to `materializeControllerPaths`.

If `WORKER_PROMPT_CEILINGS` / `AUTOMATED_BODY_CEILINGS` fail because bodies shrank, leave ceilings unchanged (they are maxima). If a ceiling fails because a body grew, set that one ceiling to measured UTF-8 bytes + 256 and leave the others untouched.

### Blast Radius

- **Direct impact**: materialization helper; packaged workflow/command text; two contract tests plus start-issue source assertion.
- **Indirect impact**: `rewriteInteractiveInput`, `materializeRuntimeMessages`, `workerPrompt` — they already call the helper; argument lists, handoffs, and Herdr flow stay unchanged.
- **Risk level**: Medium — every public prompt that currently embeds the contributor path will start resolving on the active host; project-local commands must stay untouched.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Project absolute path rewritten | Low | Require `/nmg-sdlc/scripts/<name>.mjs` after separator normalize |
| Missing controller silently ignored | Low | Strict `materializeControllerPaths` still throws `controller_unresolved`; `materializeAvailableControllerPaths` still preserves the original match |
| Command/workflow drift | Med | Keep byte-identity with `renderAutomatedCommandMarkdown` |
| Cwd-relative plugin dispatch returns | Low | Keep the existing `node scripts/*.mjs` ban and add the absolute-path ban beside it |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Only restore `<plugin-root>` in artifacts | Leaves already-materialized session text and previously packaged prompts broken on foreign hosts | AC1/AC2 require runtime recognition of foreign source paths |
| Rewrite every absolute `scripts/*.mjs` path | Would steal project-owned absolute script paths | Violates AC4 / FR3 |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #311 | 2026-08-28 | Initial defect report |
