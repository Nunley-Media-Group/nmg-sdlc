# Design: Track /sdlc-execute's queued issues with a Claude Code /goal

**Issue**: #529
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Overview

Only the hooks module can run `/goal`. It cannot run it from inside the `/sdlc-execute` dispatch or from inside a tool call the turn waits on. For bare runs, the issue set is known only after branch detection or the picker. The run therefore sets its goal through a handshake:

1. Once the workflow has resolved its issue set, it runs `node "<plugin-root>/scripts/sdlc-execute.mjs" goal [#N ...]` and ends its turn with no further action.
2. The hooks module reads that call's JSON result and records the issues as pending.
3. When that main-loop turn completes, the hooks module runs `/goal <condition>` with `void $.command.run(...)`, using the existing `submitContinuation` pattern. `/goal` starts the goal's own turn, with the condition as its directive, and in that turn the session runs `supervise`.
4. While the execute run has no goal set, the hooks module refuses any `supervise` Bash call with `{ deny }`. That guarantees the goal exists before supervision, so the goal never races the workflow prompt or an in-flight `supervise` call.

## Architecture

### `src/host-events.mjs` (Node-free, unit-tested)

- `EXECUTE_GOAL_MAX_ISSUES = 20`, matching the cap in the controller's `parseArgs`.
- `executeGoalCondition(issues)` returns the condition string for a non-empty array of up to 20 distinct positive safe integers, in the given order, and returns `null` for anything else. The text is:

  `/sdlc-execute is delivering #A, #B in this order. Keep supervising its controller with supervise, decide and wait as the execute workflow directs, starting with the supervise command for these issues. This goal is met only when your replies in this conversation contain the line "#A: MERGED and CLOSED" and the line "#B: MERGED and CLOSED", or contain a line beginning "/sdlc-execute stopped:" followed by the halt or controller-exit diagnosis.`
- `executeGoalRequest({ command, stdout })` returns the issues when `command` invokes `sdlc-execute.mjs goal` and `soleJsonObject(stdout)` is `{ ok: true, issues }` with issues accepted by `executeGoalCondition`. Otherwise it returns `null`.
- `isExecuteSuperviseCommand(command)` returns true when a Bash command invokes `sdlc-execute.mjs supervise`, whatever the quoting or root spelling (the same approach as `WRITE_SPEC_MERGE_RE`).
- `executeGoalStoppedLine(reason)` returns the one-line failure `/sdlc-execute stopped: goal_unavailable: <reason>` (newlines collapsed).

### `scripts/sdlc-execute.mjs` `goal` subcommand

`goal [--retain-worker] [--check-in-seconds N] [#N ...]` parses its arguments with `parseArgs` and ignores the flags. With issue tokens it prints `{"ok":true,"issues":[...],"condition":"..."}`, the issues in token order. With no tokens it reads `git branch --show-current`. When `parseIssueBranch` recognizes the branch, it prints that single issue. Otherwise it prints `{"ok":false,"reasonCode":"goal_issues_unresolved"}` and exits 1. It reads no GitHub state and changes nothing.

### `hooks/register.ts`

State: `execute = { active, pendingIssues: number[] | null, goalSet }`.

- `/sdlc-execute` `command.run`, after the existing headless and model refusals and a successful render: `execute = { active: true, pendingIssues: null, goalSet: false }`. Starting any other interactive command sets `execute.active = false`.
- Bash `tool.call`: when `execute.active && !execute.goalSet && isExecuteSuperviseCommand(command)`, return `{ deny: 'NMG SDLC: /sdlc-execute sets its /goal before supervise. Run sdlc-execute.mjs goal with the resolved issues and end your turn.' }` without calling `next`. After `next`, `executeGoalRequest({ command, stdout })` sets `execute.pendingIssues` when the run is active.
- `turn.complete` (main loop only): when `execute.pendingIssues` is set, clear it. If the turn was aborted or ended with an error, do nothing more. Otherwise call `void setExecuteGoal($, issues)`.
- `setExecuteGoal`: if `(await $.command.list())` has no `goal` command, fail with reason `goal command unavailable`. Otherwise set `execute.goalSet = true` before `await $.command.run({ command: 'goal', args: executeGoalCondition(issues) })`, so the goal turn's `supervise` passes the gate. When the call rejects, set `goalSet = false`. On any failure, keep refusing `supervise` and `void $.prompt.submit({ text: 'NMG SDLC: setting the /goal failed. Print exactly this line and stop without running supervise: ' + executeGoalStoppedLine(reason) })`.

### `workflows/execute/WORKFLOW.md`

- A new **Set the goal** section, reached from every path once the issue set is resolved and before `supervise`:
  1. Run `goal` with the same issue tokens that `supervise` will get. A bare run on an issue branch passes no tokens.
  2. If it returns `ok: false`, print its `reasonCode` and stop.
  3. Otherwise end the turn with no further action. The hooks module sets the `/goal`, and the goal's turn runs `supervise` with those tokens plus any `--retain-worker` / `--check-in-seconds`.
  4. A `supervise` refused for a missing goal means the turn must end now.
  5. When a hooks-module prompt reports a goal failure, print its line and stop.
- Terminal output rules:
  - After the controller finishes, repeat every `#N: MERGED and CLOSED` line verbatim in the reply.
  - On a `halt` decision or a non-remediable controller exit, print `/sdlc-execute stopped: <diagnosis>` as the reply's last line.
  - The person can run `/goal clear` to stop the goal-driven continuation.
- **Select specified issues** step 7 and the explicit-token and branch paths of **Start** route through **Set the goal** instead of calling `supervise` directly.

### `README.md`

The `/sdlc-execute` section gains a paragraph covering four points:
- the goal names every queued issue;
- it is met by the `#N: MERGED and CLOSED` lines or a `/sdlc-execute stopped:` line;
- a run that cannot set it stops with `/sdlc-execute stopped: goal_unavailable: <reason>`;
- `/goal` shows its status and `/goal clear` stops it.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `sdlc-execute.mjs goal` | optional flags and `#N` tokens | `{ok:true,issues,condition}` exit 0; `{ok:false,reasonCode:"goal_issues_unresolved"}` exit 1; usage on stderr, exit 2 | Resolves the run's issues without mutation |
| `executeGoalCondition(issues)` | number[] | string ≤ 4,000 chars or `null` | Builds the goal condition |
| `executeGoalRequest({command, stdout})` | Bash command and stdout | number[] or `null` | Classifies a `goal` helper result |
| `isExecuteSuperviseCommand(command)` | string | boolean | Detects a `supervise` call |
| `executeGoalStoppedLine(reason)` | string | string | Builds the one-line goal failure |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Run `/goal` in the `/sdlc-execute` timer before submitting the workflow | Rejected | `/goal` starts its own turn with only the condition, ahead of the workflow prompt, and bare runs have no issue set yet |
| Run `/goal` inside the `supervise` Bash `tool.call` | Rejected | `$.command.run` rejects inside a hook the turn waits on |
| Handshake through a `goal` helper, `turn.complete`, and a `supervise` gate | Selected | Works the same for all three resolution paths, sets the goal only when the session is idle, and enforces "goal before supervise" deterministically |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #529 | 2026-10-26 | Initial feature design |
