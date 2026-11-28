# Design: Rerun only what a gate has not proven: reuse passed results, scope surfaces on fallback paths, and carry smoke records forward

**Issue**: #643
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code

## Overview

Three changes shorten a gate rerun without dropping a check, and two shorten the contract suite. In the plugin, a rerun reuses the results that passed for the identical request, and a fallback path stops selecting surfaces the change cannot affect. In this repository, the smoke provider accepts a surface record across commits that no live command reads, the controller tests run in four Jest workers, and an empty CI job goes away.

## Architecture

### Result reuse (`src/sdlc-verification-runtime.mjs`, `scripts/sdlc-verify-steering.mjs`)

`runSteeringValidations` takes `reuse` (default true). For a pre-merge run of an issue it calls `priorPassedResults(root, key)` before any validation runs, which reads `.nmg-sdlc/verification/<N>.json` and keeps each entry that is applicable, `passed` in both `effectiveStatus` and `result.status`, and has a request and evidence. An unreadable or malformed artifact, or one with `runtimeError`, yields nothing.

In `execute`, after the rejection, unselected-surface, deferral and empty-selection branches and before a heavy-job slot is taken, an earlier entry is reused when all of these hold:

1. the provider is `builtin.command` or a project provider;
2. the validation is not an opted-in one of a `selected` run;
3. `result.identity` equals the new request's `identity` (head, tree state and dirty-diff hash, spec hash, steering hash, validation configuration hash);
4. `comparableRequest` of both requests is equal: the request without `changedPaths` (the artifact never stores them per result) and with `verification` reduced to `issue` and `specPath`, so the run id may differ. This covers `config`, the `command` arguments and `selection`.

The reused entry is `{ ...base, applicable: true, effectiveStatus: "passed", selection?, reused: { generatedAt }, request, result }`, with this run's `request` and the earlier `result`. Finalization requires one run id across required results and `result.identity` equal to `request.identity`; both hold. `generatedAt` is the earlier entry's own `reused.generatedAt` when it was itself reused, so it always names the run that executed the validation.

An opted-in validation of a `selected` run is excluded because the coverage and accounting checks of the same run read its tests; the selected tests are also the cheap case. Built-in artifact and external-evidence checks read files the identity does not hash, and cost nothing to repeat. A full-tier run is a deliberate whole-commit check and never reuses.

`sdlc-verify-steering.mjs` accepts `--fresh true|false` and passes `reuse: false` for `true`.

### Fallback-path surfaces (`src/sdlc-test-selection.mjs`, `src/sdlc-verification-runtime.mjs`)

`resolveChangeSelection` returned `all("fallback_path")` before asking Claude, with every declared surface. It now does that only when no surface names a validation. Otherwise it continues to the selection call (stored-selection reuse included) and builds the result from the answer:

| Answer | Selection |
|--------|-----------|
| `selected` | `mode: "all"`, `reason: "fallback_path"`, `tests: []`, `surfaces`: declared ids that are required or named by the answer. The answer's tests are not validated against files, because they are not used |
| `all` | every declared surface |
| failed call, or a prompt or diff that cannot be built | every declared surface, `detail` set, not stored |

`reason` stays `fallback_path` in every case, so consumers of the reason are unchanged. `reusable` accepts a stored `fallback_path` selection whose surfaces are still declared ids. The runtime takes `selection.surfaces` in every mode (it previously rebuilt the full list for `all`). Surface-bound validations whose surfaces are not selected pass as `surface_not_selected`, as in a `selected` run. No coverage or accounting check runs in `all` mode, so required surfaces are added by construction instead of checked.

### Smoke record carry-forward (`steering/extensions/nmg-sdlc-smoke.mjs`, `steering/manifest.json`, `steering/snippets/project-smoke.md`)

`readSurfaceRecord` returns `recordHead` with `record stale`. `checkInteractiveSurfaces` then asks `carriesForward(executeCommand, env, request, recordHead)` once per distinct head:

1. `git merge-base --is-ancestor <recordHead> <head>` must exit 0;
2. `git diff --name-only --no-renames -z <recordHead> <head>` must succeed, and each path must match an inert pattern (`scripts/__tests__/`, `specs/`, `docs/`, `hooks/*.test.ts`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `VERSION`) or be `package.json` or `.claude-plugin/plugin.json` whose zero-context diff changes only `"version"` lines.

When it holds, the record is read again with that head accepted and every other check unchanged (status, command, transcript, the published spec of `write-spec`). The evidence summary names the record head and the head it was carried to. The list is this project's: none of these paths is loaded by a live interactive command.

The manifest adds `hooks/register.ts` and `hooks/hooks.json` to the sources of the six interactive surfaces and `execute`, and `steering/extensions/**` to `execute`, so the narrower fallback surfaces above still require every surface the hooks module and the smoke provider serve.

### Suite shape (`scripts/__tests__/sdlc-execute*.test.mjs`, `scripts/__fixtures__/sdlc-execute-fixture.mjs`, `.github/workflows/nmg-sdlc-verify.yml`)

The top-level helpers of `sdlc-execute.test.mjs` move unchanged to the fixture module, which registers the shared `afterEach` cleanup when a test file imports it. The describe blocks move unchanged to four files: `sdlc-execute.test.mjs` (branch-first execute), `-dispatch`, `-supervision` and `-queue`. The fixture module lives outside `__tests__` because Jest collects every `.mjs` file there. The `checkpoint-portability` job is deleted.

## Alternatives Considered

| Option | Why not |
|--------|---------|
| Reuse a passed result whenever the validation's own inputs are unchanged across heads | The runtime cannot know a command's inputs; identity equality is the only tree-wide proof it has |
| Keep every surface on a fallback path | Six live sessions and a delivery for a `.gitignore` change prove nothing about it |
| Derive fallback surfaces from sources alone, without the call | A shared-source change in the same branch would lose the surfaces Claude selects for it today |
| Accept any earlier smoke record whose surface sources are unchanged | Shared modules under `src/` are not surface sources; only the inert list is safe without the selection call |
| Pass a review with minor findings | It leaves a repair unverified; out of scope |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #643 | 2026-11-27 | Initial design |
