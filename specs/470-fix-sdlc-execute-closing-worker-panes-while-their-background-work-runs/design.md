# Root Cause Analysis: Fix sdlc-execute closing worker panes while their background work runs

**Issue**: #470
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/464-run-each-sdlc-step-on-its-assigned-claude-code-model/

## Root Cause

`runExecute` in `scripts/sdlc-execute.mjs` supervises a worker in two calls. `api.agentWait({ name, until: 'working' })` is followed by `api.agentWait({ name })`, and the second call returns at the first settled `idle`, `done`, or `blocked` state. The controller then reads the handoff and calls `close(pane)` immediately. Herdr's agent contract says `idle` and `done` mean only "ready for input", and that a settled-state wait "is not proof those [background] jobs have finished". A Claude Code worker ends its turn while a `run_in_background` command keeps running, and that command's completion notification resumes the turn. Closing the pane at that point ends the Claude Code session along with the background command. `sdlc-verify-steering.mjs` receives SIGTERM and records `command cancelled`.

In #464 the verify worker started the gate in the background at 07:53:32 and ended its turn at 07:55:26.33 to wait. The verification artifact is stamped 07:55:26.92.

Two step-selection defects compound the loss:

- On an issue branch that is clean and published, step selection chooses `verify` whenever the gate is not green, without checking that the branch has any commits. After `start` the branch head equals the default branch, so verify runs on nothing.
- The missing-handoff path sets `needsImplement = after.head === current.head && ['implement', 'verify'].includes(step)`. A lost verify handoff therefore becomes an implement repair whose prompt asks for "a different measurable repair". In #464 that produced an inaccurate steering commit.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-execute.mjs` | worker dispatch in `runExecute` | Closes the pane at the first settled state |
| `scripts/sdlc-execute.mjs` | step selection in `runExecute` | Verifies a branch with no commits |
| `scripts/sdlc-execute.mjs` | missing-handoff branch | Routes a lost verify handoff to implement |
| `scripts/sdlc-execute.mjs` | `defaultHerdr().agentWait` | Has no `--timeout` for polling |
| `src/sdlc-prompt-snippets.mjs` | `WORKER_HEADER` | Gives workers no way to say they are still waiting |

## Fix Strategy

- Add `awaitWorkerHandoff({ api, name, cwd, issue, step, prior })`. After the initial `until: 'working'` wait it loops:
  1. Wait for a settled state. A fresh handoff, or any state other than `idle` or `done`, returns immediately. That covers process loss and `blocked` (AC3).
  2. If `<handoff path>.waiting` is a non-empty regular file, poll `agentWait({ until: 'working', timeout: RESUME_POLL_MS })` while the worker stays settled and the marker exists. Each poll rechecks for a fresh handoff. Once the worker is `working` again, remove the marker, clear the reminder flag, and continue the loop (AC1, FR3).
  3. Otherwise, send one reminder prompt per resumption that names both paths. A second settled state with neither file returns as today (AC2).
- Remove a stale marker before each dispatch (FR2).
- In step selection, dispatch `implement` when `git rev-list --count <default>..HEAD` is `0` and this invocation has not already passed implement at that head. If the default branch or the count cannot be read, keep the current behavior (AC4).
- Set `needsImplement` on a missing handoff only for `implement` (AC5).
- Add one header line telling a worker to write the marker before ending a turn while its background command runs (FR1).
- `defaultHerdr().agentWait` appends `--timeout <ms>` when given (FR4).

## Risks

- A worker that writes the marker and never resumes is waited on indefinitely. That matches the contract that verification commands have no wall-clock deadline. Explicit cancellation still closes the owned pane, and process loss ends the wait on the next poll.
- The implemented-head guard stops an implement worker that finds nothing to change from looping on an empty branch.
