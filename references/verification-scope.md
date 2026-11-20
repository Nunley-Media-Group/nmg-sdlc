# Verification Scope Configuration

Read this when `/sdlc-onboard-project` or `/sdlc-upgrade-project` reports a `verification-scope` item. It configures scoped pre-merge verification: one headless Claude selection per gate run, checked by changed-line coverage and a surface map. See `steering-schema.md` for the keys.

## Detect

```bash
node "<plugin-root>/scripts/verification-scope.mjs" detect --root .
```

It prints `{ ok: true, item }`. A `null` item means the configuration is complete: propose nothing. Otherwise the item is digest-bound (`verification-scope:<sha256>`) and lists `findings`:

| Finding | Condition |
|---------|-----------|
| `selection_missing` | No top-level `selection` in `steering/manifest.json` |
| `doc_paths_missing` | `selection` declares no `docPaths`, so no change can be docs-only |
| `selection_command_legacy` | A validation's `selection` is a `{ program, args }` command (named in `legacySelections`); the steering runtime now rejects it |
| `test_coverage_missing` / `test_coverage_invalid` | A `builtin.command` validation exists and `steering/test-coverage.json` is absent or invalid |
| `surfaces_missing` | No `surfaces` map |
| `unaccounted_paths` | Tracked files (listed in `unaccountedPaths`) that no `selection.coveragePaths`, surface `sources`, `docPaths` or `fallbackPaths` glob matches |

`pluginProject` is true when `.claude-plugin/plugin.json` exists.

## Derive the proposal

Derive the proposal from the project's structure, read-only, and show it in full in the plan. It is a JSON object `{ selection, surfaces, optIn, testCoverage? }`:

- `selection`: `{ docPaths, fallbackPaths, coveragePaths }`.
  - `docPaths`: documentation and release text a test cannot exercise, such as `README.md`, `CHANGELOG.md`, `docs/**` and `specs/**`.
  - `fallbackPaths`: files whose reach no diff shows, such as dependency manifests and lockfiles, build and test-runner configuration, CI-invisible tooling, and `steering/manifest.json`. A change to one runs everything.
  - `coveragePaths`: source and test globs that the coverage command reports on.
- `surfaces`: one entry per independently exercisable part of the product, `{ id, sources, validations? }`. Bind a surface to the validations that exercise it live (for example a smoke or end-to-end provider). Validations not bound to any surface keep running for every change.
  - For a Claude Code plugin (`pluginProject: true`): one surface per command, per agent and per hooks module, with the sources of the workflow, agent file, scripts and references each one uses.
  - Otherwise: one surface per feature or user-facing area, per entry point (CLI, server, worker, job) and per non-code asset group (templates, migrations, static assets, infrastructure).
  - Together with `coveragePaths`, `docPaths` and `fallbackPaths`, the surfaces must account for every path in `unaccountedPaths`.
- `optIn`: the `change`-tier `builtin.command` test validations to set `selection: true` on. A legacy command `selection` is converted to `true`, and a missing `tier` becomes `change`.
- `testCoverage`: when the coverage config is missing or invalid, `{ version: 1, suite, coverage }` with stack-appropriate argument-array commands. `coverage` takes test identifiers as trailing arguments and prints the per-test report `{ version: 1, tests: [{ id, file, lines, branches, outcomes }], executableLines? }`, with repository-relative `path:N` lines. Prefer the test runner's native per-test or per-file coverage, for example Jest or Vitest with V8 coverage, `coverage.py` contexts with pytest, `go test -coverprofile` per package, or `cargo llvm-cov`. When no runner offers per-test data, write a small wrapper that runs each test file with coverage and merges the results.

## Plan and apply

The plan shows the full proposal JSON and the exact argv. After approval, write the proposal to `.nmg-sdlc/plans/verification-scope.json`, then run:

```bash
node "<plugin-root>/scripts/verification-scope.mjs" apply --root . --approve verification-scope:<sha256> --proposal .nmg-sdlc/plans/verification-scope.json
```

Inside a full upgrade apply, pass the same file to `scripts/sdlc-upgrade.mjs apply` with `--scope-proposal .nmg-sdlc/plans/verification-scope.json`.

Apply fails with `verification_scope_plan_stale`, before any write, when the manifest, the coverage config or the tracked files changed after detection; detect again and re-plan. It validates the result with the steering runtime and restores the original files on failure. A repeat `detect` after a successful apply returns no item.
