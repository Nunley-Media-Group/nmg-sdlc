# Root Cause Analysis: Make execute resume active issue state safely

**Issue**: #249
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/241-wait-for-retained-active-workers-instead-of-exiting-execute/
---

## Root Cause

`runExecute` in `scripts/sdlc-execute.mjs` treats a matching retained or newly started worker that is already `idle` or `done` as ready for handoff evaluation. Spec 241 correctly waits only when state is not `idle`/`done`. The remaining hole is an `idle`/`done` observation with no `.omp/sdlc/handoffs/<N>-<step>.json` yet: both the retained catch (~818–838) and the new-worker catch (~1021–1029) immediately `stopResult` with `reasonCode: 'missing_handoff'`. Herdr can classify an OMP worker as idle around an advisory or interactive transition even though that worker later resumes and writes a valid passed handoff.

On the next `/sdlc-execute` invocation the controller walks the entire persisted `issues` array. A fully completed earlier issue still runs `syncAndDeleteIssueBranch`, which `git checkout`s the repository default branch. The later issue with `completed: ['start', 'implement']` takes `nextStep` `review1` and never restores its issue branch. `start-issue` is the only existing checkout of `N-<slug>`, and that step is skipped. `reviewBranchSelectionKeys` then indexes hardcoded `main` and host `/review` compares current HEAD to that base, producing main-against-main.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-execute.mjs` | retained idle/done handoff catch in `runExecute` | Immediate `missing_handoff` when the file is absent |
| `scripts/sdlc-execute.mjs` | new-worker post-prompt handoff catch in `runExecute` | Same immediate `missing_handoff` after existing stall/`appearsWorking` recovery |
| `scripts/sdlc-execute.mjs` | `waitForWorkerSettlement`, `retryPromptSubmission`, `hasPastedWorkerPrompt` | Existing settlement primitives to reuse; no new wait helper |
| `scripts/sdlc-execute.mjs` | `syncAndDeleteIssueBranch` | Checks out default branch after every completed issue, including already-delivered resume rows |
| `scripts/sdlc-execute.mjs` | `issueBranchName`, `dirtyTreeBlocks` | Existing slug and dirty-tree contract; dirty preflight still uses `issues[0]` |
| `scripts/sdlc-execute.mjs` | `reviewBranchSelectionKeys` and the `review1`/`review2` launch block | Hardcoded `main`; no current-versus-base guard |
| `scripts/__tests__/sdlc-execute.test.mjs` | `does not press enter on a retained worker without a pasted prompt`; missing-handoff wait-failure tests | Pin immediate `missing_handoff` and must be updated to allow one settlement wait |
| `scripts/sdlc-review-main.mjs` | `runReviewMain` | Persist-only; do not edit |
| `scripts/start-issue.mjs` | `gh issue develop --checkout` | Still the only creator of a missing issue branch; execute restore must not call it |

### Triggering Conditions

- A matching `s<N>-<step>` worker is observed `idle` or `done` before its handoff file exists, and detection text is not a pasted worker prompt.
- The persisted queue has an earlier issue whose eight lifecycle steps are complete and whose PR is MERGED and issue CLOSED.
- A later issue has completed `start` and `implement` so `nextStep` is `review1` or `review2`.
- The shared worktree is on the default branch after earlier-issue finalize, which `dirtyTreeBlocks` accepts because the tree is clean.

---

## Fix Strategy

### Approach

Keep one controller and reuse `waitForWorkerSettlement`, `stopResult`, `validateHandoff`, `issueBranchName`, and `syncAndDeleteIssueBranch`. Do not export a new public helper. Do not add a timeout or poll loop.

**Idle without handoff.** After the existing retained paste-recovery block (still skipped for `review1`/`review2`) and after the existing new-worker stall/`appearsWorking` recovery, if state is `idle` or `done` and the handoff file is missing, call `waitForWorkerSettlement` once, then re-read state and evaluate the handoff. `waitForWorkerSettlement` false → `worker_failed`. File still missing or unreadable after a successful wait → `missing_handoff` (spec 216). Issue/step mismatch on a readable file stays `missing_handoff` on the retained catch and `invalid_handoff` on the new-worker path. A present valid passed non-intervention handoff on idle/done still skips this extra wait.

**Branch restore.** After `step = nextStep(...)` for an issue, if `step` is a real step and `step !== 'start'`, run unexported `restoreActiveIssueBranch(issue, cwd, run)` before retained-worker handling and before `while (step)`:

1. `expected = issueBranchName(issue, cwd, run)`. Null → `stopResult` with `reasonCode: 'issue_branch_unreadable'`, `paneId: 'none'`, `agentName: \`s${issue}-${step}\``.
2. Read `git status --porcelain` and `git branch --show-current`. Unreadable either command → `issue_branch_unreadable`.
3. Dirty and current !== expected → `dirty_tree`. Do not checkout, stash, reset, or discard.
4. Current === expected → return success with no git mutation.
5. Otherwise `git checkout <expected>` only. Failure or a follow-up `--show-current` that is not `expected` → `branch_checkout_failed`.

Do not call `gh issue develop`. Do not `git checkout -B`. Leave `syncAndDeleteIssueBranch` after a fully completed issue (`step` falsy). Leave `dirtyTreeBlocks(issues[0])` at controller entry unchanged.

**Review guard.** Change `reviewBranchSelectionKeys(cwd, run)` to resolve the default branch with the same `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` call `syncAndDeleteIssueBranch` already uses, then `names.indexOf(defaultBranch)` instead of `'main'`. Empty default or missing name → `null` (existing `review_failed`). Immediately before the `/review` / Review Mode / base-menu key sequence, if current branch !== expected issue branch or current === default branch, `stopResult` `review_branch_mismatch` and do not send `/review` or menu keys. If the review pane was already split, leave it open (existing fail-closed pane rule). Prefer running restore so the review pane is not created while still on the default branch: restore runs before `while (step)`.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | One settlement wait when idle/done and the handoff file is missing; then existing validation | AC1 / FR1 |
| `scripts/sdlc-execute.mjs` | Unexported `restoreActiveIssueBranch` before incomplete post-start steps | AC3 / FR2 |
| `scripts/sdlc-execute.mjs` | Default-branch menu index + same-branch review stop | AC4 / FR3 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Transient-idle, multi-issue resume, review-mismatch, and fail-closed updates | AC6 |

### Blast Radius

- **Direct impact**: `runExecute` retained and new-worker settlement; review launch; every resumed incomplete step after `start`.
- **Indirect impact**: spec 241 idle/done-with-handoff skip-wait; spec 216 missing-handoff after wait; spec 208 review menu key bursts; spec 231 serial later-issue block; existing `does not press enter on a retained worker without a pasted prompt` (must still not send Enter, but may wait once).
- **Risk level**: Medium. Extra `until: 'working'` wait on a genuinely finished idle worker without a handoff becomes `worker_failed` instead of immediate `missing_handoff` when Herdr never returns to `working`. That is the AC2 stalled path.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Idle/done with a valid handoff starts waiting until `working` | Low | Extra wait runs only when the handoff file is absent |
| Genuine missing handoff hangs | Low | `waitForWorkerSettlement` false → `worker_failed`; still-missing file after success → `missing_handoff` |
| Restore checks out a branch that does not exist yet on `start` | Low | Skip restore when `step === 'start'` |
| Dirty user work discarded by checkout | Low | Dirty + wrong branch → `dirty_tree`; checkout is non-force |
| Review menu keys no longer select `main` in this repo | Low | Default branch in fixtures and this repository is `main` |
| Later issue starts before earlier merge+close | Low | Do not change `syncAndDeleteIssueBranch` success predicate |
| Duplicate implement worker after transient idle | Low | Reuse the live `s<N>-<step>` name; do not `agentStart` while `live` matches |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Skip `syncAndDeleteIssueBranch` for already-completed resume rows | Avoids the default-branch checkout | Leaves delivered-branch deletion unrun on resume; restore of the next issue is the smaller, local fix |
| `gh issue develop --checkout` from execute | Reuses start-issue | Can recreate or retarget a branch; start owns creation; restore only checks out an existing name |
| Treat first idle-without-handoff as success and return | Operator reinvokes later | Repeats the spec 241 status-0 abandonment defect |
| Hard-fail `missing_handoff` unless detection contains `Working` | Narrower wait | Issue reproduction is a Herdr idle classification without a guaranteed Working detection string |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
