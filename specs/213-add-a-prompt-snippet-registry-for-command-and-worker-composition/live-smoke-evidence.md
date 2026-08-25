# Live GitHub Smoke Evidence: Issue #213

**Date**: 2026-08-24
**Repository**: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`
**Repository URL**: https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416
**Visibility / access**: private; authenticated viewer had `ADMIN`
**Disposable clone**: `/tmp/nmg-sdlc-smoke-213-live.2oWAHd/repo`
**Extension under test**: `/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts`

## Required lifecycle gate

Required: two distinct live issues, each covering actual `/sdlc-draft-issue` and actual `/sdlc-write-spec`, followed by one actual `/sdlc-execute` invocation processing both issues serially through merged delivery pull requests and closed issues.

Result: **Fail — corrected resume advanced issue #11 through start and implementation, then stopped at review1.** Both issues and both approved specification packages remain intact. The corrected caller-pane environment created real worker panes, issue #11 implementation commit `34c69c6239e87eb0b330e3fb9fc6fb66d22be031` is pushed, and passed start/implement handoffs are persisted. The resumed controller stopped with `reasonCode: review_failed` while `s11-review1` remained open in the base-branch picker. No delivery pull request was created; issues #11 and #12 remain open.

## Extension and harness prerequisite

Commit `0dc05967063d2d1fd329e3b25dfd592ef7cf96cd` fixed `scripts/exercise-omp.mjs` so the harness explicitly loads `/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts` even with `--no-extensions`. Focused coverage passed 14/14 and the full Jest suite passed 513 tests with 2 expected skips before this live attempt. The live OMP processes used both `--no-extensions` and the explicit `--extension` path.

## Draft outcomes

The resumed run reused the existing resources rather than creating duplicate issues:

| Workflow | Issue | Result |
|---|---:|---|
| actual `/sdlc-draft-issue` | #11 `Add LIVE_SMOKE_A lifecycle verification marker` | Created; remains open; labels `enhancement`, `spec-created` |
| actual `/sdlc-draft-issue` | #12 `Add second serial lifecycle smoke marker` | Created; remains open; labels `enhancement`, `spec-created` |

Issue URLs:

- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/issues/11
- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/issues/12

## Specification outcomes

| Workflow | Issue | Specification PR | Result |
|---|---:|---:|---|
| actual `/sdlc-write-spec #11` | #11 | #13 `docs: approve spec for #11` | Merged 2026-08-25T02:57:25Z; four-file Approved package on `main`; `spec-created` present |
| actual `/sdlc-write-spec #12` | #12 | #14 `docs: approve spec for #12` | Resumed from the surviving `live-spec-12` plan review; merged 2026-08-25T03:08:45Z; four-file Approved package on `main`; `spec-created` present |

Specification PR URLs:

- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/pull/13
- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/pull/14

The clone was clean on `main...origin/main` at `de3475f437b27c245bd86cb9e74056283483257b` (`docs: approve spec for #12 (#14)`) before execute.

## Execute outcomes

### Preserved pre-step failure

The first real OMP TUI attempt remains preserved in the original run state history. It loaded the branch extension, accepted `/sdlc-execute #11 #12`, invoked the branch controller, and stopped before any worker with `pane_split_failed` because its managed process inherited stale caller pane `w6:p5R`. No worker survived that attempt.

### Corrected caller-pane round

The fresh verifier confirmed the actual environment before launch:

```text
HERDR_ENV=1
HERDR_SOCKET_PATH=/Users/rnunley/.config/herdr/herdr.sock
HERDR_PANE_ID=w6:p5V
```

`herdr pane current --current` independently reported pane `w6:p5V`. Managed process `live-execute-11-12-fix2` received those three values explicitly. Ambient extensions and skills were disabled, and the TUI explicitly loaded:

```text
/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts
```

The existing issues, merged specification PRs, clone, and failed run state were preserved. Source inspection established that the same `[11, 12]` run with no live worker resumes from `nextStep(completed["11"])`; no disposable `.omp/sdlc` state reset was required.

One command was entered in this corrected round:

```text
/sdlc-execute #11 #12
```

The TUI launched the branch controller with:

```text
node "/Volumes/Fast Brick/source/repos/nmg-sdlc/scripts/sdlc-execute.mjs" run 11 12
```

That controller successfully created `s11-start` in pane `w6:p5W`, proving the corrected caller-pane boundary. Start passed and the controller created `s11-implement` in `w6:p5X`. The TUI orchestration agent then canceled its background branch-controller process after an advisor incorrectly preferred the smoke repository's installed v3.5.1 controller. Its installed-controller reconciliation correctly detected the live worker and did not duplicate it. After `s11-implement` completed, the verifier resumed the same persisted queue directly with the branch controller and the same explicit caller environment.

Observed handoffs:

| Issue | Step | Status | Intervention | Summary |
|---:|---|---|---|---|
| #11 | start | passed | false | Branch ready for #11 |
| #11 | implement | passed | false | All tasks from tasks.md executed for #11 |
| #11 | review1 | absent | — | Controller stopped before a review handoff |
| #12 | any | absent | — | Serial queue never reached #12 |

Issue #11 implementation artifacts are `LIVE_SMOKE_A.txt`, `README.md`, and `scripts/__tests__/live-smoke-a.test.mjs`. Commit `34c69c6239e87eb0b330e3fb9fc6fb66d22be031` (`feat: add live smoke A marker`) is pushed; the branch is clean and aligned with `origin/11-add-live-smoke-a-lifecycle-verification-marker`.

Terminal controller output:

```text
Stopped on #11 review1. Worker pane w6:p5Y agent s11-review1 left open.
```

Persisted `.omp/sdlc/run.json` state:

```json
{
  "schemaVersion": 1,
  "issues": [11, 12],
  "currentIssue": 11,
  "currentStep": "review1",
  "completed": {
    "11": ["start", "implement"]
  },
  "failed": {
    "issue": 11,
    "step": "review1",
    "reasonCode": "review_failed"
  },
  "startedAt": "2026-08-25T03:10:37.864Z"
}
```

Terminal topology contains only `s11-review1`, idle in pane `w6:p5Y`; no `s12-*` worker exists. Its detection buffer preserves `/review` and the open `Select base branch` picker with the issue branch selected and `main` available. The pane and runtime state remain untouched for supported retained-worker diagnosis in the next fresh iteration.

## GitHub terminal state

| Resource | State |
|---|---|
| Issue #11 | OPEN; `enhancement`, `spec-created` |
| Issue #12 | OPEN; `enhancement`, `spec-created` |
| Spec PR #13 | MERGED |
| Spec PR #14 | MERGED |
| Issue #11 implementation branch | Pushed at `34c69c6239e87eb0b330e3fb9fc6fb66d22be031` |
| Delivery PR for #11 | Not created |
| Delivery PR for #12 | Not created |

An authenticated repository-scoped pull-request search for both delivery branch names returned zero results. The authoritative completion gate remains unmet: neither delivery PR is merged and neither issue is closed.

## Cleanup state

The corrected TUI and its controller process are exited. The earlier completed `s11-start` and `s11-implement` panes were closed by the controller. `s11-review1` remains open in pane `w6:p5Y`, as required after the failed review handoff boundary. No `s12-*` worker was created. No unrelated Herdr pane or process was stopped.

The disposable clone remains at `/tmp/nmg-sdlc-smoke-213-live.2oWAHd/repo` on the clean, pushed issue #11 branch. Its `.omp/sdlc/run.json`, passed start/implement handoffs, failed review state, and open review worker are preserved for the next fresh verification-fix worker. Issues #11/#12 and merged specification PRs #13/#14 were not recreated or modified.
