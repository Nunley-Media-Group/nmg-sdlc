# Implementation Evidence: Pre-publication subject validation

**Issue**: #372
**Date**: 2026-09-13
**Stage**: fix1
**Status**: Focused implementation checks passed; downstream verification pending

## Scope

This head implements T005's pre-publication subject gate and the first managed review corrections. It changes the existing publication helper, its behavioral regression suite, the write-code command-path contract test, README guidance already present on this head, and this issue-owned evidence report. It does not change recovery allowances, controller checkpoints, handoffs, version files, or installed-plugin files.

The publication CLI now requires a valid conventional `--subject` containing the requested literal issue identifier for every implement `bind` or `reconcile` invocation. Validation occurs before controller lease acquisition, publication-scope inspection, state creation, staging, commit, or push.

## Observable proof

- Implement `bind` rejects an omitted subject.
- Implement `bind` rejects a conventional subject with no issue identifier, the wrong identifier `#43`, or the non-boundary identifier `#420` when issue `#42` is requested.
- Every rejected case leaves the publication state absent, `HEAD` and upstream unchanged, and the Git index empty.
- The canonical conventional subject containing `#42` passes and binds the expected owner.
- The source write-code workflow retains the plugin-root placeholder for both implement publication commands; separate materialization assertions prove both commands resolve against the runtime package root.

## Commands and results

From `scripts/`:

`npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs __tests__/extension-commands.test.mjs`

Result: exit 0; 2 suites and 64 tests passed, with no failures or snapshots.

## Publication and downstream ownership

This report records only checks observed in the current fix1 worktree. It does not claim a commit, push, upstream equality, pull request, merge, issue closure, final registered verification, or hosted smoke run. Those remain obligations of their owning controller stages.
