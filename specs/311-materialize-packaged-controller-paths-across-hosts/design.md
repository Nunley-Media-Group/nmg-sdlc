# Design: Materialize packaged controller paths across hosts

**Issue**: #311
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/266-fix-controller-path-rewriting-of-project-commands/
---

## Overview

Keep the resolver and its two public materialization APIs. Extend the shared private materialization policy in `scripts/plugin-controller-path.mjs` so explicit controller operands can be recognized in three forms: canonical `<plugin-root>/scripts/<name>.mjs`, a foreign POSIX absolute path whose final segments are `nmg-sdlc/scripts/<name>.mjs`, or a foreign Windows/UNC absolute path with the same final segments. Add `posix` and `win32` to the existing named `node:path` import for foreign-syntax detection; retain the current host `isAbsolute` import for active package-root validation.

Every recognized operand is reduced to its controller basename and passed through the existing `resolvePluginController(scriptName, { env: { NMG_SDLC_PLUGIN_ROOT: pluginRoot } })`. The emitted operand remains `JSON.stringify` of the controller under the active package root. This preserves spaces and current-host separators, validates that the shipped controller exists, and keeps `controller_unresolved` behavior in one place.

Canonicalize the active workflow sources and regenerate their automated `commands/*.md` artifacts. Do not alter historical specs, verification evidence, repository-local CLI examples, or project-owned paths. The strict and best-effort policies keep their #269 distinction: strict materialization throws for a recognized missing controller; arbitrary extension context preserves an unresolved owned reference.

## Steering Alignment

- Product steering requires installed `/sdlc-*` commands and Herdr workers to work from consumer projects while preserving worker isolation and exact-head delivery.
- Technical steering requires Node 20 ESM, `node:path` for cross-platform paths, exact controller ownership, and fail-closed errors.
- Structure steering keeps deterministic path logic in `scripts/`, workflow sources in `workflows/`, and generated automated commands in `commands/`. Resolve and read `skill://skill-creator` before editing any workflow bundle.

## Architecture

```text
Active workflow source / generated file command
  node <plugin-root>/scripts/<name>.mjs <existing argv>
                |
                v
Strict interactive or worker materialization
  materializeControllerPaths(text, activePackageRoot)

Best-effort extension-context materialization
  materializeAvailableControllerPaths(text, activePackageRoot)
                |
                v
Recognize controller operand
  canonical token
  OR POSIX absolute .../nmg-sdlc/scripts/<name>.mjs
  OR Windows/UNC absolute ...\nmg-sdlc\scripts\<name>.mjs
                |
                v
resolvePluginController(<name>, activePackageRoot)
  -> JSON-quoted active-root path using current-host separators

Anything else
  -> preserve byte-for-byte
```

## Materialization Contract

### Public Interfaces

Keep these signatures and every existing caller unchanged:

```js
export function materializeControllerPaths(text, pluginRoot)
export function materializeAvailableControllerPaths(text, pluginRoot)
```

Both continue to delegate to `materializeControllerPathsWithPolicy(text, pluginRoot, preserveUnresolved)`. The change is confined to operand recognition and replacement inside that shared policy.

### Recognized Controller Operands

Recognize the following existing lexical forms without consuming the `node` token, trailing arguments, surrounding array punctuation, or adjacent text:

```text
node <plugin-root>/scripts/<name>.mjs
node "<plugin-root>/scripts/<name>.mjs"
["node","<plugin-root>/scripts/<name>.mjs",...]
node "/Users/author/.../nmg-sdlc/scripts/<name>.mjs"
node "C:\Users\author\...\nmg-sdlc\scripts\<name>.mjs"
node /opt/author/.../nmg-sdlc/scripts/<name>.mjs
```

Add one private helper; no equivalent exists:

```js
function controllerNameFromOperand(operand)
```

It returns the safe controller basename for an exact canonical token or recognized owned absolute path, otherwise `null`. In `materializeControllerPathsWithPolicy`, run the current quoted-operand pass first (matching a complete single- or double-quoted candidate, which covers shell and array forms), then an unquoted pass limited to the word immediately after `node`. Each pass calls `controllerNameFromOperand`; a `null` result returns the original match unchanged. A basename result follows the existing `controllerPath` strict/best-effort callback and replaces only the operand. Do not add a global absolute-path replacement.

For an absolute-path operand:

1. Treat it as absolute when `path.posix.isAbsolute` or `path.win32.isAbsolute` accepts it, so recognition does not depend on `process.platform`.
2. Build a temporary ownership view with `operand.split(/[\\/]+/).filter(Boolean)`, so single, doubled Markdown-escaped, and mixed separators are recognized without changing source bytes. The final three segments must be exactly `nmg-sdlc`, `scripts`, and a basename matching the existing `SCRIPT_NAME_PATTERN` (`^[A-Za-z0-9._-]+\.mjs$`).
3. Resolve only that basename through `resolvePluginController`; never reuse, join from, or probe the foreign prefix.
4. Replace only the operand with `JSON.stringify` of the active package controller. Preserve all argv bytes outside that operand.

Do not recognize unqualified `node scripts/<name>.mjs`, an absolute `.../scripts/<name>.mjs` without the `nmg-sdlc` ownership segment, or a path-shaped string outside the supported shell/quoted-argv controller operand forms. Those remain byte-for-byte unchanged.

### Failure Policy

- `materializeControllerPaths` stays strict. A canonical or recognized foreign owned reference whose basename is absent from the active package throws the existing error with `reasonCode: "controller_unresolved"` and `exitCode: 2`.
- `materializeAvailableControllerPaths` keeps `preserveUnresolved: true`; an owned reference that cannot resolve remains unchanged in arbitrary extension context.
- Neither policy consults `process.cwd()`, a consumer `scripts/` directory, or the foreign path prefix.
- Invalid text, arbitrary absolute paths, and project-local relative commands are not errors and are not changed.

## Canonical Packaged Surfaces

After resolving and reading `skill://skill-creator`, replace every contributor-host nmg-sdlc controller prefix with `<plugin-root>` while preserving controller basename, quoting style, arguments, examples, and surrounding workflow text in this complete active-workflow inventory:

| Workflow source | Canonical controllers |
|-----------------|-----------------------|
| `workflows/apply-review/WORKFLOW.md` | `sdlc-apply-review.mjs` |
| `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md` | `sdlc-execute.mjs` |
| `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/brownfield.md` | `sdlc-steering.mjs`, `omp-sdlc-ignore.mjs`, `spec-created-label.mjs` |
| `workflows/open-pr/WORKFLOW.md` | `sdlc-deliver.mjs`, `verification-readiness.mjs` |
| `workflows/review-main/WORKFLOW.md` | `sdlc-review-main.mjs` |
| `workflows/start-issue/WORKFLOW.md` | `start-issue.mjs` |
| `workflows/status/WORKFLOW.md` | `sdlc-status.mjs` |
| `workflows/steering/WORKFLOW.md` | `sdlc-steering.mjs` |
| `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md` | `sdlc-upgrade.mjs` |
| `workflows/verify-code/WORKFLOW.md`, `workflows/verify-code/checklists/report-template.md`, `workflows/verify-code/references/exercise-testing.md` | `sdlc-verify-steering.mjs`, `verification-readiness.mjs`, `exercise-omp.mjs`, `sdlc-finalize-verification.mjs` |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md` | `publish-approved-spec.mjs`, `spec-created-label.mjs` |
| `references/pr-dependent-verification.md` | `verification-readiness.mjs` |

Regenerate, rather than hand-diverge, all four synchronized automated artifacts through `renderAutomatedCommandMarkdown`:

- `commands/sdlc-execute.md`
- `commands/sdlc-open-pr.md`
- `commands/sdlc-status.md`
- `commands/sdlc-verify-code.md`

## Contract Audit

Extend `scripts/__tests__/extension-commands.test.mjs` with two bounded active-surface audits:

1. Keep the existing recursive `commands/` and `workflows/` check that rejects cwd-relative `node scripts/<name>.mjs`.
2. Scan `commands/`, `workflows/`, and active shared `references/` Markdown for a POSIX absolute operand ending in `/nmg-sdlc/scripts/<name>.mjs` or a Windows/UNC absolute operand ending in `\nmg-sdlc\scripts\<name>.mjs`, including backslashes represented inside quoted command text.

Keep the existing byte-for-byte comparison between every generated command and `renderAutomatedCommandMarkdown`. Do not scan `specs/`, verification reports, root session plans, or generic project-owned absolute paths; those are evidence/data rather than active packaged dispatch.

## Testing Strategy

| Layer | Location | Coverage |
|-------|----------|----------|
| Shared helper | `scripts/__tests__/plugin-controller-path.test.mjs` | On every host, materialize canonical, foreign POSIX, and foreign Windows operands to a disposable active package root; preserve quotes/argv boundaries and trailing arguments. |
| Ownership boundary | `scripts/__tests__/plugin-controller-path.test.mjs` | Preserve `node scripts/check-gate.mjs`, POSIX project-owned absolute scripts, and Windows project-owned absolute scripts byte-for-byte. |
| Failure boundary | `scripts/__tests__/plugin-controller-path.test.mjs` | A recognized foreign owned path for an unshipped basename throws `controller_unresolved`; no consumer cwd fallback is read. |
| Extension context | `scripts/__tests__/extension-commands.test.mjs` | `materializeRuntimeMessages` rewrites a foreign controller path that exists, preserves project commands, and preserves an unresolved owned example under the best-effort policy. |
| Worker prompts | `scripts/__tests__/sdlc-execute.test.mjs` | `workerPrompt` materializes execute/start/review/verify/deliver fragments to the active root with no foreign path while preserving worker names, handoff validation, and argv. |
| Packaged surfaces | `scripts/__tests__/extension-commands.test.mjs` | Active workflow/command markdown is host-neutral and generated artifacts remain byte-synchronized. |
| Installed topology | disposable packaged OMP exercise on Windows | A packaged execute prompt authored with a POSIX controller path resolves to the installed Windows package and reaches controller startup without `MODULE_NOT_FOUND`. |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #311 | 2026-08-28 | Initial feature spec |

## Validation Checklist

- [x] Existing public signatures and callsites are preserved.
- [x] Foreign-path ownership and project-path preservation are exact.
- [x] Strict and best-effort error policies remain distinct.
- [x] Active workflow sources and generated command artifacts are both covered.
- [x] Cross-host, missing-controller, and project-command regressions have observable tests.
