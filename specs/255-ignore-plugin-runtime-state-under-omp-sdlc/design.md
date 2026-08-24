# Root Cause Analysis: Ignore plugin runtime state under .omp/sdlc

**Issue**: #255
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/
---

## Root Cause

`/sdlc-execute` persists `run.json` and handoffs under `.omp/sdlc/` (`RUN_DIR` in `scripts/sdlc-execute.mjs`). `startIssue` writes `.omp/sdlc/handoffs/<N>-start.json` on every outcome, including failure. This plugin repository lists `.omp/sdlc/` in its own `.gitignore`, so those files never appear in porcelain here.

Host onboarding (`workflows/onboard-project/WORKFLOW.md`) installs CONTRIBUTING, AGENTS, and `.github` managed assets and never mutates `.gitignore`. Host upgrade (`scripts/sdlc-upgrade.mjs`) only *removes* v2 runner ignore blocks via `editGitignoreForV2`; it never adds `.omp/sdlc/`.

`startIssue` then runs unfiltered `git status --porcelain` and, when the current branch is not `${N}-${slug}` and stdout is non-empty, fails `dirty_tree` before `gh issue develop`. `dirtyTreeBlocks` and `restoreActiveIssueBranch` in `scripts/sdlc-execute.mjs` use the same unfiltered porcelain. A host whose only dirt is `?? .omp/` from plugin runtime therefore cannot start an issue branch.

The correct fix is to make git ignore the runtime on hosts, then untrack already-indexed copies so the ignore takes effect. Filtering porcelain without a host ignore rule would hide the same files from `git add` while leaving them committable — that is out of scope.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `.gitignore` | `.omp/sdlc/` | Plugin-repo-only ignore; not installed onto hosts |
| `workflows/onboard-project/WORKFLOW.md` | managed-asset install | Never writes host `.gitignore` |
| `scripts/sdlc-upgrade.mjs` | `detectUpgrade`, `editGitignoreForV2`, `applyV2Cleanup`, `applyUpgrade` | Delete-only gitignore mutation |
| `scripts/start-issue.mjs` | `startIssue` dirty gate before `gh issue develop` | Unfiltered porcelain → `dirty_tree` |
| `scripts/sdlc-execute.mjs` | `dirtyTreeBlocks`, `restoreActiveIssueBranch`, `runExecute` entry | Unfiltered porcelain; writes `.omp/sdlc/` |
| `scripts/sdlc-apply-review.mjs` | `porcelainPaths` | Existing `.omp/` staging skip; do not reuse as the dirty-tree fix |
| `references/dirty-tree.md` | Check | Unfiltered porcelain contract; leave unchanged |
| `scripts/__tests__/start-issue-controller.test.mjs` | `writes dirty_tree when another branch has changes` | Pins non-runtime dirt |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | detect/apply | No omp-sdlc-ignore item today |

### Triggering Conditions

- Host `.gitignore` has no `.omp/sdlc/` or `.omp/sdlc` rule.
- Working tree is otherwise clean and not already on the issue branch.
- Start or execute writes or observes `.omp/sdlc/**` so porcelain is non-empty (`?? .omp/` or tracked runtime).

These were not caught because this repository already ignores `.omp/sdlc/`, so dogfood porcelain stays empty.

---

## Fix Strategy

### Approach

Add one new module `scripts/omp-sdlc-ignore.mjs` (no equivalent exists) that owns the ignore predicate, file write, `git rm --cached` untrack, and exact staged-transition predicate. Onboard and upgrade call the write path. Start and execute call untrack only after the ignore rule exists, then keep unfiltered dirty-tree inspection while authorizing only the exact staged deletions produced by that successful untrack call.

Presence: a non-comment line whose trimmed text is `.omp/sdlc/` or `.omp/sdlc`. Written line is always `.omp/sdlc/`. Negated `!` lines do not count. Broader patterns do not count; append `.omp/sdlc/` anyway.

Untrack command is exactly `git rm --cached -r -- .omp/sdlc` after a non-empty `git ls-files -z -- .omp/sdlc`. The helper retains the exact NUL-delimited paths listed before removal. The subsequent unfiltered porcelain check may proceed only when every dirty record is an index-only deletion for one of those exact paths and every listed path has exactly one such record. Any additional, missing, unstaged, renamed, untracked, or differently staged record remains `dirty_tree`. Never delete working-tree files. Untrack failure is `runtime_untrack_failed` and must not create or switch branches.

Do not change `references/dirty-tree.md`, `publish-approved-spec.mjs`, or `porcelainPaths` in apply-review. Do not add a pathspec exclusion to `git status`; the authorization is bound to the successful controlled operation and its exact path set.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/omp-sdlc-ignore.mjs` | New helper + `ensure` CLI + exact staged-transition predicate | Single ignore/untrack implementation and narrow authorization |
| `workflows/onboard-project/WORKFLOW.md` | Greenfield/brownfield plan execution runs `ensure --root` | FR1 |
| `scripts/sdlc-upgrade.mjs` | Detect/apply `omp-sdlc-ignore` after v2 cleanup | FR2 |
| `workflows/upgrade-project/WORKFLOW.md` | Detector step 10 | FR2 surface |
| `workflows/upgrade-project/references/detection.md` | Detector 9: missing `.omp/sdlc/` ignore | Keep detector list complete |
| `workflows/upgrade-project/references/upgrade-procedures.md` | Category row `omp-sdlc-ignore` | Apply table |
| `scripts/start-issue.mjs` | `readFileSync` on `fs`; untrack before dirty check; pass exact authorization into the gate | FR3 |
| `scripts/sdlc-execute.mjs` | Untrack once before `dirtyTreeBlocks`; pass exact authorization into the gate | FR3 |
| `scripts/__tests__/omp-sdlc-ignore.test.mjs` | Predicate, write, untrack, CLI, exact staged-transition authorization | AC1/AC2 unit |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | Detect/apply/idempotent ignore item | FR2 |
| `scripts/__tests__/start-issue-controller.test.mjs` | Exact runtime transition vs remaining `dirty_tree` | AC2/AC3 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Exact runtime transition vs remaining dirty preflight | AC1/AC3 |

### Blast Radius

- **Direct impact**: host `.gitignore` on onboard/upgrade apply; start/execute git index for `.omp/sdlc` only when the ignore rule exists; one exact post-untrack staged-deletion authorization.
- **Indirect impact**: spec 249 `dirtyTreeBlocks` / `restoreActiveIssueBranch` stay unfiltered; only the initial gate receiving a successful untrack result can authorize its exact deletion set. Spec 66 onboard managed-asset list and spec 21 / 151 v2 gitignore removal remain unchanged.
- **Risk level**: Low. Untrack is `--cached` only and gated on the ignore rule. Authorization is operation-bound and exact-set; other dirty paths still fail `dirty_tree`.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Unignored runtime treated as clean | Low | Untrack and authorization require the exact host ignore rule; porcelain stays unfiltered |
| `git rm` deletes working-tree runtime | Low | Require `--cached`; tests assert no unlink of working-tree files |
| Pre-existing or unrelated dirt is hidden | Low | Require an exact set match between pre-untrack `ls-files` paths and index-only deletion porcelain records; reject every other record |
| v2 cleanup removes the new ignore line | Low | Apply `omp-sdlc-ignore` after `v2-cleanup`; v2 editor only touches recognized v2 headers/entries |
| Entire `.omp/` ignored | Low | Written line is `.omp/sdlc/` only |
| Existing dirty_tree tests break on new `git ls-files` | Low | Untrack skipped when ignore absent; current fixtures have no `.gitignore` |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Broadly filter `.omp/sdlc` out of porcelain | Soft-clean without operation binding | Rejected: would hide unauthorized runtime dirt; the selected exact-set predicate authorizes only deletions produced by the successful controlled untrack |
| Ignore all of `.omp/` | Broader exclude | Issue out of scope; apply-review already special-cases `.omp/` for staging only |
| Edit one consumer host `.gitignore` as the fix | One-off | Issue out of scope; product must onboard/upgrade every host |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
