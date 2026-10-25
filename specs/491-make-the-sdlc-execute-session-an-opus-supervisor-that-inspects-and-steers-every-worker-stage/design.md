# Design: Make the /sdlc-execute session an Opus supervisor that inspects and steers every worker stage

**Issue**: #491
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Overview

The orchestrator session becomes the supervisor of a detached controller. The controller keeps its lease, signal cleanup, owned panes and failure history in one long-lived process, and yields a report at every stage boundary and check-in. Each orchestrator `Bash` call starts, answers or resumes that controller and returns within a bounded wait (at most 540 s), so no call approaches the 600 s tool timeout. The headless `sdlc-execute.mjs run` path, used by the smoke gate and nested executions, is unchanged and runs to completion with the existing routing.

## Architecture

### Model gate (`hooks/register.ts`, `src/host-events.mjs`)

- `executeModelRefusal(model)` in `src/host-events.mjs` (Node-free) returns `null` when the lowercased model id contains `opus` or `fable`, and otherwise the exact AC2 text with `current: <model>`; a non-string or empty model reads as `unknown`.
- The `command.run` handler for `sdlc-execute` runs, after the existing headless refusal and before rendering, `$.session.model()` inside a `try`. A thrown read becomes `unknown`. A refusal returns `{ text, exitCode: 1 }`: nothing is rendered or submitted, so no Herdr, Git or GitHub call runs and no lease is taken.
- `SDLC_MODELS.commands["sdlc-execute"]` is removed. `startModelOverride` sets no override for a command without a table model, so the orchestrator's requests go out on the session model. `SDLC_MODELS.stages`, `SDLC_MODELS.repair` and `SDLC_EFFORTS` are untouched.

### Supervised controller loop (`scripts/sdlc-execute.mjs`)

`runExecute` takes an optional `supervise(report) → decision` callback, `checkInMs` and `now`. Without `supervise`, the loop behaves exactly as before: no reports, untimed waits. This is the `run` path. With `supervise`:

- **Stage boundary (AC4–AC10).** After `awaitWorkerHandoff` returns and before `close(pane)`, the controller builds a stage report and asks for a decision:
  - `accept` continues with the existing handoff processing and routing.
  - `prompt` sends the guidance with `agentPrompt`, waits for a fresh handoff from the same worker, and reports again.
  - `redispatch` closes the pane, records a failed handoff's failure packet, and sets a forced stage and guidance for the next dispatch. Routing still decides: a dirty or unpublished branch still goes to implement, and a forced `deliver` is only honored when routing already selects deliver (AC10). A forced `verify` after a failed verify skips the implement repair (AC8), and its result goes through the same registered-gate check.
  - `halt` throws `supervisor_halt: <diagnosis>`. The existing `finally` closes owned panes (unless `--retain-worker`) and releases the lease, and the result is non-zero (AC9).
- **Check-ins (AC11–AC13).** `awaitWorkerHandoff` waits with `agentWait({ timeout })` slices of at most 30 s. Each slice reads `herdr pane read <pane> --source recent --lines 40` and the `.waiting` marker's mtime, and yields a check-in report when the interval has passed since dispatch or the last check-in, or when the pane output or the marker has been unchanged for the interval (once per unchanged span). `continue` resumes waiting. `prompt` sends the guidance and keeps waiting. Herdr queues a prompt to a busy Claude worker until its current call finishes, and the wait that follows has no deadline (AC13). `redispatch` and `halt` behave as at a stage boundary.
- **Reports.** Reports are built from live evidence only. Commits come from `git log <before>..HEAD`. Changed paths come from `git diff --name-only <before>..HEAD`, compared against the spec's task `**File(s)**:` entries (`publicationFileEntries`) plus the spec directory. The gate status comes from `registeredGateStatus`, and failure history keeps the last 8 packets. Verify-stage reports also carry `inspectVerificationReadiness` `status`/`reasonCode`/`gaps` and the report's critical and remaining issues sections. Check-ins carry the pane tail, when it last changed, and the marker's command and age.
- **AC17.** The probe detail is `spawn error <code|message>`, `signal <name>`, `exit <status>` (numeric only), or `probe returned no result`.

### Detached sessions (`scripts/sdlc-execute-supervisor.mjs`, `scripts/sdlc-execute.mjs` CLI)

| Subcommand | Behavior |
|------------|----------|
| `supervise [--retain-worker] [--check-in-seconds N] [#N ...]` | Starts a session: a random session id travels as `NMG_SDLC_EXECUTE_SESSION` through bootstrap → daemon → controller. It waits for the first report, the result, or the wait budget |
| `decide --session S --seq N <accept\|continue\|prompt\|redispatch\|halt> [--text T]` | Validates the action against report N, writes `decision-N.json` exclusively, then waits for the next report or the result |
| `wait --session S` | Prints the pending report or waits for the next report or the result |
| `run [...]` | Unchanged: unsupervised, runs to completion |

- The session directory is `.nmg-sdlc/execute/<session>/`. It holds `daemon.json` (daemon pid), `report-N.json`, `decision-N.json` and `result.json`. Every file is written atomically (temp file plus rename or link).
- The daemon accepts an authenticated `detach` frame. After detach, losing the invoker's socket no longer cancels the run, which keeps the controller alive across yields. Before detach, loss still cancels, as today. The daemon always writes `result.json` when the controller finishes.
- The controller's `supervise` callback writes the report and polls for its decision every 500 ms. Every 60 s it confirms through `herdr pane list` that the orchestrator pane (`HERDR_PANE_ID`) still exists. If the pane is gone, the decision is `halt` with `orchestrator pane closed`, so a lost orchestrator never strands the lease.
- `SIGINT`/`SIGTERM` on a `decide` or `wait` invoker are forwarded to the recorded daemon pid, which keeps the existing cancellation semantics. A daemon that is gone with no `result.json` is reported as `controller_supervisor_lost`.
- The output for a report is `NMG_SDLC_EXECUTE_REPORT` with the pretty JSON report and the exact `decide` command lines for its allowed actions, exit 0. The wait-budget output is `NMG_SDLC_EXECUTE_RUNNING` with the `wait` command, exit 0. A terminal result passes the controller's stdout/stderr and exit status through and removes the session directory.
- `parseArgs` accepts `--check-in-seconds N` (integer 1–86400) at most once. `ARGUMENT_HINTS` documents it.

### Orchestrator workflow (`workflows/execute/WORKFLOW.md`)

The workflow invokes `supervise` instead of `run`. It reads every report and the artifacts it names (handoff, verification report, `git show`/`git diff` of the stage commits, pane output) and answers with exactly one `decide`. It uses `wait` after a running result, never edits product code, implements tasks, or opens PRs (FR9), and repairs only the environment before an AC8 verify re-dispatch.

### Resolver-produced scope marker (AC14)

- `issueScopeMarker(scope)` in `scripts/issue-spec-scope.mjs` returns the one-line `<!-- nmg-sdlc-issue-scope: {...} -->` marker of the normalized projection. `--marker` prints only that line.
- `sdlc-finalize-verification.mjs` rewrites the report's marker to the live resolver marker before readiness inspection. It replaces the first marker line, drops any duplicates, and inserts one after the `Issue Scope` heading when none exists. A malformed or mismatched hand-written marker therefore never fails a passed gate.
- `workflows/verify-code/references/report-format.md` and `checklists/report-template.md` tell the worker to paste the `--marker` output instead of composing the JSON.

### Shared-checkout rule (AC15)

The worker header in `src/sdlc-prompt-snippets.mjs`, rendered at the top of every execute worker prompt (start, implement, verify, deliver), forbids switching the shared checkout's branch or moving HEAD to read another ref, and names `git show <ref>:<path>`, `git diff <ref>...HEAD` and a separate `git worktree` as the alternatives. The start stage's own creation of the issue branch is its stage mutation.

### Test fixture (AC16)

The supervisor test fixture writes `{"type":"commonjs"}` to `<runtime>/bin/package.json`. A regression test runs the fixture under a temporary parent that holds a `"type": "module"` `package.json`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Detached daemon with file-based reports and decisions, bounded invoker waits | Selected | Reuses the authenticated bootstrap and daemon cleanup, keeps the synchronous controller, and survives any number of yields |
| Make `run` itself yield | Rejected | Breaks the smoke gate and nested executions, which need `run` to finish |
| Convert `runExecute` to async with IPC decisions | Rejected | Rewrites the whole synchronous controller and its tests for no behavioral gain |
| Background the single `run` Bash call | Rejected | Gives the session no decision point between stages |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #491 | 2026-10-24 | Initial feature design |
