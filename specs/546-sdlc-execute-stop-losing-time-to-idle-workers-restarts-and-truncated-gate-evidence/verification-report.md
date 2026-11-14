# Verification Report: /sdlc-execute: stop losing time to idle workers, restarts and truncated gate evidence

**Date**: 2026-11-14
**Issue**: #546
**Reviewer**: Claude Code (verify worker, architecture-reviewer)
**Scope**: Implementation verification against spec (re-verification after fix commit 677cc70)

**Verification head**: 677cc70119925203643f686ab5cb31232918b432

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.2 |

### Implementation Status: Pass

**Total Issues**: 1 (Medium, non-blocking)

All seven acceptance criteria are implemented and covered by passing tests. The registered gate is fully green at 677cc70: `repository.tests` passed (1313 passed, 2 skipped, 0 failed) and the live `repository.nmg-sdlc-smoke` gate delivered smoke issue #302 through PR #304, which is MERGED at its exact head, and the issue is CLOSED. Fix commit 677cc70 resolved both blockers from the previous verification at f802316:

- **Session-directory cleanup race.** The new `removeSessionDirectory` moves the directory aside before it removes it, and retries ENOTEMPTY.
- **Missing T008 hooks test.** `hooks/register.test.ts` now has a stage-worker background-tracking test.

One Medium design gap carries over as a non-blocking follow-up: the unsupervised wait on a stale background entry.

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

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

Runner: `sdlc-verify-steering.mjs --project . --issue 546 --spec specs/546-… --base main --controller-run-id ef3ce88d-df27-41a6-a6d5-2619e5c5e4cb` (exit 0, `ok: true`).

| Field | Value |
|-------|-------|
| Artifact | `.nmg-sdlc/verification/546.json` |
| generatedAt | 2026-11-14T00:51:18.265Z |
| identity.headSha | 677cc70119925203643f686ab5cb31232918b432 (tree clean) |
| steeringHash | sha256:dc2b05c4491273f1e9f0c828569905965ba9730b302e2af25f57dac2b497f483 |
| specHash | sha256:8498d31ebd6e2f1499d10ba2e63dfd2ba703c4821cba55e47b4406782b7389df |
| Coverage | declared 2, recorded 2, complete, no missing, duplicate or unknown results |
| Ceiling | none |

| Validation | Required | Result | Evidence |
|------------|----------|--------|----------|
| `repository.tests` (`npm test -- --runInBand` in `scripts/`) | yes | passed | `command exited 0`; Test Suites: 60 passed, 1 skipped (61); Tests: 1313 passed, 2 skipped (1315); 649.9 s |
| `repository.nmg-sdlc-smoke` | yes | passed | `nmg-sdlc-smoke delivered #302`: the closing-PR baseline for #302 was empty before the run. Headless `/sdlc-execute #302` (session f26bd628-5456-4648-aa18-2a5f9db0e48a) ran start, implement, verify and deliver, then reported `#302: MERGED and CLOSED`. Post-run proof: #302 CLOSED, closed by PR #304 MERGED at `a4d77f562e2feae1be23cf008b85d3fcd480f3ab` |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | An idle worker without a handoff is resumed before any stage report | Pass | `scripts/sdlc-execute.mjs` `awaitTurnEnd` sends the reminder through `host.append`. It waits with `waitFor({ until: 'started', since, timeoutMs: RESUME_POLL_MS })`, then waits for the resumed turn to settle before any stage report. The controller test "resumes a worker that settles without a handoff through append…" passes with no redispatch |
| AC2 | The stage report reflects the worker's last commit | Pass | `settleCommits` waits while `record.background` is non-empty or `<git-dir>/index.lock` exists. `headAfter` and `commits` are read only after that. The test "holds the stage report until a tracked background command clears…" passes |
| AC3 | A prompt reaches an idle worker or is refused with a reason code | Pass | The stage `prompt` loop sets `promptRefusal` to `stage_prompt_undelivered` or `stage_prompt_not_resumed`, and `decisions` filters out `prompt` while a refusal is set. The delivered-path test and both refusal tests pass |
| AC4 | A restart during a verify rerun at an unchanged head resumes verify | Pass | `writeGateIntent` writes `.nmg-sdlc/execute/gate-intent/<N>.json` (temp file plus rename) before every verify spawn. In routing, `liveGateIntent` sets `step = 'verify'` and skips `currentGateFailure`. The restart test passes |
| AC5 | A failed gate routes to implement only after it is accepted | Pass | `clearGateIntent` runs when a verify stage ends without a redispatch or halt. A newer gate result for the head also clears it, and an intent for another head is deleted. The accept-then-implement test passes, and the existing "diagnoses a previously failed exact-source gate" test still passes |
| AC6 | Gate evidence keeps failing test names and links the full log | Pass | `src/sdlc-verification-runtime.mjs` adds `tailBounded` (last 65536 characters with a `[truncated N characters]` prefix), `extractFailures` (pytest, Jest and TAP lines; at most 100 lines of at most 500 characters), and a full log at `.nmg-sdlc/verification/<N>/<id>.log`. It also records `headSha` and `failures`, and the summary names the first 10 failures. The 5 MB pytest test passes. `currentGateFailure` includes the failures and the log artifacts |
| AC7 | A check-in during a running background command does not report `activity_unchanged` | Pass | `src/execute-host.mjs` adds `recordBackgroundStart`, `clearBackground`, `backgroundTaskOf`, `recordStepStart`, and `activityRecord().background`. `hooks/register.ts` records a Bash `backgroundTaskId` for stage workers and clears it through `recordStepStart` on the next turn after the worker settles. `checkIn` suppresses `activity_unchanged` while a command is tracked. The Jest controller and agent-record tests pass, and the new hooks test passes |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Track stage workers' background commands | Complete | `src/execute-host.mjs` / `.d.mts`, `hooks/register.ts`. The transitions now live in shared Node-free helpers (`recordStepStart`, `backgroundTaskOf`, `SETTLED_AGENT_STATUSES`) |
| T002 | Resume idle worker; settle commits before the report | Complete | `scripts/sdlc-execute.mjs`, `scripts/sdlc-execute-host.mjs` (`until: 'started'`) |
| T003 | Reason-coded prompt refusals | Complete | |
| T004 | Gate intent and restart routing | Complete | |
| T005 | Tail-bounded output, logs, failures | Complete | The finalize, recover, deliver and execute readers accept artifacts up to 4 MB |
| T006 | Controller tests | Complete | 7 new tests in `sdlc-execute.test.mjs` |
| T007 | Gate-runner tests | Complete | 2 new tests in `sdlc-verification-runtime.test.mjs` |
| T008 | Agent-record and hooks tests | Complete | `execute-host.test.mjs` covers the agent record. `hooks/register.test.ts` adds "a stage worker's backgrounded Bash call is recorded, kept through its turn end, and cleared on its next turn". `claude plugin test .`: 55 pass, 0 fail |
| T009 | CHANGELOG entry | Complete | The bullet ends `(#546)`. Delivery commit f802316 rolled it under `## [4.12.0]`. `VERSION`, `package.json` and `.claude-plugin/plugin.json` are all 4.12.0 |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `awaitWorkerHandoff` is split into `awaitTurnEnd` and `settleCommits`. Gate-intent persistence is a small cohesive set of functions. Session-directory removal is one exported helper used by both cleanup sites |
| Open/Closed | 4 | `host.wait` gains a `started` mode without changing the existing modes |
| Liskov Substitution | 4 | Both host transports keep the same `wait`/`append`/`activity` shape |
| Interface Segregation | 4 | `activityRecord` adds one nullable field, and the type declarations are updated |
| Dependency Inversion | 4 | `run`, `waitFor` and `pause` are injected. The hooks module's record transitions are pure helpers in `src/execute-host.mjs` that tests call directly |

### Layer Separation

The hooks module still imports no Node built-ins. Background tracking and step-start transitions use the Node-free helpers in `src/execute-host.mjs`. Gate evidence shaping stays in the runtime library, and routing stays in the controller.

### Dependency Flow

Dependencies run from the controller to the host transport to the shared helpers. There are no new cycles.

---

## Security Assessment

- [x] Input validation: the log path is built from a manifest validation id that matches `ID_RE` and from a numeric issue, so it cannot traverse paths. The gate-intent reader checks the schema, issue, SHA and integer `dispatchedAt` against a 4 KB no-follow bound
- [x] Injection prevention: `git rev-parse --git-dir` runs through an argument array
- [x] Data protection: full command logs stay in the git-ignored `.nmg-sdlc/` runtime directory
- [x] Writes and deletion: the gate intent is written atomically. `removeSessionDirectory` renames the directory to a sibling `.removing-<session>-<pid>-<random>` before its recursive removal, so the deletion target is exact and stays inside `.nmg-sdlc/execute/`

---

## Performance Assessment

- [x] Bounded evidence: stream tails are capped at 65536 characters, with at most 100 failure lines of at most 500 characters each
- [x] `extractFailures` makes two linear scans per completed command, which is acceptable at the 5 MB scale tested
- [x] Reader bounds are raised consistently to 4 MB in all four artifact readers
- [x] Session cleanup retries are bounded (`maxRetries: 20`, `retryDelay: 25`)

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
| AC7 | Yes (SCN007) | Jest and hooks test | Yes |

### Coverage Summary

- Feature file: 7 scenarios. All 7 ACs are covered.
- Full Jest suite (registered gate): 1313 passed, 2 skipped, 0 failed
- Hooks module (`claude plugin test .`): 55 pass, 0 fail
- New race regression test: `removeSessionDirectory` holds through 5 attempts against a concurrent heartbeat writer

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | `git diff --name-only main...HEAD` shows no changed `workflows/`, `agents/` or `references/` file, so no skill exercise applies |
| **Live proof** | The `repository.nmg-sdlc-smoke` gate ran this checkout's `/sdlc-execute` headless against smoke issue #302. Start, implement, verify and deliver all ran as background stage subagents, and the run ended with PR #304 merged at its exact head and #302 closed |

### Smoke provisioning

The recorded issue `.nmg-sdlc/smoke/provisioned.json` (#302) was OPEN with `spec-created`, and its spec PR #303 "docs: approve spec for #302" was merged, so it was reused without drafting a new one. It is now delivered and CLOSED, so the next verification must provision a fresh issue.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | Exit 0. 1313 passed, 2 skipped |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Pass | #302 CLOSED. PR #304 MERGED at `a4d77f562e2feae1be23cf008b85d3fcd480f3ab`, outside the empty pre-run baseline |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check`: clean (90 items mapped) |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed |
| Skill creator validation | N/A | No skill-bundled file changed |
| Skill exercise | N/A | No changed skill fixture |
| Prompt quality | N/A | No skill contract changed |
| Git hygiene | Pass | `git diff --check main...HEAD`: exit 0 |

**Gate Summary**: 5/5 applicable gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| Critical (prior report) | Testing / Error Handling | `scripts/sdlc-execute-supervisor.mjs` | The recursive session-directory removal raced late bridge writes. It caused ENOTEMPTY errors or left the directory behind | Commit 677cc70 (implement stage) added `removeSessionDirectory`, which renames the directory aside, then removes it with ENOTEMPTY retries. Both cleanup sites use it, and a regression test covers it | direct |
| High (prior report) | Testing | `hooks/register.test.ts` | T008 hooks test missing | Commit 677cc70 added the stage-worker background-tracking test and moved the transitions into shared helpers | direct |

The verify worker made no edits in this run. Its publication scope covers only this report.

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Medium | Error Handling | `scripts/sdlc-execute.mjs` `settleCommits`; `src/execute-host.mjs` `recordStepStart` | A tracked background entry is cleared only when a settled worker starts a new turn, as FR7 specifies. Suppose a worker stops or awaits its background command in the same turn, writes a valid handoff, and settles with no follow-up turn. The entry then stays, and `settleCommits` waits for a turn that may never start. Supervised runs keep firing check-ins that name the command, and a supervisor `prompt` starts a new turn and clears the entry. Unsupervised runs only loop in check-in slices | This follows the approved FR7 contract. Changing it needs a design decision, such as clearing an entry when its task completes or bounding the settle once a fresh handoff exists. It was not observed in the live smoke run. Track it as a follow-up issue |

---

## Positive Observations

- Gate-intent routing is conservative: a dirty tree, an unimplemented branch or a needed implementation still route to implement.
- Gate evidence keeps the stream tails rather than the heads and links the full log, which is what a reader of a failed long test run needs.
- Reason-coded prompt refusals stop the supervisor from re-issuing a `prompt` that has no effect.
- The cleanup-race fix removes the cause instead of loosening test assertions, and has its own concurrent-writer regression test.

---

## Recommendations Summary

### Before PR (Must)
- None

### Short Term (Should)
- [ ] Bound or clarify the `settleCommits` wait for a worker that has written a fresh handoff but still has a stale background entry

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 1 | Medium: settle wait on a stale background entry |
| `scripts/sdlc-execute-host.mjs` | 0 | |
| `scripts/sdlc-execute-supervisor.mjs` | 0 | Race fixed by `removeSessionDirectory` |
| `src/execute-host.mjs`, `src/execute-host.d.mts` | 0 | |
| `hooks/register.ts`, `hooks/register.test.ts` | 0 | T008 covered |
| `src/sdlc-verification-runtime.mjs` | 0 | |
| `scripts/sdlc-deliver.mjs`, `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-recover-verification.mjs` | 0 | 4 MB reader bound |
| `scripts/__tests__/*` (execute, supervisor, host, verification runtime) | 0 | |
| `CHANGELOG.md`, `README.md`, version mirrors | 0 | |

---

## Recommendation

**Ready for PR**

The #546 behavior is implemented, all acceptance criteria pass, and the full registered gate is green at 677cc70119925203643f686ab5cb31232918b432, including the live smoke delivery of nmg-sdlc-smoke #302.
