# Design: Speed up the pre-merge gate: parallel contract suite and no full run for the version step

**Issue**: #642
**Date**: 2026-11-27
**Status**: Approved
**Author**: Claude Code

## Overview

Two kinds of change. In the plugin, the pre-merge gate stops treating delivery's version step as a reason to run everything. In this repository, the contract suite runs in parallel, its tests stop waiting on real time and on the macOS git shim, and steering moves the first whole-suite run from the gate to the implementer.

## Architecture

### Version-step exemption (`src/sdlc-test-selection.mjs`, `src/sdlc-verification-runtime.mjs`)

`versionOnlyChanges(projectRoot, baseRef, candidates)` returns the candidates whose whole change is the version step:

1. Read `VERSION` at `git merge-base <base> HEAD` and at `HEAD`. Both must be semantic versions and differ; otherwise nothing is exempt.
2. For each candidate, `git status --porcelain` for that literal path must be empty, so an uncommitted or untracked edit is never exempt.
3. Read the zero-context diff of the file between the merge base and `HEAD`. `versionOnlyDiff` requires at least one hunk, and in every hunk as many removed as added lines, pairwise differing only in one token (characters `[0-9A-Za-z.+-]`) that is the old version on the removed side and the new version on the added side. A token may be the version followed by `+` build metadata.

`runSteeringValidations` calls it with the changed paths that match `fallbackPathsOf(runtime)` and passes the remaining paths to `resolveChangeSelection`, to the docs-only check and to `unaccountedPaths`. `changedPaths` in the artifact and `changed_paths` conditions keep every path. The artifact's `selection` gains `versionOnlyPaths` only when the list is not empty, so existing records keep their shape.

The rule reads only `VERSION` and line diffs, so it is the same for `package.json`, `pyproject.toml`, `pubspec.yaml` and lockfiles. A dependency bump is not exempt: its tokens are not the project's old and new versions.

### Parallel contract suite (`steering/manifest.json`, `steering/test-coverage.json`, `scripts/jest.config.mjs`)

- The two test validations run `npm test --` (the gate appends selected test ids after `--`) and are `heavy: true`, so gates and implementer runs on one machine queue in the heavy-job pool.
- Jest configuration moves from `scripts/package.json` to `scripts/jest.config.mjs`. It names `scripts/jest-global-setup.mjs` by absolute path, because `jest-per-test-coverage.mjs` overrides `rootDir`.
- The global setup runs once before workers start. On macOS, when the first `git` on `PATH` is `/usr/bin/git`, it prepends the directory of `xcrun -f git` to `PATH`. Workers and every helper a test starts inherit it.

### Publish poll interval (`scripts/publish-approved-spec.mjs`)

`READINESS_POLL_MS` is `NMG_SDLC_PUBLICATION_POLL_MS` when it matches `^[1-9]\d*$`, else 5000. `awaitPublicationReady` waits that long. The test fixture sets 20.

### Steering (`steering/snippets/project-tech.md`, `steering/snippets/project-smoke.md`)

A "Checks Before the Implement Handoff" subsection under Testing Standards, and a paragraph in smoke step 8 for an auto-mode block of a command the approved plan names.

## Alternatives Considered

| Option | Why not |
|--------|---------|
| Tell projects to move version mirrors from `fallbackPaths` to `docPaths` | A dependency change to the same file would then rely on the selection call answering `all`; the diff rule keeps the deterministic fallback |
| Derive the version pair from the changed line alone | A dependency bump is also a one-token semantic-version change |
| Keep `--runInBand` and only fix git and the poll | Leaves the suite three times slower than its longest file |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #642 | 2026-11-27 | Initial design |
