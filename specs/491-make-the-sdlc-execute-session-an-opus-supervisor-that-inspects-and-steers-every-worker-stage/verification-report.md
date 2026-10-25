# Verification Report: Make the /sdlc-execute session an Opus supervisor that inspects and steers every worker stage

**Date**: 2026-10-24
**Issue**: #491
**Reviewer**: Claude Code (hand verification; no nmg-sdlc commands or subagents used)
**Scope**: Implementation verification against spec
**Verification head**: 3d9e0f8e08a0a5b63af6934e8d4995a84504c654

---

## Executive Summary

### Implementation Status: Pass
**Total Issues**: 1 (outside AC scope, pre-existing, recorded as a follow-up)

All 17 acceptance criteria pass. Evidence comes from Jest contract tests, hooks-module tests, validators, a headless `claude -p` exercise, a real Herdr TUI session for the model gate, and two live supervised deliveries against `Nunley-Media-Group/nmg-sdlc-smoke` (#217 → PR #240 and #215 → PR #241, both merged with the issue closed). The first live run found a defect: herdr reports `agent wait --timeout` on stderr, so check-in slices were mistaken for settlements. It was fixed in `scripts/sdlc-execute.mjs` (`timedOut`), and the second live run confirmed the fix with interval check-ins.

## Issue Scope

- Active issue: #491
- Spec: `specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC17]; FR [FR1–FR14]; tasks [T001–T008]; scenarios [SCN001–SCN017]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":491,"specPath":"specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11","AC12","AC13","AC14","AC15","AC16","AC17"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13","FR14"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014","SCN015","SCN016","SCN017"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Commands Run

| Command | Outcome |
|---------|---------|
| `node scripts/sdlc-verify-steering.mjs --project . --issue 491 --spec specs/491-… --base main` | passed: `ok: true`, `ceiling: null`, coverage declared 2, recorded 2, complete; `repository.tests` passed ("command exited 0"); `repository.nmg-sdlc-smoke` passed ("nmg-sdlc-smoke delivered #242"), at head `3d9e0f8e08a0a5b63af6934e8d4995a84504c654` |
| `cd scripts && CI=1 npm test -- --runInBand` | passed: 51 suites passed and 1 skipped; 1128 tests passed and 2 skipped (1130 total), exit 0 |
| `claude plugin test .` (`hooks/register.test.ts`) | passed: 32 pass, 0 fail |
| `node scripts/verify-plugin-surface.mjs --root . --label repository --claude-validate` | passed: `claude plugin validate passed`, surface validation passed |
| `node scripts/skill-inventory-audit.mjs --check` | passed: clean (90 items mapped) |
| `node scripts/verify-current-specs.mjs` | passed: 106 genuine issue specs |
| `node scripts/skill-exercise-runner.mjs --skill verify-code` | passed: 14 pass, 0 fail, 0 skipped |
| `git diff --check` | passed: exit 0 |
| `node scripts/exercise-claude.mjs --cwd <disposable git project> -- /sdlc-execute "#42"` | passed: exit 2, `nmg-sdlc: Run /sdlc-execute in the TUI.` (headless path unchanged) |
| Herdr TUI `claude --plugin-dir <checkout> --model sonnet`, then `/sdlc-execute #42` | passed: printed `/sdlc-execute requires an Opus session (current: claude-sonnet-5-5). Switch with /model opus and run /sdlc-execute again.`; the project gained no `.nmg-sdlc/` and no lease |
| Same TUI after `/model opus`, then `/sdlc-execute #42` | passed: the workflow was submitted, the session ran `sdlc-execute.mjs supervise "#42"`, and the controller returned its terminal result (`delivery_evidence_unavailable: #42`, no remote) with the lease released |
| Live run 1: Opus TUI on a smoke clone, `/sdlc-execute #217 --check-in-seconds 120` | delivered: PR #240 `MERGED` at `05948894fd39d026909c254e4d584afc319cd9c1`, #217 `CLOSED`; 9 stage reports and 9 decisions (4× accept, 5× prompt) |
| Live run 2: same session, `/sdlc-execute #215 --check-in-seconds 120` (with the stderr-timeout fix) | delivered: PR #241 `MERGED` at `21c94ac83bc5e2c3091bcdf21ddef010744f4c39`, #215 `CLOSED`; 5 stage reports, 2 interval check-ins, decisions 5× accept and 2× continue |

---

## Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | Pass | `hooks/register.ts` sets no override for a command without a table model, and `src/host-events.mjs` `SDLC_MODELS.commands` has no `sdlc-execute` entry. Tests: `hooks/register.test.ts` "a claude-opus-5-5 / claude-fable-5-1 / Opus 5.5 session runs sdlc-execute on its own model" (the step goes out on the session model); `scripts/__tests__/sdlc-commands.test.mjs` "assigns one model alias to every command except the session-model /sdlc-execute" (stages `haiku/haiku/opus/haiku`, repair `opus`). Live TUI: Opus session submitted the workflow. Live runs: start/implement/deliver workers on haiku, repair implement on opus |
| AC2 | Pass | `executeModelRefusal` in `src/host-events.mjs` and the gate in the `sdlc-execute` `command.run`. Tests: "a claude-sonnet-5-5 / claude-haiku-5-5 session is told to switch and stopped before anything renders" (exact text, `exitCode: 1`, no render, no prompt, no Bash). Live TUI Sonnet session printed the exact message, and the project had no `.nmg-sdlc/` afterwards |
| AC3 | Pass | Test "an unreadable session model fails closed as unknown" (`current: unknown`, exit 1, no render); `sdlc-commands.test.mjs` "lets only an Opus or Fable session model supervise /sdlc-execute" (undefined/null/empty/non-string → `unknown`) |
| AC4 | Pass | `superviseWorker` in `scripts/sdlc-execute.mjs`. Tests: `scripts/__tests__/sdlc-execute.test.mjs` "returns a stage report at every boundary before the pane closes or the next stage starts" (all fields, commits, `outsideSpecPaths: ['stray.txt']`, readiness) and "reports a verify stage with its readiness gaps and the report critical and remaining issues". Live run 2 report 2: verify readiness `blocked/implementation_non_pass` with the report's Remaining Issues table |
| AC5 | Pass | Tests "returns a stage report at every boundary…" (accept follows the existing routing; panes close) and "keeps an accepted stage pane open under --retain-worker". Live runs: accept advanced start→implement→verify→deliver |
| AC6 | Pass | Test "prompts the live worker and reports its fresh handoff before continuing". Live run 1: decisions 2, 3, 4, 6 and 8 prompted the live workers; reports 5, 7 and 9 followed with fresh handoffs from the same workers |
| AC7 | Pass | Tests "re-dispatches the stage with the supervisor guidance beside the failure evidence" and "re-dispatches a running worker from a check-in with the guidance" |
| AC8 | Pass | Test "re-runs verify at the same source head after an environmental failure, held to the full gate" (starts `verify, verify, deliver`; both verify workers at the same HEAD) |
| AC9 | Pass | Tests "halts with the diagnosis (retain worker: false/true)" (`supervisor_halt: host disk full`, exit 1, branch/HEAD unchanged, lease released, panes closed unless retained). CLI test `scripts/__tests__/sdlc-execute-supervisor.test.mjs` "yields stage reports across invocations with one live lease, then halts with cleanup" |
| AC10 | Pass | Test "keeps an environmental verify re-run from delivering until the registered gate is green" (accepted non-green verify → implement, never deliver); routing honors a forced verify only over deliver; the check-in tests never dispatch. Live run 2: the failed verify was accepted and went to implement; deliver ran only after gate `pass` |
| AC11 | Pass | Tests "checks in on a running worker each interval with its pane, marker and commits, and continues", "checks in as soon as the pane output stops changing, once per unchanged span" and "reports a stale waiting marker as a stall once". Live run 2 report 3: `checkin`/`interval` at 121 s with worker, pane, pane tail, commits and failure history |
| AC12 | Pass | Tests for continue (interval check-in tests), prompt ("queues check-in guidance to a busy worker…"), redispatch ("re-dispatches a running worker from a check-in…") and halt ("halts a running worker from a check-in"). Live run 2: two `continue` answers |
| AC13 | Pass | Test "queues check-in guidance to a busy worker and keeps waiting through it for the handoff". The prompt is sent without `--wait` (`defaultHerdr.agentPrompt`), delivery lands after the worker's current call, and the wait has no deadline |
| AC14 | Pass | `issueScopeMarker` and `--marker` in `scripts/issue-spec-scope.mjs`; `withScopeMarker` in `scripts/sdlc-finalize-verification.mjs`. Tests: `scripts/__tests__/sdlc-finalize-verification.test.mjs` "finalizes a passed gate whose hand-written issue-scope marker names scenario titles (#491)" (it fails without the rewrite, as checked) and the three `withScopeMarker`/`issueScopeMarker` cases. This report's marker is the `--marker` output |
| AC15 | Pass | The worker header in `src/sdlc-prompt-snippets.mjs`. Tests: `scripts/__tests__/sdlc-prompt-snippets.test.mjs` "forbids every execute worker from moving the shared checkout to read another ref (#491)" (start/implement/verify/deliver) and "renders the exact worker header" |
| AC16 | Pass | `bin/package.json` `{"type":"commonjs"}` in the fixture. Test: "runs the commonjs fixture commands under an ancestor \"type\": \"module\" package.json" (it fails without `bin/package.json`, as checked) |
| AC17 | Pass | `probeFailure` in `scripts/sdlc-execute.mjs`. Test: "names a real cause for every failed integration probe and never exit undefined" (null/undefined/non-object/status null → `probe returned no result`; thrown string; `exit 2`); existing probe test unchanged |

## Functional Requirements

FR1–FR3 follow AC1–AC3. FR4/FR5/FR7 follow AC4–AC13 and the supervisor CLI tests: the lease is the same record across `supervise`/`decide`, owned panes close on halt, and failure history appears in report 2. FR6 follows AC10. FR8: check-ins only read (`paneRead`, `lstat`, `git log/diff`). FR9: `workflows/execute/WORKFLOW.md`, exercised live in both runs, with the session never editing code. FR10: AC14. FR11: AC15. FR12: AC16. FR13: AC17. FR14: `README.md` "Supervision" section, model table and commands table.

## Architecture Review

| Area | Score | Notes |
|------|-------|-------|
| SOLID | 4 | Supervision is injected (`supervise` callback); the `run` path is unchanged |
| Security | 5 | Session files are 0600 and git-ignored, decisions are exclusive (`link`), arguments are passed as arrays |
| Performance | 5 | 30 s slices; pane reads only at check-ins |
| Testability | 5 | Clock, supervisor and Herdr are injectable; CLI fixtures cover yields |
| Error handling | 4 | Invalid decisions fail closed; a closed orchestrator pane halts; a lost daemon reports `controller_supervisor_lost` |

## Fixes Applied During Verification

- `scripts/sdlc-execute.mjs` `timedOut` now reads stderr. Herdr prints `{"error":{"code":"timeout"}}` there, and live run 1 showed stage reports firing while workers were still `working`. The test fixture now emits the timeout on stderr.

## Remaining Issues

| Severity | Location | Issue | Disposition |
|----------|----------|-------|-------------|
| Medium | `scripts/sdlc-execute.mjs` `branchCommits` (pre-existing) | Compares against the local default branch, so a stale local `main` makes a fresh issue branch look implemented and routes it to verify (seen in live run 2; one extra verify cycle, then correct repair) | Outside #491; follow-up issue |

## Overall Status

Pass
