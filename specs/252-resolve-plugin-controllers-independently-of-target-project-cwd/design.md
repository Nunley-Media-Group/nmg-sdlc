# Design: Resolve plugin controllers independently of target project cwd

**Issue**: #252
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/
---

## Overview

Two cooperating defects sit on the installed dispatch boundary. Command and worker markdown still spawn `node scripts/<name>.mjs`, which Node resolves against the consumer cwd. Executable controllers then decide CLI vs import by comparing unresolved `process.argv[1]` with `fileURLToPath(import.meta.url)`, so a Windows junction or Unix symlink suppresses `runCli()` and exits 0.

Add one new module, `scripts/plugin-controller-path.mjs` (no equivalent exists). It owns plugin-root resolution, quoted argv materialization, and realpath CLI detection. The extension publishes that root as `NMG_SDLC_PLUGIN_ROOT` when it loads. Committed workflow and file-command text uses the portable token `node <plugin-root>/scripts/<name>.mjs`. Runtime-injected bodies (interactive `/plan` rewrite and `workerPrompt`) replace that token with a JSON-quoted absolute path so sibling workers never depend on the model locating the plugin.

Do not `registerCommand` automated `/sdlc-*` names. Do not move orchestration out of the #194 controllers. Do not change Herdr pane, handoff, or exact-head contracts.

## Steering alignment

- `steering/product.md`: public `/sdlc-*` must work from a Herdr OMP consumer project; workers never ask.
- `steering/tech.md`: Node 20 ESM, `node:path`, argument arrays, OS-agnostic paths; unmatched issue (no `bug` label) bumps **minor**.
- `steering/structure.md`: commands stay in `commands/` + `src/`, workflows in `workflows/`, deterministic path logic in `scripts/`. Workflow-bundle edits read `skill://skill-creator` first.

## Architecture

```
Extension load
  packageRoot (src/sdlc-workflows.mjs)
  → process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot

File command / workflow source
  node <plugin-root>/scripts/<name>.mjs <argv>
  <plugin-root> := env NMG_SDLC_PLUGIN_ROOT (absolute dir that contains
                   package.json name "nmg-sdlc" and scripts/<name>.mjs)

Interactive rewrite / workerPrompt
  materializeControllerPaths(text, packageRoot)
  → node "<abs>/scripts/<name>.mjs" <argv>

Controller entry
  isCliEntry(import.meta.url)  // realpath both sides
  → runCli() exactly once, or stay inert on import
```

`packageRoot` in `src/sdlc-workflows.mjs` stays `join(dirname(fileURLToPath(import.meta.url)), "..")` and is reused as the env value. Do not add a second root algorithm.

## Canonical invocation contract

Source markdown (workflows, generated `commands/*.md`, write-spec/onboard/upgrade references that spawn controllers) uses exactly:

```text
node <plugin-root>/scripts/<name>.mjs
```

followed by the existing argv tokens (`run`, `list-specified`, `--issue N`, and so on).

Rules:

1. `<plugin-root>` is the value of `NMG_SDLC_PLUGIN_ROOT`. It must be an absolute existing directory whose `package.json` `"name"` is `"nmg-sdlc"` and that contains `scripts/<name>.mjs` as a regular file or a symlink/junction to that controller.
2. If the env var is missing, empty, not absolute, or fails those checks, the caller stops non-zero with a message that includes `controller unresolved` and the controller basename. Exit code `2`.
3. Never resolve `scripts/<name>.mjs` against `process.cwd()`. Never search parent directories of the target project. Never use `--plugin-dir` / `--add-dir` visibility as the production resolver.
4. Keep `process.cwd()` as the consumer project root for controller work (`runExecute` cwd, git/gh/herdr, spec reads).
5. Quote materialized absolute paths with `JSON.stringify` so spaces (for example `/Volumes/Fast Brick/...`) remain one argv element after shell splitting.

`renderAutomatedCommandMarkdown` must **not** bake a machine-local absolute path into committed `commands/*.md`. It keeps the portable `<plugin-root>` token. `extension-commands.test.mjs` continues to compare generated commands byte-for-byte against that portable form.

## New module

Create `scripts/plugin-controller-path.mjs` and export:

```js
export function isCliEntry(importMetaUrl, argv1 = process.argv[1], fsImpl = defaultFs)
export function resolvePluginRoot({ env = process.env, importMetaUrl } = {})
export function resolvePluginController(scriptName, options)
export function materializeControllerPaths(text, pluginRoot)
```

### `isCliEntry`

- Return `false` when `argv1` or `importMetaUrl` is missing.
- `realpathSync` both `argv1` and `fileURLToPath(importMetaUrl)`; compare `path.resolve` of those results.
- If `realpathSync` throws, fall back to `path.resolve(argv1) === path.resolve(fileURLToPath(importMetaUrl))` (copy install / already-canonical paths).
- Do not treat cwd-relative equality as sufficient when realpaths differ.

### `resolvePluginRoot`

Order, first match wins:

1. `env.NMG_SDLC_PLUGIN_ROOT` when it passes the directory/`name`/`scripts` checks above.
2. If `importMetaUrl` is provided, the package root derived from that module: if the file lives in `.../scripts/<file>` or `.../src/<file>`, use that parent of `scripts`/`src` when it passes the same checks.
3. Otherwise throw or return `{ ok: false, reasonCode: "controller_unresolved" }` — never `process.cwd()`.

`resolvePluginController(scriptName, options)` joins `scripts/${scriptName}` under that root and verifies the file exists. Basename must match `^[A-Za-z0-9._-]+\.mjs$`.

### `materializeControllerPaths`

Replace every `node <plugin-root>/scripts/<name>.mjs` and every leftover `node scripts/<name>.mjs` with `node ${JSON.stringify(join(pluginRoot, "scripts", name))}`. After this function, committed or injected workflow text must not contain the substring `node scripts/`.

## Extension and runtime injection

In `src/extension.ts` factory `nmgSdlc`, before registering commands, set:

```ts
process.env.NMG_SDLC_PLUGIN_ROOT = packageRoot;
```

Always assign `packageRoot` from `src/sdlc-workflows.mjs`. Do not leave a stale wrong value in place.

In `src/sdlc-commands.mjs` `rewriteInteractiveInput`, after `workflowBody(parsed.skill, root)`, run `materializeControllerPaths(body, root ?? packageRoot)` so `/plan` bodies contain quoted absolute controller paths.

In `scripts/sdlc-execute.mjs` `workerPrompt`, map each `workflowBody(...)` result through `materializeControllerPaths(..., packageRoot)` before joining. Sibling workers therefore receive absolute paths even if their environment lacks the env var.

Do not change `workflowBody()` itself. Applying materialization there would bake host paths into `renderAutomatedCommandMarkdown` output.

## Applicable invocation inventory

Replace cwd-relative `node scripts/<name>.mjs` in every public command and worker workflow spawn below. Read `skill://skill-creator` before editing any `workflows/**` or `references/*.md` path.

| Surface | Current spawn | Controller |
|---------|---------------|------------|
| `commands/sdlc-execute.md` / `workflows/execute/WORKFLOW.md` / `workflows/execute/references/selection.md` | `node scripts/sdlc-execute.mjs run` and `list-specified` | `sdlc-execute.mjs` |
| `commands/sdlc-status.md` / `workflows/status/WORKFLOW.md` | `node scripts/sdlc-status.mjs --project <root> [--json]` | `sdlc-status.mjs` |
| `workflows/start-issue/WORKFLOW.md` | `node scripts/start-issue.mjs --issue N` | `start-issue.mjs` |
| `workflows/apply-review/WORKFLOW.md` | `node scripts/sdlc-apply-review.mjs ...` | `sdlc-apply-review.mjs` |
| `workflows/review-main/WORKFLOW.md` | `node scripts/sdlc-review-main.mjs ...` | `sdlc-review-main.mjs` |
| `workflows/write-spec/WORKFLOW.md` and `workflows/write-spec/references/publish.md` | `publish-approved-spec.mjs` subcommands; `spec-created-label.mjs apply` | those two |
| `workflows/onboard-project/WORKFLOW.md` and `brownfield.md` | `node scripts/spec-created-label.mjs backfill` | `spec-created-label.mjs` |
| `workflows/upgrade-project/WORKFLOW.md` and `references/v3-detectors.md` | `node scripts/sdlc-upgrade.mjs detect\|apply` | `sdlc-upgrade.mjs` |
| `commands/sdlc-verify-code.md` / `workflows/verify-code/WORKFLOW.md` / `checklists/report-template.md` | `node scripts/exercise-omp.mjs ...` | `exercise-omp.mjs` |
| `workflows/verify-code/references/exercise-testing.md` | already has an absolute example; keep a `<plugin-root>` form consistent with this contract | `exercise-omp.mjs` |
| `references/pr-dependent-verification.md` | already `node <plugin-root>/scripts/verification-readiness.mjs` | keep |

Do not add controller spawns to `agents/*`. Leave `.github/workflows` plugin-repo CI on cwd-relative `node scripts/...` because that cwd is the plugin checkout.

Remove the status-only sentence "Locate this workflow's plugin root (two dirs above workflows/status/WORKFLOW.md)" once the `<plugin-root>` token is in the invoke line; that prose is model inference.

Update contract tests that currently require the old string, including `scripts/__tests__/start-issue-selection-contract.test.mjs` (`node <plugin-root>/scripts/start-issue.mjs --issue N`) and any usage-string assertions that document the public spawn (keep in-process CLI `Usage:` lines accurate; they may keep `node scripts/<name>.mjs` only as the already-running-CLI help shape, not as a dispatch path).

After the workflow bodies change, regenerate automated commands with `renderAutomatedCommandMarkdown`. Re-measure `AUTOMATED_BODY_CEILINGS` and `WORKER_PROMPT_CEILINGS` in `scripts/__tests__/rendered-prompt-bytes.test.mjs` for every ceiling that the new token or materialized worker prompt exceeds; set each changed ceiling to measured UTF-8 bytes + 256. Leave unchanged ceilings untouched.

## CLI guard cutover

Replace every applicable inline `process.argv[1]` / `import.meta.url` guard with `isCliEntry(import.meta.url)` in:

- `scripts/sdlc-execute.mjs`
- `scripts/sdlc-status.mjs`
- `scripts/start-issue.mjs`
- `scripts/sdlc-apply-review.mjs`
- `scripts/sdlc-review-main.mjs`
- `scripts/publish-approved-spec.mjs`
- `scripts/spec-created-label.mjs`
- `scripts/sdlc-upgrade.mjs`
- `scripts/verification-readiness.mjs`
- `scripts/exercise-omp.mjs`

Do not add a CLI to library-only modules (`issue-dependencies.mjs`, `deliverable-dependencies.mjs`, `epic-relationships.mjs`). Leave `exercise-github-umbrella-publication.mjs` unconditional `main()` alone (not a public/worker dispatch surface). Other repo-local CLIs used only from this checkout (`verify-plugin-surface.mjs`, `skill-inventory-audit.mjs`, umbrella helpers) are not required for AC3; optionally switch them to `isCliEntry` only if already touching the file, not as extra scope.

## Failure behavior

`reasonCode` for resolver failure is `controller_unresolved`. Public command/worker text that cannot materialize a controller prints that phrase and the basename, exits `2`, and performs no git, gh, Herdr, or product writes. Controllers themselves are not started, so they must not write handoffs on this path.

A linked CLI that previously exited 0 without running must now run exactly once.

## Testing strategy

| Layer | Location | Coverage |
|-------|----------|----------|
| Path helper | `scripts/__tests__/plugin-controller-path.test.mjs` (new) | env root accepted; cwd `scripts/` ignored; missing/invalid env fails; materialize quotes spaces; leftover `node scripts/` rewritten |
| CLI guard | same file plus spawn coverage per applicable controller | copy path runs CLI once; Unix symlink runs CLI once (skip on win32); Windows junction runs CLI once (skip on non-win32); `import()` does not run CLI |
| Surface audit | extend `scripts/__tests__/extension-commands.test.mjs` or a focused sibling | `commands/*.md` and `workflows/**/{WORKFLOW.md,references,checklists}` contain no dispatch `node scripts/<name>.mjs`; generated execute/status/verify-code stay byte-synced |
| Prompt bytes | `scripts/__tests__/rendered-prompt-bytes.test.mjs` | retighten only exceeded ceilings to measured + 256 |
| Isolation | existing execute/start/review/apply-review tests | no change to handoff schema, worker names, `--kind omp`, or main-pane mutation rules |
| Live proof | `specs/252-resolve-plugin-controllers-independently-of-target-project-cwd/verification-report.md` | installed plugin, disposable project, no `--plugin-dir`/`--add-dir`-only path |

Copied vs linked fixtures: create a disposable consumer directory with no `scripts/`, then (a) copy the plugin tree and (b) symlink or junction the plugin tree into an OMP plugin `node_modules/nmg-sdlc` layout. Spawn `process.execPath` with the installed controller path as argv[1] while `cwd` is the consumer. Assert exit of a harmless subcommand (`sdlc-execute.mjs spec-status --issue 1` or `sdlc-status.mjs --project <consumer> --json`) is not `MODULE_NOT_FOUND`, and that a probe of `process.cwd()` inside the controller remains the consumer.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #252 | 2026-08-24 | Initial feature spec |
