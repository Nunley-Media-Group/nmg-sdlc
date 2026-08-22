# Requirements: Move start and execute orchestration into controllers behind sibling workers

**Issue**: #194
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces/

---

## User Story

**As a** Herdr OMP execute operator
**I want** start-issue and execute orchestration to run as deterministic Node controllers invoked by compact prompts
**So that** the model is not parsing Herdr JSON, fenced shell, and handoff schemas on every issue

---

## Background

`scripts/sdlc-execute.mjs` already implements `parseArgs`, backlog selection, spec approval, handoff validation, run-state IO, `nextStep`, and `workerPrompt`. The execute workflow still asks the main-pane model to operate that substrate and manage panes.

`workflows/start-issue/WORKFLOW.md` is a Node program in prose. The current contract still requires a sibling `s<N>-start` worker. Moving logic into a controller must not skip that worker or drop any current start failure modes.

`references/rewrite-contract.md` OMP Extension Surface: automated `/sdlc-*` remain `commands/*.md` print/RPC expansions; the extension does not own worker orchestration. Execute SDLC acceptance: each stage uses a sibling Herdr `--kind omp` session; product edits stay in the owning worker.

Issue #193 compacted injected Integration prose and froze prompt-byte ceilings. This issue adds `startIssue()` and `sdlc-execute.mjs run`, which #193 explicitly deferred.

---

## Acceptance Criteria

### AC1: start controller preserves every current start outcome

**Given** a sibling start worker with `$ARGUMENTS: #N`
**When** it runs the compact start workflow
**Then** it invokes `node scripts/start-issue.mjs --issue N` (new module; no equivalent exists)
**And** that controller performs parse, `gh issue view`, slug, dependency re-proof via `parseBodyRelationships`, dirty-tree, default-branch resolution, `gh issue develop`, best-effort Project In Progress, and writes `.omp/sdlc/handoffs/N-start.json`
**And** the worker prints `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/N-start.json` on every handoff write
**And** execute does not call `startIssue()` itself
**And** failed handoffs still use `reasonCode` values `no_issue_number`, `issue_unreadable`, `dependency_unreadable`, `dependency_blocked`, `dirty_tree`, `default_branch_unreadable`, `branch_checkout_failed` with `intervention: true` and `step: start`
**And** leftover `spike` labels still do not skip implement/verify
**And** Project status mutation remains best-effort (failure does not fail the handoff)

### AC2: execute controller preserves the current queue

**Given** `/sdlc-execute [#N ...]` in a Herdr OMP session
**When** the file command expands
**Then** the compact execute workflow requires `HERDR_ENV=1` plus `HERDR_SOCKET_PATH` and `HERDR_PANE_ID`, then runs `node scripts/sdlc-execute.mjs run` with the trimmed arguments and passes output through
**And** `run` owns preflight (`herdr integration status` omp line, `gh auth status`, dirty-tree fail-closed for a new issue), backlog/args (same `parseArgs` / `selectBacklog` rules, max 20 issues), `Run /sdlc-write-spec #N` stop when unapproved, `run.json`, pane split, `herdr agent start/prompt --wait`, stalled-prompt Enter recovery, handoff validate, close-vs-keep table, resume (no second worker if `s<N>-*` live), notification, default-branch sync before the next issue, and local branch delete only after MERGED+CLOSED
**And** the default blocking Herdr worker wait is never overridden with a shorter timeout and must tolerate at least one hour of continuous issue execution while a worker remains active
**And** existing helper CLIs still work
**And** `src/extension.ts` still does not register `/sdlc-execute`
**And** invalid args still print `Usage: /sdlc-execute [#N ...]` and stop non-zero
**And** missing omp integration still prints exactly `Run: herdr integration install omp` and stops with no mutations

### AC3: four sibling workers remain

**Given** issue N with an approved spec
**When** `run` executes the pipeline
**Then** it still launches `s<N>-start`, `s<N>-implement`, `s<N>-verify`, and `s<N>-deliver` as `--kind omp` workers
**And** `workerPrompt` still inlines the compact start workflow rather than executing start in-process
**And** implement still inlines write-code + simplify
**And** deliver still inlines open-pr + address-pr-comments until issue 195
**And** a failed or `intervention: true` handoff keeps that pane and stops the queue
**And** the execute pane still never edits product code, never implements tasks, and never opens PRs

### AC4: compact prompts do not drop documented Herdr behavior

**Given** the execute controller
**When** it splits and launches
**Then** it still uses `herdr pane layout --pane "$HERDR_PANE_ID"`, `herdr pane split --current --direction <right|down> --cwd "$PWD" --no-focus`, `herdr agent start s<N>-<step> --kind omp --pane <id>`, `herdr agent prompt ... --wait`, closes only panes this run created, and notifies with `herdr notification show "nmg-sdlc stopped" --body "Stopped on #<N> <step>. Worker pane <pane_id> agent s<N>-<step> left open." --sound request`
**And** split direction is still `right` when width >= height else `down`, missing dimension `down`
**And** agent names still match `^[a-z][a-z0-9_-]{0,31}$`, never `sdlc-` prefix, never `--kind pi`, never `herdr server stop`

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add `scripts/start-issue.mjs` exporting `slugFromTitle(title)`, `startIssue({ issue, cwd, run, fs })`, plus CLI `--issue N`. Inject `run` for `gh`/`git`. | Must | Empty slug becomes `issue`. CLI without valid `--issue` exits 2 with usage and `no_issue_number` JSON, no handoff file. |
| FR2 | Add `runExecute({ args, cwd, env, run, fs, herdr })` and CLI `run` on `scripts/sdlc-execute.mjs`. Keep existing helper CLIs. | Must | Do not import `startIssue`. |
| FR3 | Compact `workflows/start-issue/WORKFLOW.md` and `workflows/execute/WORKFLOW.md` to the invocation contracts in design.md. Regenerated `commands/sdlc-execute.md` must match. | Must | Keep YAML `name`/`description`. Keep `# Start Issue`. |
| FR4 | Tighten `sdlc-execute` automated-body and `start` worker-prompt ceilings to measured post-change UTF-8 size + 256 bytes. | Must | Leave implement/verify/deliver and other automated ceilings unchanged. |
| FR5 | Reuse `parseBodyRelationships`, `validateHandoff`, `writeRun`, `readRun`, `nextStep`, `workerPrompt`. Do not fork handoff schema. | Must | `STEP_EXTRA_WORKFLOWS` stays `{ implement: ['simplify'], deliver: ['address-pr-comments'] }`. |
| FR6 | No reduction of function versus the current execute and start workflows. If a controller path is incomplete, keep that path in the compact workflow rather than omit it. | Must | Move start-issue and stalled-prompt contract tests off workflow greps onto the controllers. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #194 | 2026-08-21 | Initial feature spec |
