# Design: Let /sdlc-execute take safe actions to keep delivery moving instead of halting

**Issue**: #526
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Overview

This is a workflow-text change to `workflows/execute/WORKFLOW.md`, which `renderInteractiveWorkflow('sdlc-execute', …)` in `src/sdlc-commands.mjs` renders into the supervising session's prompt (registry entry `plugin.workflow.execute` in `src/sdlc-prompt-snippets.mjs`). The controller (`scripts/sdlc-execute.mjs`), its `supervise`/`decide`/`wait` commands, the decision set (`accept`, `continue`, `prompt`, `redispatch`, `halt`), and the report output contract are unchanged. A new Jest contract test renders the workflow and asserts the new guidance.

## Architecture

Edits to `workflows/execute/WORKFLOW.md`:

| Location | Current | Change |
|----------|---------|--------|
| Intro prohibition paragraph | Forbids editing product code, implementing tasks, opening PRs, committing, pushing, `herdr server stop` | Keep, and state it also forbids editing specs or any other tracked repository file and bypassing branch protection or required checks, including while remediating |
| Output table, "Anything else" row | Report it and stop with its exit code | Report it. If the exit came from a transient or remediable condition (for example `pr_evidence_unavailable`, `execute_session_unknown`), apply the safe remediation and rerun `supervise` from the project root, which resumes from live evidence; otherwise stop with its exit code. Post-delivery cleanup warnings remain non-actionable |
| Supervise each report, step 2 | Classify as code, environmental, or stuck/drifting | Keep the classification, and add: whenever the supervisor can clear a blocker itself with a safe, reversible action, it does so under **Safe actions** before choosing a decision |
| Decision table, `halt` row | "No worker can fix it, or the person must act" | Limit to: a login or credential the person must enter interactively; a product or spec decision; an action that is destructive, irreversible, or touches shared or production systems; a blocker still present after a remediation based on a different hypothesis |
| `### Environmental verify failures` | Verify-only environment repair | Replace with `### Safe actions` (below) |
| New `### Hung worker processes` | — | Check-in guidance for AC5 (below) |
| `### Gates stay with the controller` | Full-green gate at exact source head | Unchanged |

`### Safe actions` content:

1. The rule: at any stage (start, implement, verify, deliver), on a stage report, a check-in report, or a non-report controller exit, the supervisor takes any action that is safe, reversible, and moves the issue toward delivery of its spec, without asking the person. It does not need the action to be listed; it asks itself whether the person would make the same fix and whether it is safe and reversible.
2. Safe and reversible means: it changes no tracked repository file, loses no work or data that cannot be regenerated, and touches no shared or production system.
3. Examples (illustrative, not exhaustive):
   - start or restart the local container/Kubernetes runtime (for example Rancher Desktop via `rdctl`)
   - boot an iOS simulator or Android emulator
   - restart a stopped host service or port forward
   - stop a hung test or build process the run itself started
   - add `.nmg-sdlc/` to `.git/info/exclude` when untracked plugin runtime is the only dirt
   - wait for a transient network or GitHub failure to clear, then rerun `supervise` (which resumes from live evidence)
   - wait for still-running required PR checks to finish, then `redispatch` deliver
   - run every `supervise`/`decide`/`wait` command from the project root
   - free regenerable caches when the disk is full
4. After the action, continue with `prompt` when the worker is live and can proceed in place, `redispatch` the same stage with guidance that names the fix, or rerun `supervise` when the controller already exited.
5. Hard boundaries regardless of the rule: never edit product code, specs, or other tracked repository files, never commit, push, or open PRs, never bypass branch protection or required checks, and never run `herdr server stop`. A redispatched stage is held to the same full registered gate at the exact source head.
6. When the same blocker remains after an action, try one based on a different hypothesis; `halt` with the diagnosis when a blocker remains after that, or when the blocker matches a `halt` case.

`### Hung worker processes` content: when a check-in shows no pane or token progress while a process the worker started has used about 0% CPU for several minutes, check that process's activity (for example `ps -o pid,pcpu,etime,command` on macOS or Linux) instead of answering `continue` again; then either stop the hung process and `prompt` the worker with that diagnosis, or `prompt` the worker with the diagnosis so it stops and reruns it.

`README.md` (execute supervision section, current "A verify failure caused by the host environment…" paragraph) is updated to describe stage-independent safe remediation and the narrowed `halt`. `CHANGELOG.md` `[Unreleased]` gains one bullet ending `(#526)`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `renderInteractiveWorkflow('sdlc-execute', root, '')` | plugin root | rendered workflow text | Contains the Safe actions rule and non-exhaustive examples, the narrowed `halt` cases, preserved prohibitions, the rerun-`supervise` exit guidance, and hung-process guidance; no longer contains `### Environmental verify failures` |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| General safe/reversible/progressing rule with illustrative examples in `WORKFLOW.md` | Selected | The supervisor should clear any blocker the person would clear themselves, not only listed ones; the workflow stays well under 500 lines |
| Exhaustive allowlist of permitted actions | Rejected | Would halt on safe blockers nobody anticipated, which is the problem the issue describes |
| Move remediation guidance to `workflows/execute/references/` | Rejected | The guidance is needed on every report, not a rarely reached branch |
| Controller retry/cwd-normalization changes | Rejected | Explicitly out of scope in the issue |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #526 | 2026-10-26 | Initial feature design |
