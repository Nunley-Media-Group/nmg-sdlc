# Root Cause Analysis: Fix spec publication failing dirty_tree on the plugin's own .nmg-sdlc runtime files

**Issue**: #475
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Root Cause

`ensureOnBranch` in `scripts/publish-approved-spec.mjs` fails with `dirty_tree` whenever `git status --porcelain` is non-empty. Since v4.0.0 the hooks module renders interactive workflows through `sdlc-render-prompt.mjs`, which calls `writePromptProvenance` and writes `.nmg-sdlc/prompt-provenance/<consumer>.json` into the project. In a project that does not ignore `.nmg-sdlc/`, the publisher therefore counts the plugin's own runtime files as untracked work. The other tree-cleanliness checks (`sdlc-execute.mjs`, `sdlc-deliver.mjs`, `sdlc-finalize-verification.mjs`) already leave out `.nmg-sdlc/` paths.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/publish-approved-spec.mjs` | `porcelain` / `ensureOnBranch` | Treats runtime state as a dirty tree |

## Fix Strategy

Have `porcelain()` drop every line whose path (`line.slice(3)`) starts with `.nmg-sdlc/`. `commit-push` already stages only the spec directory, so runtime files are never committed.
