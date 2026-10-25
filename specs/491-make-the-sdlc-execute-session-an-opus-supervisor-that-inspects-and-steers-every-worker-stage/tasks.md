# Tasks: Make the /sdlc-execute session an Opus supervisor that inspects and steers every worker stage

**Issue**: #491
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Implementation Tasks

### T001: Gate /sdlc-execute on an Opus or Fable session model

**File(s)**: `src/host-events.mjs`, `src/host-events.d.mts`, `src/sdlc-commands.mjs`, `hooks/register.ts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC2/AC3/FR1: `executeModelRefusal(model)` returns `null` for a model id containing `opus` or `fable` (any case), and otherwise the exact AC2 text, with `unknown` for a missing or empty model. The `sdlc-execute` `command.run` handler returns that text with exit code 1 before rendering or submitting anything; a thrown `$.session.model()` reads as `unknown`.
- AC1/FR2: `SDLC_MODELS.commands` has no `sdlc-execute` entry, and `startModelOverride` sets no override for a command without a table model.
- AC1/FR3: `SDLC_MODELS.stages`, `SDLC_MODELS.repair` and `SDLC_EFFORTS` are unchanged.

### T002: Supervise stage boundaries and running workers in the controller

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC4/FR4: with a `supervise` callback, every worker settlement (handoff or none) yields a stage report before `close(pane)`, carrying issue, stage, worker, pane, handoff, HEAD before and after, commits and out-of-spec paths, gate status, and failure history. Verify reports add readiness `status`/`reasonCode`/`gaps` and the report's critical and remaining issues.
- AC5/AC6/AC7/AC8/AC9/FR5/FR6: `accept` keeps the existing routing; `prompt` delivers guidance and reports the same worker's fresh handoff; `redispatch` closes the pane and starts the stage again (or implement when routing requires it) with the guidance in its instructions; a verify redispatch after a failed verify skips the implement repair; `halt` fails with `supervisor_halt: <diagnosis>` through the existing cleanup.
- AC10/FR6: a forced deliver is honored only when routing selects deliver; accepting a non-green verify never dispatches deliver.
- AC11/AC12/AC13/FR7/FR8: timed `agentWait` slices of at most 30 s, check-in reports on the interval or on unchanged pane output or `.waiting` marker, and `continue`/`prompt`/`redispatch`/`halt` answers; check-ins only read state unless the answer acts.
- AC17/FR13: the integration-probe detail names a spawn error, signal, numeric exit status, or `probe returned no result`.
- `parseArgs` accepts `--check-in-seconds N` once; without `supervise`, `runExecute` behaves as before.

### T003: Keep supervised sessions alive across yields

**File(s)**: `scripts/sdlc-execute-supervisor.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- FR4/FR7: `supervise`, `decide` and `wait` run as described in the design. Session files live under `.nmg-sdlc/execute/<session>/` and are written atomically. The daemon ignores invoker loss only after an authenticated `detach`, and always writes `result.json`.
- No invocation waits longer than its budget (default 540 s, at most 540 s); a report or a running notice returns exit 0, and a terminal result passes the controller's output and status through.
- AC9: the controller's decision wait halts with `orchestrator pane closed` when the orchestrator pane is gone; `SIGINT`/`SIGTERM` on `decide`/`wait` cancel through the daemon.
- `run` and its existing cancellation and cleanup behavior are unchanged.

### T004: Make the execute workflow a supervisor

**File(s)**: `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- FR9: the workflow invokes `supervise`, inspects every stage and check-in report and its artifacts, answers each with exactly one `decide`, resumes with `wait`, and never edits product code, implements tasks or opens PRs.
- AC8: the workflow allows environment repair only before a verify re-dispatch judged environmental.
- The edit is made after invoking the `skill-creator` skill with the `Skill` tool.

### T005: Produce the issue-scope marker from the resolver

**File(s)**: `scripts/issue-spec-scope.mjs`, `scripts/sdlc-finalize-verification.mjs`, `workflows/verify-code/references/report-format.md`, `workflows/verify-code/checklists/report-template.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC14/FR10: `issueScopeMarker(scope)` and `--marker` print the normalized marker. The finalizer rewrites the report's marker to the live resolver marker before readiness, so a hand-written marker with scenario titles still finalizes a passed gate.
- The workflow references tell the worker to paste the `--marker` output; edited after invoking the `skill-creator` skill.

### T006: Forbid moving the shared checkout's branch in every execute worker

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC15/FR11: the worker header rendered for `worker:start`, `worker:implement`, `worker:verify` and `worker:deliver` forbids switching the shared checkout's branch or moving HEAD to read another ref, and names `git show`, `git diff <ref>...HEAD` and `git worktree`.

### T007: Cover the behavior with tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-execute-supervisor.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/plugin-commands.test.mjs`, `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`, `hooks/register.test.ts`
**Type**: Modify
**Depends**: T001, T002, T003, T005, T006
**Acceptance**:
- AC1–AC3: hooks tests cover Opus, Fable, Sonnet, Haiku and unreadable models, with no render or submit on refusal, and no override on Opus.
- AC4–AC13, AC17: controller tests cover each decision, check-in triggers, queued guidance, the gate, and probe details.
- FR4/FR7: supervisor CLI tests cover a yield, a `decide accept`, a `halt`, and the lease surviving across yields.
- AC16/FR12: the fixture writes `bin/package.json` as commonjs, and a regression test runs under an ancestor `"type": "module"` `package.json`.
- AC14/AC15: the finalizer and prompt-snippet tests cover marker rewriting and the header rule.
- `cd scripts && npm test` and `claude plugin test .` pass.

### T008: Document the supervisor

**File(s)**: `README.md`, `CHANGELOG.md`, `steering/snippets/project-tech.md`
**Type**: Modify
**Depends**: T001, T003
**Acceptance**:
- FR14: README documents the Opus requirement, stage-boundary supervision, the decisions, periodic check-ins and `--check-in-seconds`, and the model table no longer lists a Haiku controller session.
- CHANGELOG `[Unreleased]` has an entry; technical steering lists the execute model gate among hooks-module responsibilities.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #491 | 2026-10-24 | Initial feature tasks |
