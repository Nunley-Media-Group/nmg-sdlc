# Implementation Evidence: Publication subjects and integrated branch refresh

**Issue**: #372
**Date**: 2026-09-13
**Stage**: fix1
**Status**: Focused implementation checks passed; downstream verification pending

## Scope

This head implements T005's pre-publication subject gate, T006's integrated-branch refresh, and the first managed review corrections. It changes the existing publication helper, start-issue controller, behavioral regressions, write-code workflow and rendered/source command-path contract tests, approved design wording, README guidance, and this issue-owned evidence report. It does not change recovery allowances, controller checkpoints, handoff schemas, version files, or installed-plugin files.

The publication CLI preserves the required clean subjectless initial implement `bind` that establishes owner/path scope. Once implementation changes make the worktree dirty, `bind` requires a trimmed, single-line conventional `--subject` containing the requested literal issue identifier. A supplied invalid subject and every implement `reconcile` with a missing or invalid subject also fail closed. Dirty-subject validation occurs before controller lease acquisition, publication ownership state creation, staging, commit, or push.

The start-issue controller now fetches the current default branch and applies the guarded integrated-branch fast-forward after every successful reuse path: a remote-only canonical branch, an existing local branch, or the already checked-out canonical branch. It fails closed when the default branch is unreadable, preserves divergent branches, and never pushes, forces, or resets the canonical remote issue branch.

## Observable proof

- A clean subjectless initial implement `bind` passes and establishes the expected owner.
- A dirty implement `bind` rejects an omitted subject.
- A dirty implement `bind` rejects a conventional subject with no issue identifier, the wrong identifier `#43`, the non-boundary identifier `#420`, leading or trailing whitespace, CR/LF content, or a non-conventional prefix when issue `#42` is requested.
- Every rejected case leaves the publication state absent, `HEAD` and upstream unchanged, and the Git index empty.
- The canonical conventional subject containing `#42` passes the dirty pre-publication bind and binds the expected owner.
- A real bare-remote regression proves remote-only, existing-local, and already-current integrated branch reuse all fast-forward the local issue branch to the exact default head.
- The same regression reads the bare remote's `refs/heads/42-ship-it` and proves it remains at the original spec head; the observed command stream contains no push, force, or reset.
- Failed and empty successful default-branch lookups both stop reused-branch preparation with `default_branch_unreadable`.
- The source write-code workflow retains the plugin-root placeholder for both implement publication commands; separate materialization assertions prove both commands resolve against the runtime package root.
## Commands and results

From `scripts/`:

`npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs __tests__/start-issue-controller.test.mjs`

Result: exit 0; 2 suites and 88 tests passed, with no failures or snapshots.

From the repository root:

`node scripts/skill-inventory-audit.mjs --check`

Result: exit 0; 43 inventory items mapped.

## Publication and downstream ownership

This report records only checks observed in the current fix1 worktree. It does not claim a commit, push, upstream equality, pull request, merge, issue closure, final registered verification, or hosted smoke run. Those remain obligations of their owning controller stages.
