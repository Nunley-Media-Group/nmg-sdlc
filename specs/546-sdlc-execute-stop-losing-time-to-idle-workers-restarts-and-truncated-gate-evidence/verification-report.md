# Verification Report: /sdlc-execute: stop losing time to idle workers, restarts and truncated gate evidence

**Date**: 2026-11-13
**Issue**: #546
**Reviewer**: Claude Code (verify worker, architecture-reviewer)
**Scope**: Implementation verification against spec
**Verification head**: f8023162922301002d940dabef1f42750c7382e3

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 3 |
| Error Handling | 3 |
| **Overall** | 3.7 |

### Implementation Status: Fail

**Total Issues**: 3

The code satisfies all seven acceptance criteria, and the Jest suites for them pass. The registered gate failed twice at this head, though. Each time, the required `repository.tests` validation failed in `scripts/__tests__/sdlc-execute-supervisor.test.mjs`, and the required `repository.nmg-sdlc-smoke` validation was then deferred as `incomplete`. Each attempt failed a different test, but both failures come from the same race: the recursive removal of the execute session directory in `scripts/sdlc-execute-supervisor.mjs` runs while a late write lands in that directory. The same failure reproduces on `main` (e3fe7c2) under parallel load, so this branch did not introduce it. It still blocks a full-green gate. Separately, the hooks-module test that T008 requires is missing.

---

## Issue Scope

- Active issue: #546
- Spec: `specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1–FR8]; tasks [T001–T009]; scenarios [SCN001–SCN007]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":546,"specPath":"specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (the required `repository.tests` failed; the required `repository.nmg-sdlc-smoke` is incomplete)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

The runner was `sdlc-verify-steering.mjs --project . --issue 546 --spec specs/546-… --base main --controller-run-id ef3ce88d-df27-41a6-a6d5-2619e5c5e4cb`.

| Attempt | generatedAt | Head | Coverage | Ceiling |
|---------|-------------|------|----------|---------|
| 1 | 2026-11-13T23:49:37Z | f8023162922301002d940dabef1f42750c7382e3 | declared 2, recorded 2, complete | Incomplete |
| 2 | 2026-11-14T00:09:54Z | f8023162922301002d940dabef1f42750c7382e3 | declared 2, recorded 2, complete | Incomplete |

`.nmg-sdlc/verification/546.json` holds attempt 2.

| Validation | Required | Attempt 1 | Attempt 2 |
|------------|----------|-----------|-----------|
| `repository.tests` (`npm test -- --runInBand` in `scripts/`) | yes | failed: 1 failed, 1310 passed, 2 skipped (1313 total) | failed: 1 failed, 1310 passed, 2 skipped (1313 total) |
| `repository.nmg-sdlc-smoke` | yes | incomplete: deferred until required local validations pass | incomplete: deferred until required local validations pass |

Failing tests:

- **Attempt 1**: "execute CLI cancellation of its stage subagent and lease › releases the daemon and listener after an ordinary controller error result". The test expected stderr to contain `gh auth status failed`, but stderr was `ENOTEMPTY, Directory not empty: …/.nmg-sdlc/execute/<session>`. The error comes from the unguarded `rmSync(sessionDirectory(cwd, session), { recursive: true, force: true })` at `scripts/sdlc-execute-supervisor.mjs:670`.
- **Attempt 2**: "… › prints the session line, yields stage reports across invocations, and halts with its subagent stopped". At `sdlc-execute-supervisor.test.mjs:687`, `fs.existsSync(sessionDir)` was `true` after the halt. The best-effort removal in `terminalResult` (`scripts/sdlc-execute-supervisor.mjs:141`) swallows ENOTEMPTY and leaves the directory in place.

Both attempts ran while unrelated gate runners for other projects were active on this machine. The supervisor's guidance allowed one rerun after attempt 1. There was no third gate run.

### Diagnosis of the supervisor-suite failure

| Experiment | Result |
|------------|--------|
| HEAD, suite alone, 3 sequential runs | 29/29 passed each time |
| HEAD, suite under parallel load (6 runs, 3 at a time beside 3 `main` runs) | 5 passed; 1 failed 2 different timing tests ("a SIGINT to the invoking process cancels…", "returns from supervise while the first spawn waits on a bridge…") |
| `main` e3fe7c2 in a detached worktree, same parallel load (6 runs) | 5 passed; 1 failed **the same test as attempt 2** ("prints the session line … halts with its subagent stopped") |

This branch's changes do not cause the race. The checks:

- In the attempt 1 test, `gh auth` fails before any stage is dispatched (`responder.spawns` is `[]`). None of #546's controller paths run there: the append reminder, `settleCommits`, prompt waits, and gate-intent writes.
- Gate-intent records go to `.nmg-sdlc/execute/gate-intent/<N>.json`, and per-command logs go to `.nmg-sdlc/verification/<N>/`. Neither path is inside the session directory `.nmg-sdlc/execute/<session>/`.
- `settleCommits` and `host.wait({ until: 'started' })` only read the agent record, the heartbeat, and `index.lock`.

The session directory is shared with the hooks-module bridge, which keeps writing its heartbeat (`host.json`) and request responses there. A write that lands during the recursive removal makes it fail with ENOTEMPTY, or leaves the directory behind. The existing comment at `sdlc-execute-supervisor.mjs:140` already names this race.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | An idle worker without a handoff is resumed before any stage report | Pass | `scripts/sdlc-execute.mjs` `awaitTurnEnd`: the reminder goes through `host.append`, then `waitFor({ until: 'started', since, timeoutMs: RESUME_POLL_MS })`. Test "resumes a worker that settles without a handoff through append…" passes (1 reminder, 1 verify report, `handoffFresh: true`, steps `verify, deliver`, no redispatch) |
| AC2 | The stage report reflects the worker's last commit | Pass | `settleCommits` waits while `record.background` is non-empty or `<git-dir>/index.lock` exists. `headAfter`/`commits` are read after that. Test "holds the stage report until a tracked background command clears…" passes |
| AC3 | A prompt reaches an idle worker or is refused with a reason code | Pass | Stage `prompt` loop with `promptRefusal` `stage_prompt_undelivered` / `stage_prompt_not_resumed`. When a refusal is present, `decisions` omits `prompt`. The delivered path ("prompts the live worker through one host append…") and both refusal tests pass |
| AC4 | A restart during a verify rerun at an unchanged head resumes verify | Pass | `writeGateIntent` runs before a verify spawn. `liveGateIntent` routing (`if (intentLive && step !== 'implement') step = 'verify'`). Test "dispatches verify, not implement, after a restart…" passes |
| AC5 | A failed gate routes to implement only after it is accepted | Pass | `clearGateIntent` runs when a verify stage ends without redispatch or halt. A newer gate result for the head also clears the intent. Test "routes a failed gate to implement once its verify report is accepted…" passes, and the existing "diagnoses a previously failed exact-source gate" test still passes |
| AC6 | Gate evidence keeps failing test names and links the full log | Pass | `src/sdlc-verification-runtime.mjs` adds `tailBounded`, `extractFailures`, `writeCommandLog` (`.nmg-sdlc/verification/<N>/<id>.log`), `headSha`, `failures`, and a summary naming the first 10 failures. The 5 MB pytest test "names the failing test lines in the evidence and the summary, and links a log of the full output" passes. The reader bounds are raised to 4 MB in deliver/finalize/recover/execute |
| AC7 | A check-in during a running background command does not report `activity_unchanged` | Pass (controller); hooks link untested | `src/execute-host.mjs` adds `recordBackgroundStart`/`clearBackground`/`activityRecord.background`; `hooks/register.ts` records a Bash `backgroundTaskId`; the controller suppresses `activity_unchanged` while a command is recorded. The Jest controller and agent-record tests pass. The hooks-module recording has no test (see T008) |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Track stage workers' background commands | Complete | `src/execute-host.mjs`, `src/execute-host.d.mts`, `hooks/register.ts` |
| T002 | Resume idle worker; settle commits before the report | Complete | `scripts/sdlc-execute.mjs`, `scripts/sdlc-execute-host.mjs` (`until: 'started'`) |
| T003 | Reason-coded prompt refusals | Complete | |
| T004 | Gate intent and restart routing | Complete | |
| T005 | Tail-bounded output, logs, failures | Complete | The finalize, recover, and deliver readers accept artifacts up to 4 MB |
| T006 | Controller tests | Complete | 7 new tests in `sdlc-execute.test.mjs` |
| T007 | Gate-runner tests | Complete | 2 new tests in `sdlc-verification-runtime.test.mjs` |
| T008 | Agent-record and hooks tests | **Incomplete** | The Jest agent-record tests exist (`execute-host.test.mjs`). `hooks/register.test.ts` is unchanged and has no test for a stage worker's backgrounded Bash call being recorded and then cleared on its next turn. `claude plugin test .` passes 54/54 |
| T009 | CHANGELOG entry | Complete | The bullet ends `(#546)`. The delivery commit f802316 already rolled it under `## [4.12.0]`. `VERSION`, `package.json`, and `.claude-plugin/plugin.json` are all 4.12.0 |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `awaitWorkerHandoff` is split into `awaitTurnEnd` and `settleCommits`. Gate-intent persistence is a small cohesive set of functions |
| Open/Closed | 4 | `host.wait` gains a `started` mode without changing the existing modes |
| Liskov Substitution | 4 | Both host transports keep the same `wait`/`append`/`activity` shape |
| Interface Segregation | 4 | `activityRecord` adds one optional field; the type declarations are updated |
| Dependency Inversion | 4 | `run`, `waitFor`, and `pause` are injected, so the controller tests run without a host |

### Layer Separation

The hooks module still imports no Node built-ins: background tracking uses the Node-free helpers in `src/execute-host.mjs`. Gate evidence shaping stays in the runtime library, and routing stays in the controller.

### Dependency Flow

Dependencies point from the controller to the host transport to the shared helpers. There are no new cycles.

---

## Security Assessment

- [x] Input validation: the log path is built from a manifest validation id (`ID_RE` `^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$`) and a numeric issue, so it cannot traverse paths. The gate-intent reader checks the schema, issue, SHA, and integer `dispatchedAt` against a 4 KB bound
- [x] Injection prevention: `git rev-parse --git-dir` runs through an argument array
- [x] Data protection: full command logs stay in the git-ignored `.nmg-sdlc/` runtime directory
- [x] Writes: gate intent is written atomically (temp file plus rename)

---

## Performance Assessment

- [x] Bounded evidence: stream tails are capped at 65536 characters, with at most 100 failure lines of at most 500 characters
- [x] Resource management: `extractFailures` runs twice per completed command (once for evidence, once for the summary). That is two linear scans of the buffered output, which is acceptable at the 5 MB scale tested
- [x] Reader bounds are raised consistently to 4 MB in all four artifact readers

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Jest | Yes |
| AC2 | Yes (SCN002) | Jest | Yes |
| AC3 | Yes (SCN003) | Jest | Yes |
| AC4 | Yes (SCN004) | Jest | Yes |
| AC5 | Yes (SCN005) | Jest | Yes |
| AC6 | Yes (SCN006) | Jest | Yes |
| AC7 | Yes (SCN007) | Jest (controller and agent record); no hooks-module test | Yes (partial coverage) |

### Coverage Summary

- Feature file: 7 scenarios
- New tests: 7 controller, 2 gate-runner, 3 agent-record/host
- Full suite: 1310 passed, 1 failed (pre-existing supervisor cleanup race), 2 skipped
- Hooks module (`claude plugin test .`): 54 pass, 0 fail

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | No `workflows/` or `agents/` file changed (`git diff main...HEAD`), so no skill exercise applies. The live `/sdlc-execute` proof belongs to the `repository.nmg-sdlc-smoke` gate, which was deferred because `repository.tests` failed |
| **Recommendation** | Rerun the full registered gate, smoke included, after the supervisor-suite race is fixed |

### Smoke provisioning

The recorded smoke issue #299 was CLOSED, so a fresh one was provisioned through the real interactive workflows in a detached tmux session loading this checkout:

- `/sdlc-draft-issue <need>` created **Nunley-Media-Group/nmg-sdlc-smoke#302**, "Add greeting_quoted_printable library helper".
- `/sdlc-write-spec #302` published the spec through PR #303, "docs: approve spec for #302", which is merged. Issue #302 is OPEN with `spec-created`.
- `.nmg-sdlc/smoke/provisioned.json` now records issue 302. The clone and the tmux session were removed.

The issue is undelivered and can be reused by the next verification.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Fail | 1/1313 failed in 2 attempts (different test each time, same session-directory cleanup race) |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Incomplete | Deferred until required local validations pass; #302 provisioned |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean (90 items mapped) |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: exit 0 |
| Skill creator validation | N/A | No skill-bundled file changed |
| Skill exercise | N/A | No changed skill fixture |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0 |

**Gate Summary**: 3/5 applicable gates passed, 1 failed, 1 incomplete

---

## Fixes Applied

None. This worker's publication scope allows writing only this report.

## Remaining Issues

### Critical Issues

| Field | Value |
|-------|-------|
| **Severity** | Critical (blocks the full-green gate) |
| **Category** | Testing / Error Handling |
| **Location** | `scripts/sdlc-execute-supervisor.mjs:141`, `scripts/sdlc-execute-supervisor.mjs:670`; `scripts/__tests__/sdlc-execute-supervisor.test.mjs:509`, `:687` |
| **Issue** | The session directory is removed recursively while the hooks-module bridge (or the test responder) can still write into it. The removal at line 670 raises ENOTEMPTY to stderr, and the removal at line 141 silently leaves the directory behind. Tests that assert the directory is gone, or that stderr carries the controller error, fail under load |
| **Impact** | `repository.tests` fails nondeterministically, so verification cannot reach full green, and the smoke gate is never run |
| **Reason Not Fixed** | This race predates the branch and reproduces on `main` e3fe7c2, but it is outside the verify worker's writable scope. Suggested fixes: retry the removal on ENOTEMPTY until the bridge's writes stop, guard line 670 the way line 141 is guarded, or make the bridge stop writing before cleanup. The tests can also wait for the directory to disappear rather than asserting it immediately |

### High Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Category** | Testing |
| **Location** | `hooks/register.test.ts` |
| **Issue** | T008 requires a hooks test showing a stage worker's backgrounded Bash call (`backgroundTaskId`) recorded in its agent record and cleared on its next turn. There is no such test; the existing background tests cover only write-spec merges |
| **Impact** | The link from the hooks module to `activity.background` for AC7 has no automated test |
| **Reason Not Fixed** | Outside the verify worker's writable scope |

### Medium Priority

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-execute.mjs` `settleCommits`; `hooks/register.ts` (background clear on the next turn) |
| **Issue** | A tracked background entry is cleared only when a settled worker starts a new turn. If a worker waits for its own background command inside the same turn and then settles with a valid handoff, the entry stays recorded. `settleCommits` then waits, with no deadline, for a new turn that may never come. In supervised runs, check-ins keep firing and the supervisor can act; in unsupervised runs the stage only loops in check-in slices |
| **Impact** | A completed stage could be held indefinitely after it wrote its handoff. This has not been observed live, because the smoke run was deferred |
| **Reason Not Fixed** | This needs a design decision, for example clearing an entry when its task completes or bounding the settle wait once a fresh handoff exists. It is outside verify scope |

---

## Positive Observations

- Gate-intent routing is conservative: a dirty tree, an unimplemented branch, or a needed implementation still route to implement.
- Gate evidence keeps the stream tails rather than the heads, and links the full log, which matches what a reader needs when a long test run fails.
- Reason-coded prompt refusals stop the supervisor from re-issuing a `prompt` that has no effect.

---

## Recommendations Summary

### Before PR (Must)
- [ ] Fix the supervisor session-directory cleanup race so `repository.tests` passes deterministically, then rerun the full registered gate, including the `repository.nmg-sdlc-smoke` delivery of #302
- [ ] Add the T008 hooks test for a stage worker's backgrounded Bash call being recorded and cleared

### Short Term (Should)
- [ ] Bound or clarify the `settleCommits` wait when a worker has written a fresh handoff but still has a stale background entry

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 1 | Medium: unbounded settle wait |
| `scripts/sdlc-execute-host.mjs` | 0 | |
| `src/execute-host.mjs`, `src/execute-host.d.mts` | 0 | |
| `hooks/register.ts` | 0 | |
| `hooks/register.test.ts` | 1 | Missing T008 coverage |
| `src/sdlc-verification-runtime.mjs` | 0 | |
| `scripts/sdlc-deliver.mjs`, `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-recover-verification.mjs` | 0 | 4 MB reader bound |
| `scripts/sdlc-execute-supervisor.mjs` (unchanged) | 1 | Critical: pre-existing cleanup race that fails the gate |
| `CHANGELOG.md`, `README.md`, version mirrors | 0 | |

---

## Recommendation

**Needs fixes**

The #546 behavior is implemented and its acceptance tests pass. The registered gate is not green at f8023162922301002d940dabef1f42750c7382e3: the required test suite fails on a pre-existing session-directory cleanup race, and that failure keeps the required live smoke from running. Route to implement to fix the race and add the missing T008 hooks test, then run the full registered gate again.
