# Live GitHub Smoke Evidence: Issue #213

**Date**: 2026-08-24
**Repository**: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`
**Disposable clone**: `/tmp/nmg-sdlc-smoke-213-live.2oWAHd/repo`
**Extension under test**: `/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts`

## Required lifecycle gate

Required: two distinct live issues, each covering actual `/sdlc-draft-issue` and actual `/sdlc-write-spec`, followed by one persisted `/sdlc-execute #11 #12` lifecycle processing both issues serially through merged delivery pull requests and closed issues.

Result: **Pass.** Issues #11 and #12 completed all eight execute steps. Delivery PRs #15 and #16 merged at exact verified heads, both issues closed, the persisted run has no current issue/step or failure, and the disposable clone is clean on `main...origin/main`.

## Caller and extension isolation

The continuation verified the live caller before launch:

```text
HERDR_ENV=1
HERDR_SOCKET_PATH=/Users/rnunley/.config/herdr/herdr.sock
HERDR_WORKSPACE_ID=w6
HERDR_TAB_ID=w6:t1
HERDR_PANE_ID=w6:p5Z
```

`herdr pane current --current` independently returned pane `w6:p5Z`. Managed OMP process `s213-live-execute-fix3` received those values explicitly, disabled ambient extensions and skills, and explicitly loaded:

```text
/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts
```

The controller command remained the branch controller:

```text
node "/Volumes/Fast Brick/source/repos/nmg-sdlc/scripts/sdlc-execute.mjs" run '#11' '#12'
```

## Authoritative draft and specification resources

| Issue | Draft result | Specification PR | Specification result |
|---:|---|---:|---|
| #11 | `Add LIVE_SMOKE_A lifecycle verification marker`; `enhancement`, `spec-created` | #13 | Merged at `de3475f437b27c245bd86cb9e74056283483257b` ancestry; Approved four-file package |
| #12 | `Add second serial lifecycle smoke marker`; `enhancement`, `spec-created` | #14 | Merged 2026-08-25T03:08:45Z; Approved four-file package |

Issues and specification PRs were reused. No duplicate draft issue or specification PR was created.

## Execute lifecycle

Issue #11 reused passed start and implementation handoffs. Its implementation commit remained `34c69c6239e87eb0b330e3fb9fc6fb66d22be031`. Review1 was completed against literal `main`; its normal `review-main` helper persisted `.omp/sdlc/handoffs/11-review1.json` and `.omp/sdlc/reviews/11-review1.md`. The controller then completed fix1, review2 against literal `main`, fix2, verify, and deliver.

Issue #12 then completed start and implementation. Review1 and review2 both ran against literal `main`; normal helpers persisted their review artifacts and handoffs. Fix1, fix2, verify, and deliver completed normally. The final delivery worker repaired its own schema-invalid handoff, validated it with `validate-handoff`, and preserved the already-observed PR/issue evidence; no handoff outcome was hand-edited or fabricated by the verifier.

Observed continuation workers:

| Issue | Step | Pane | Result |
|---:|---|---|---|
| #11 | review1 | `w6:p50` | Pass, no findings |
| #11 | fix1 | `w6:p61` | Pass |
| #11 | review2 | `w6:p62` | Pass, no findings |
| #11 | verify | `w6:p64` | Pass |
| #11 | deliver | `w6:p65` | PR #15 merged; issue closed |
| #12 | implement | `w6:p67` | Pass |
| #12 | review1 | `w6:p68` | Pass against `main` |
| #12 | fix1 | `w6:p69` | Pass |
| #12 | review2 | `w6:p6A` | Pass against `main`; final controller fix exercised |
| #12 | verify | `w6:p6C` | Pass |
| #12 | deliver | `w6:p6D` | PR #16 merged; issue closed |

Final persisted state:

```json
{
  "schemaVersion": 1,
  "issues": [11, 12],
  "currentIssue": null,
  "currentStep": null,
  "completed": {
    "11": ["start", "implement", "review1", "fix1", "review2", "fix2", "verify", "deliver"],
    "12": ["start", "implement", "review1", "fix1", "review2", "fix2", "verify", "deliver"]
  },
  "failed": null,
  "startedAt": "2026-08-25T03:10:37.864Z"
}
```

## Review-controller defects and remediation

The live narrow review panes rendered the branch-picker title as `Select base b…`, while the controller required the untruncated literal `Select base branch`. Immediate polling also raced TUI rendering, and a stopped controller could not resume a retained review picker. The smallest contract-correct repair:

- waits for asynchronous review UI rendering;
- detects the stable branch-picker prefix in narrow panes;
- selects the repository default branch by computed menu index;
- resumes retained `Review Mode` or base-picker states;
- runs the normal `review-main` helper after the host review completes.

Regression coverage includes delayed picker rendering, narrow-title detection, default-branch key selection, and retained review recovery. Source commits pushed on the #213 branch:

- `a6a91ed` — wait for review branch picker;
- `8c2a06b` — allow picker render time without slowing injected test fixtures;
- `ac93d3a` — resume retained review pickers;
- `c303f8f` — detect the narrow-pane truncated picker title.

Verification after the final source change:

| Check | Result |
|---|---|
| Focused `sdlc-execute` suite | 100 passed |
| Full repository Jest suite | 43 suites passed, 1 skipped; 515 tests passed, 2 skipped |
| Final live retained review2 under `c303f8f` | Pass against literal `main`; helper handoff persisted |

## Delivery proof

| Issue | Delivery PR | State | Merge commit | Merged at | Issue state |
|---:|---:|---|---|---|---|
| #11 | #15 | MERGED | `0e91017b33c81c91297219407251a77a852c8cd7` | 2026-08-25T03:59:16Z | CLOSED / COMPLETED |
| #12 | #16 | MERGED | `eb91cf4b1018ca773d08e86b20a3b2437f721b0b` | 2026-08-25T04:27:41Z | CLOSED / COMPLETED |

URLs:

- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/pull/15
- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/pull/16
- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/issues/11
- https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416/issues/12

## Cleanup

The final controller exited 0. No `s11-*` or `s12-*` Herdr agent remains. The disposable clone is clean on `main...origin/main`; both issue branches were cleaned after terminal delivery proof. Runtime handoffs, review artifacts, verification reports, and the completed `run.json` remain in `.omp/sdlc` as evidence.
