# Implementation Evidence: Pre-publication subject validation

**Issue**: #372
**Date**: 2026-09-13
**Stage**: fix1
**Status**: Focused implementation checks passed; downstream verification pending

## Scope

This head implements T005's pre-publication subject gate and the first managed review corrections. It changes the existing publication helper, its behavioral regressions, the write-code workflow and rendered/source command-path contract tests, the approved design wording, README guidance, and this issue-owned evidence report. It does not change recovery allowances, controller checkpoints, handoff schemas, version files, or installed-plugin files.

The publication CLI preserves the required clean subjectless initial implement `bind` that establishes owner/path scope. Once implementation changes make the worktree dirty, `bind` requires a valid conventional `--subject` containing the requested literal issue identifier. A supplied invalid subject and every implement `reconcile` with a missing or invalid subject also fail closed. Dirty-subject validation occurs before controller lease acquisition, publication ownership state creation, staging, commit, or push.

## Observable proof

- A clean subjectless initial implement `bind` passes and establishes the expected owner.
- A dirty implement `bind` rejects an omitted subject.
- A dirty implement `bind` rejects a conventional subject with no issue identifier, the wrong identifier `#43`, or the non-boundary identifier `#420` when issue `#42` is requested.
- Every rejected case leaves the publication state absent, `HEAD` and upstream unchanged, and the Git index empty.
- The canonical conventional subject containing `#42` passes the dirty pre-publication bind and binds the expected owner.
- The source write-code workflow retains the plugin-root placeholder for both implement publication commands; separate materialization assertions prove both commands resolve against the runtime package root.

## Commands and results

From `scripts/`:

`npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs __tests__/extension-commands.test.mjs __tests__/rendered-prompt-contract.test.mjs`

Result: exit 0; 3 suites and 69 tests passed, with no failures or snapshots.

From the repository root:

`node scripts/skill-inventory-audit.mjs --check`

Result: exit 0; 43 inventory items mapped.

## Publication and downstream ownership

This report records only checks observed in the current fix1 worktree. It does not claim a commit, push, upstream equality, pull request, merge, issue closure, final registered verification, or hosted smoke run. Those remain obligations of their owning controller stages.
