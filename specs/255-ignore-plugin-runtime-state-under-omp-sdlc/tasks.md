# Tasks: Ignore plugin runtime state under .omp/sdlc

**Issue**: #255
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add ignore/untrack helper and onboard/upgrade writers | [ ] |
| T002 | Untrack runtime in start and execute before dirty checks | [ ] |
| T003 | Add regression tests | [ ] |
| T004 | Verify focused suites | [ ] |

---

### T001: Add ignore/untrack helper and onboard/upgrade writers

**File(s)**: `scripts/omp-sdlc-ignore.mjs`, `workflows/onboard-project/WORKFLOW.md`, `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/upgrade-procedures.md`
**Type**: Create / Modify
**Depends**: None
**Acceptance**:
- [ ] `scripts/omp-sdlc-ignore.mjs` exports `OMP_SDLC_IGNORE_LINE` (`'.omp/sdlc/'`), `hasOmpSdlcIgnore`, `ensureOmpSdlcIgnore`, `writeOmpSdlcIgnore`, `untrackOmpSdlcRuntime`, and the exact staged-transition predicate with the contracts in this spec’s design
- [ ] CLI `node scripts/omp-sdlc-ignore.mjs ensure --root <dir>` writes or skips as specified and prints one JSON object
- [ ] Greenfield/brownfield onboard plan execution is required to run that CLI; already-initialized onboard still only recommends `/sdlc-upgrade-project`
- [ ] `detectUpgrade` emits actionable `id: 'omp-sdlc-ignore'` / `kind: 'omp-sdlc-ignore'` iff the host lacks the rule
- [ ] `applyUpgrade` applies that id via `writeOmpSdlcIgnore` after `v2-cleanup` (priority 8; `issue-dependencies` moves to 9)
- [ ] Repeat detect after apply emits no `omp-sdlc-ignore` item
- [ ] Workflow-bundled files are edited only after reading `skill://skill-creator`

**Notes**: Do not teach onboard to append a different ignore spelling. Do not put the add into `editGitignoreForV2`.

### T002: Untrack runtime in start and execute before dirty checks

**File(s)**: `scripts/start-issue.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `startIssue` default `fs` includes `readFileSync`
- [ ] After dependency eligibility and before porcelain, `startIssue` calls `untrackOmpSdlcRuntime`; `!ok` writes `reasonCode: 'runtime_untrack_failed'`, `intervention: true`, and does not call `gh issue develop`
- [ ] `runExecute` calls `untrackOmpSdlcRuntime` once immediately before `dirtyTreeBlocks(issues[0])`; `!ok` returns status 2 and stderr `Failed to untrack plugin runtime under .omp/sdlc\n` with no run write and no workers
- [ ] When the ignore rule is absent, neither controller runs `git ls-files` or `git rm`
- [ ] `dirtyTreeBlocks`, `restoreActiveIssueBranch`, and the start-issue dirty predicate inspect unfiltered porcelain; only the initial gate receiving a successful changed untrack result may authorize an exact set of index-only `.omp/sdlc/**` deletions matching the pre-removal `ls-files -z` result
- [ ] Any additional, missing, unstaged, renamed, untracked, or differently staged record fails `dirty_tree`
- [ ] `git rm` is only `['rm', '--cached', '-r', '--', '.omp/sdlc']`

**Notes**: Import the helper; do not duplicate the predicate.

### T003: Add regression tests

**File(s)**: `scripts/__tests__/omp-sdlc-ignore.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/start-issue-controller.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Create / Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Helper tests: missing text → `ensure` appends `.omp/sdlc/\n`; existing `.omp/sdlc/` or `.omp/sdlc` → unchanged; `# .omp/sdlc/` and `!.omp/sdlc/` → append; unwritable directory named `.gitignore` → `preserved (unmanaged)` / CLI `gitignore_unwritable`
- [ ] Untrack tests: no ignore → no git calls; ignore + empty `ls-files` → no `rm`; ignore + listed path → `git rm --cached -r -- .omp/sdlc`, exact path authorization, and `ok`; `ls-files` or `rm` non-zero → `runtime_untrack_failed`
- [ ] Exact-transition tests: matching index-only deletions for the complete untrack path set are authorized; missing records, extra paths, worktree deletions, modifications, renames, and untracked paths are rejected
- [ ] Upgrade: host without the rule detects `omp-sdlc-ignore`; apply appends the line and preserves unrelated rules; second detect has no item; host that already has the line is not actionable
- [ ] Start: write `.gitignore` with `.omp/sdlc/`, stub `ls-files` to `.omp/sdlc/run.json\0`, then exact staged deletion porcelain → passed and `gh issue develop` runs; `git rm --cached` was called; no working-tree unlink
- [ ] Start: no `.gitignore`, porcelain `?? .omp/sdlc/run.json\n` → `dirty_tree`, no `git rm`, no develop
- [ ] Start: ignore present, exact runtime deletion plus ` M local.txt` after untrack → `dirty_tree`, no develop
- [ ] Start: ignore present, `git rm` status 1 → `runtime_untrack_failed`, no develop
- [ ] Execute: same four shapes against `runExecute` entry — the exact authorized transition does not print `Working tree is dirty for a new issue`; other dirty or staged records still return status 2 with that stderr; untrack failure uses the untrack stderr; existing `dirtyTreeBlocks` preflight for non-runtime dirt remains
- [ ] Gherkin tags `@SCN001`–`@SCN003` with `@regression` map to AC1–AC3

**Notes**: Extend the existing start `fixture()` `run` mock to handle `git ls-files` and `git rm` only in the new cases. Reuse `makeControllerFixture` for execute.

### T004: Verify focused suites

**File(s)**: `scripts/__tests__/omp-sdlc-ignore.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/start-issue-controller.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Verify (no file changes)
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/omp-sdlc-ignore.test.mjs __tests__/sdlc-upgrade.test.mjs __tests__/start-issue-controller.test.mjs __tests__/sdlc-execute.test.mjs` exits 0
- [ ] Existing start `dirty_tree` for ` M local.txt` still passes
- [ ] Existing execute dirty preflight still returns status 2 with `Working tree is dirty for a new issue` when porcelain is dirty, no ignore rule, and current is not `issues[0]`’s issue branch

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
