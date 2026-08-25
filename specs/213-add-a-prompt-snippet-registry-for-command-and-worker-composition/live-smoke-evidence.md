# Live GitHub Smoke Evidence: Issue #213

**Date**: 2026-08-24
**Repository**: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`
**Repository URL**: https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416
**Visibility / access**: private; authenticated viewer had `ADMIN`
**Disposable clone**: `/tmp/nmg-sdlc-smoke-213-live.2oWAHd/repo`
**Extension under test**: `/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts`

## Required lifecycle gate

Required: two distinct live issues, each covering actual `/sdlc-draft-issue` and actual `/sdlc-write-spec`, followed by one actual `/sdlc-execute` invocation processing both issues serially through merged delivery pull requests and closed issues.

Result: **Fail — lifecycle stopped at issue #11 start.** Both issues and both approved specification packages now exist, but the single execute run failed before the first implementation worker started. No delivery pull request was created; issues #11 and #12 remain open.

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

## Execute outcome

Managed process: `live-execute-11-12`.

The real OMP TUI loaded the branch extension and reported `NMG SDLC ready in Herdr`. One command was entered exactly once:

```text
/sdlc-execute #11 #12
```

The workflow verified inherited Herdr variables and invoked the controller exactly as:

```text
node "/Volumes/Fast Brick/source/repos/nmg-sdlc/scripts/sdlc-execute.mjs" run '#11' '#12'
```

Observed controller result:

```text
Stopped on #11 start. Worker pane unknown agent s11-start left open.
Exit: 1
```

Persisted `.omp/sdlc/run.json` state:

```json
{
  "schemaVersion": 1,
  "issues": [11, 12],
  "currentIssue": 11,
  "currentStep": "start",
  "completed": {"11": []},
  "failed": {
    "issue": 11,
    "step": "start",
    "reasonCode": "pane_split_failed"
  },
  "startedAt": "2026-08-25T03:10:37.864Z"
}
```

Immediately after failure, live Herdr inspection found no `s11-start` or `s12-*` agent and no surviving worker pane; workspace `w6` contained only its pre-existing panes. The execute process inherited caller identifier `w6:p5R`, while the current verification agent occupied `w6:p5T`. This evidence records the mismatch without inferring a source defect.

Because the controller failed at the first `start` step:

- issue #11 implementation did not start;
- issue #12 was not started;
- no review, verification, or delivery step ran;
- delivery PR identifiers: **none**;
- issue #11 terminal state: **OPEN**;
- issue #12 terminal state: **OPEN**.

## GitHub terminal state

| Resource | State |
|---|---|
| Issue #11 | OPEN; `enhancement`, `spec-created` |
| Issue #12 | OPEN; `enhancement`, `spec-created` |
| Spec PR #13 | MERGED |
| Spec PR #14 | MERGED |
| Delivery PR for #11 | Not created |
| Delivery PR for #12 | Not created |

The authoritative completion gate is unmet. Unit tests, fixtures, the corrected extension diagnostic, and merged specification PRs do not substitute for two merged delivery PRs and two closed issues.

## Cleanup state

Only smoke processes from this run were stopped. `live-draft-a`, `live-draft-b`, `live-spec-11`, `live-spec-12`, and `live-execute-11-12` are exited. No unrelated Herdr pane or process was stopped. The failed controller left no observable `s11-start` worker agent or worker pane. The disposable clone remains at `/tmp/nmg-sdlc-smoke-213-live.2oWAHd/repo` so a fresh verification-fix worker can resume issues #11 and #12 and the persisted run state without duplicating resources.
