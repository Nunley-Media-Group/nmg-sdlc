# Verification Report: Stop the /sdlc-execute controller busy-waiting while a stage worker waits on a background command

**Date**: 2026-11-14
**Issue**: #550
**Reviewer**: Claude Code (architecture-reviewer)
**Scope**: Implementation verification against spec (defect fix)

**Verification head**: 10b7e67dc832ff4bb44f8d81d45ba72ea1c7fe01

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.5 |

### Implementation Status: Pass

Defect fix. Every acceptance criterion, functional requirement and task of the change passes review, and both required registered validations passed at the verification head: `repository.tests` and the live `repository.nmg-sdlc-smoke` delivery of smoke issue #305.

**Total Issues**: 2 (2 low)

---

## Issue Scope

- Active issue: #550
- Spec: `specs/550-stop-the-sdlc-execute-controller-busy-waiting-while-a-stage-worker-waits-on-a-background-command`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":550,"specPath":"specs/550-stop-the-sdlc-execute-controller-busy-waiting-while-a-stage-worker-waits-on-a-background-command","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Complete (2/2 required validations passed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `node scripts/sdlc-verify-steering.mjs --project . --issue 550 --spec specs/550-… --base main` (standalone, no controller run id); exit 0, `ok: true`.
- Artifact: `.nmg-sdlc/verification/550.json`, generated 2026-11-14T23:09:50.840Z.
- Identity: head `10b7e67dc832ff4bb44f8d81d45ba72ea1c7fe01`, tree dirty only by this untracked report, steering `sha256:dc2b05c4491273f1e9f0c828569905965ba9730b302e2af25f57dac2b497f483`, spec `sha256:91255e870b7bf039d6c06107f425fd6bf290c72ecaf55694491869aaf7acf9f9`.
- Coverage: declared 2, recorded 2, complete `true`; no missing, duplicate or unknown results.
- Ceiling: none (no cap).

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A settled worker behind a waiting marker does not spin the controller | Pass | `scripts/sdlc-execute.mjs:433-438` waits with `until: 'started'`, the activity mark, `RESUME_POLL_MS` and `changed`; `scripts/sdlc-execute-host.mjs:157-160` sleeps `min(POLL_MS, time left)` on every poll that does not end the wait. Test `sleeps between every poll of an unchanged settled worker, bounded by the resume bound (AC1)` in `scripts/__tests__/execute-host.test.mjs` drives the real file host for 180 s of injected time: every sleep is 250 ms, sleeps are within `720..725`, controller waits are at most 7. |
| AC2 | The worker's next turn is still observed promptly | Pass | `started` holds when `lastActivityAt` advances past the mark or the status is active (`scripts/sdlc-execute-host.mjs:149-153`); the mark is read before the handoff (`scripts/sdlc-execute.mjs:419`, `:435`). Test `observes the next turn and its fresh handoff within one host poll (AC2)`: the handoff is returned within 250 ms of the resume, after exactly 7 sleeps. |
| AC3 | Check-ins continue during the wait | Pass | The supervised `waitFor` (`scripts/sdlc-execute.mjs:801-809`) slices the wait and calls `checkIn()` on each timed-out slice, passing `since` and `changed` through to `host.wait`. A throwaway probe run during verification (a settled idle worker behind its marker for 400 s, 100 s interval; not committed) produced interval check-ins at 150 s, 270 s and 390 s, each with `waiting: { command: 'sdlc-verify-steering.mjs', ageSeconds }` and `activity.status: 'idle'`, and no reminder. No committed test covers this exact path (Low, below). |
| AC4 | Existing settle and reminder behavior is preserved | Pass | `until: 'working'` branch unchanged (`scripts/sdlc-execute-host.mjs:154-155`); reminder and stop handling unchanged (`scripts/sdlc-execute.mjs:422-430`, `:439-441`). Tests `ends the wait when the marker is removed without a new turn (AC4)` (one reminder append, then the settled turn is reported) and `still returns at once from wait until working for a settled worker (AC4)` (zero sleeps); existing #470 tests `keeps a worker waiting on its background gate until its later handoff` and `removes a stale waiting marker and reminds a settled worker once…` pass. |

### Functional Requirements

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | The wait returns on a new turn (`started`), `changed()` (marker gone, fresh handoff, or read error), the `RESUME_POLL_MS` deadline, or a stale heartbeat (`assertAlive`). An unchanged settled worker always sleeps. |
| FR2 | Pass | `git diff main...HEAD -- scripts/sdlc-execute.mjs scripts/sdlc-execute-host.mjs` adds no constant; `POLL_MS` and `RESUME_POLL_MS` are reused. |
| FR3 | Pass | The #550 `describe` in `scripts/__tests__/execute-host.test.mjs` uses the injected clock and sleep and throws `controller polled the settled worker without blocking` after 200 unblocked waits. |

### Reproduction check (defect path)

With the controller line reverted to the pre-fix `waitFor({ until: 'working', timeoutMs: RESUME_POLL_MS })` (temporary, restored before the gate), the #550 tests fail 3 of 5 with `controller polled the settled worker without blocking`. At the verification head all 5 pass. The regression tests detect the defect and the fix removes it.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Let the host wait end on a caller-supplied change | Complete | `scripts/sdlc-execute-host.mjs` `wait({ …, changed })` |
| T002 | Wait for the worker's next turn behind a waiting marker | Complete | `scripts/sdlc-execute.mjs` `awaitTurnEnd` |
| T003 | Regression tests for the bounded wait | Complete | 5 tests in `execute-host.test.mjs`; one expectation updated in `sdlc-execute.test.mjs`; `npm test` exits 0 |
| T004 | Add the CHANGELOG entry | Complete | `### Fixed` bullet ending `(#550)`, rolled to `[4.12.1]` by the version-preparation commit |

---

## Architecture Assessment (blast radius)

- **Callers sharing the changed path**: `host.wait` is called only from `scripts/sdlc-execute.mjs` (`awaitWorkerHandoff` defaults, the supervised `waitFor` and `pause`). Only the marker wait passes `changed`; every other call is unaffected because `changed` is optional and checked only when it is a function.
- **Public contract**: `createFileHost().wait` gains one optional argument, as the design states. `awaitWorkerHandoff` is now exported so the regression tests can drive the real wait; no other module imports it. `until: 'working'` and the settle condition are unchanged.
- **Silent data changes**: none. No handoff, marker or record format changes. The marker is still removed only when the worker is seen active.
- **Minimal change**: the diff is the two source edits (22 lines), the tests, the spec, the CHANGELOG entry and the version mirrors (`VERSION`, `package.json`, `.claude-plugin/plugin.json` at 4.12.1). No unrelated edits.

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 4 | The host stays generic (a caller-supplied predicate); the controller owns marker and handoff knowledge. `awaitWorkerHandoff` is exported for tests only. |
| Security | 5 | No new input, path, command or credential surface. |
| Performance | 5 | Removes the busy loop: at most one agent-record read, one `lstat` and one handoff read per 250 ms poll. |
| Testability | 4 | Real file host under an injected clock and sleep; AC3 has no committed test on the settled path. |
| Error Handling | 4 | A read error in `changed` ends the wait and the loop re-observes; a stale heartbeat still throws. See the low finding on stopped workers. |

---

## Test Coverage

| Acceptance Criterion | Has Scenario | Has Test | Passes |
|---------------------|-------------|----------|--------|
| AC1 | SCN001 | Yes | Yes |
| AC2 | SCN002 | Yes | Yes |
| AC3 | SCN003 | Existing check-in tests only; settled path probed, not committed | Yes |
| AC4 | SCN004 | Yes | Yes |

- Full suite at the verification head: 60 suites passed, 1 skipped; 1318 tests passed, 2 skipped (`.nmg-sdlc/verification/550/repository.tests.log`).
- Exercise testing: not applicable; the change touches no file under `workflows/` or `agents/`.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (`builtin.command`, required) | Pass | `npm test -- --runInBand` in `scripts` exited 0 at `10b7e67d`: `Test Suites: 1 skipped, 60 passed, 60 of 61 total`; `Tests: 2 skipped, 1318 passed, 1320 total`; `Time: 602.359 s`. |
| `repository.nmg-sdlc-smoke` (`project.nmg-sdlc-smoke`, required) | Pass | `nmg-sdlc-smoke delivered #305`: `claude /sdlc-execute #305` in a fresh smoke clone closed issue #305 through PR #307, merged at `9145bab2`. |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete

### Smoke lifecycle evidence

- Provisioning followed `steering/snippets/project-smoke.md`: smoke issue #305 (`Add greeting_is_printable library helper`) was drafted with `/sdlc-draft-issue`, then specified with `/sdlc-write-spec #305` in an interactive `claude --plugin-dir <checkout>` tmux session at this head; spec PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/306 merged and #305 carried `spec-created`. The record `.nmg-sdlc/smoke/provisioned.json` names #305.
- The gate then delivered #305 end to end: https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/307 merged at `9145bab20ac4d8fea5f9de86415b931585edf2b0`, and #305 is CLOSED.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None | No source change was made during verification | — |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **Location** | `scripts/__tests__/sdlc-execute.test.mjs` |
| **Issue** | No committed test asserts check-ins while a settled worker waits behind its marker (AC3 / SCN003 on the changed path). Existing check-in tests use a running worker. |
| **Impact** | A later change could stop check-ins on this path unnoticed. Behavior was confirmed by a throwaway probe. |
| **Reason Not Fixed** | T003 does not list AC3; adding a test changes the implementation head and belongs to the implement stage. |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-execute.mjs:433-438` |
| **Issue** | A worker that moves from `idle` to a stopped status (for example `failed` or `killed`) behind its marker, with no activity time advance, is now noticed when the 60-second resume bound elapses rather than at once. |
| **Impact** | Up to 60 s delay before a stopped worker is reported. |
| **Reason Not Fixed** | Consistent with FR1, which lists the only conditions that end the wait; changing it needs a spec decision. |

---

## Positive Observations

- The fix reuses the #546 `started` condition and adds no timing constant.
- Reading the activity mark before the handoff closes the race between the two reads.
- The regression tests drive the real file host and fail on the pre-fix code.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute-host.mjs` | 0 | Optional `changed` probe |
| `scripts/sdlc-execute.mjs` | 1 low | Marker wait; export for tests |
| `scripts/__tests__/execute-host.test.mjs` | 0 | 5 new tests |
| `scripts/__tests__/sdlc-execute.test.mjs` | 1 low | One expectation updated; AC3 path untested |
| `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | 4.12.1 mirrors agree |

---

## Recommendation

**Ready for PR.**

The change is correct and complete against the spec, and the full registered gate passed at the verification head. The two low findings are follow-up candidates, not blockers.
