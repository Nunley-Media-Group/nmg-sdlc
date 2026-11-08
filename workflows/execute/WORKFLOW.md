---
name: execute
description: "Supervise automated delivery for approved, spec-created issues from an Opus session. Branch-first: bare on issue branch selects/resumes it immediately; explicit #N uses start-issue worker when necessary then implement/verify/deliver. On non-issue bare offers picker. Four stages only (start if nec, implement, verify, deliver). The session inspects every stage and check-in report and answers it: accept, prompt the live worker, re-dispatch with guidance, or halt. Ordinary resume from live branch content and verification evidence. Use when the user says execute, ship specified issues, /sdlc-execute, or passes issue numbers. Do NOT use to draft issues or write specs."
---

# Execute

Supervising orchestrator. Runs in the main Claude Code session on the session's Opus or Fable model (the hooks module refuses any other model before this workflow starts). Delegates all work to stage workers. The hooks module starts each stage as a background subagent, not through this session's `Agent` tool, so this session never runs a stage itself. A deterministic controller owns routing, the lease, publication checks, version preparation and the full-green gate. This session is its judgment: it reads what each worker did and decides what happens next. Full-green verification is the only merge route, and no decision can bypass it.

Never edit product code, specs, or any other tracked repository file, implement tasks, open PRs, commit, or push in this session, or bypass branch protection or required checks (including while remediating). Those belong to the workers and the controller; doing them here would bypass the evidence the gate checks.

## Stage workers

The hooks module runs each stage as a background subagent named `nmg-sdlc:execute-<entry>`. Its system prompt is the body of the matching agent file, without frontmatter:

| Stage | Entry | Agent file |
|-------|-------|------------|
| start | `execute-start` | `agents/starter.md` |
| implement | `execute-implement` | `agents/spec-implementer.md` |
| verify | `execute-verify` | `agents/architecture-reviewer.md` |
| deliver | `execute-deliver` | `agents/deliverer.md` |

A `redispatch` decision uses the `repair` entry (`nmg-sdlc:execute-repair`) with the same agent file as the stage it re-runs. The controller sends each worker the full inlined workflow as its spawn prompt, so the agent file only sets the worker's role and handoff contract. The stage's model and effort come from `steering/sdlc-models.json`, and its permission mode from `NMG_SDLC_WORKER_PERMISSION_MODE` (default `auto`).

## Start

Trim `$ARGUMENTS`. The argument hint is `[--check-in-seconds N] [#N ...]`:

- `--check-in-seconds N` sets the check-in interval in whole seconds, from 1 to 86400. The default is 300. Accept it at most once.
- `--retain-worker` is removed. Any other flag, and any token that is not an issue number, is a usage error. On a usage error, print `Usage: /sdlc-execute [--check-in-seconds N] [#N ...]` and stop with no mutation and no `goal` or `supervise` call.
- Remaining tokens are issue numbers, written `#N`.

`/sdlc-execute --result` is not a run. The hooks module answers it from the recorded result, so it never reaches this workflow. See **Headless runs**.

Controller paths (`<plugin-root>/scripts/...`) name the installed nmg-sdlc plugin: the rendered workflow materializes them, and the nmg-sdlc hooks module materializes them in `Bash` commands, so invoke controllers exactly as written.

- With issue tokens, follow **Set the goal** with every trimmed token.
- Bare on a branch that `parseIssueBranch` recognizes (`N-*`), follow **Set the goal** with no issue tokens; the controller selects that issue and resumes it from live evidence.
- Bare on a non-issue branch, follow **Select specified issues** below.

Every `supervise`, `decide` and `wait` call returns within nine minutes, inside the `Bash` tool timeout, so run them in the foreground. `supervise` first prints `NMG_SDLC_EXECUTE_SESSION: <uuid>`. Keep that session id for every later `wait` and `decide`. After it, each call prints exactly one of:

| Output | Meaning | Next |
|--------|---------|------|
| `NMG_SDLC_EXECUTE_REPORT: session S seq N (...)` + JSON + `decide` commands | A stage worker settled (stage report), or a running stage is at a check-in (check-in report) | Inspect it, then run one `decide` command |
| `NMG_SDLC_EXECUTE_WORKER: {"issue","stage","agentId"}` | A stage subagent is running and no report is pending | End your turn. See **Subagent turns** |
| `NMG_SDLC_EXECUTE_RUNNING: session S ...` | No new report yet; the controller is still working | Run the printed `wait --session S` command |
| Anything else | The controller finished; its stdout and stderr are passed through | Report it. If the exit came from a transient or remediable condition (for example `pr_evidence_unavailable` or `execute_session_unknown`), apply the safe remediation under **Safe actions** and rerun `supervise` from the project root, which resumes from live evidence. Otherwise stop with its exit code |

The controller validates `steering/sdlc-models.json` before it calls Git, GitHub, or any stage worker. When that file is absent or lacks keys, a finished controller's output starts with one `Warning: steering/sdlc-models.json …` line. Pass it through with the rest of the output: it means plugin defaults are in use, not a failure, and it does not change the exit code. When the controller exits 2 with stderr beginning `steering/sdlc-models.json:`, the stage configuration is invalid. Stop and print that line, which names the file, the key, and the value, so the person can fix that key. This session never edits the file.

A finished controller's stdout may also include post-delivery cleanup lines after `#N: MERGED and CLOSED`: `#N: branch cleanup: deleted <branch> and fast-forwarded <default>` on success, or a warning `#N: branch cleanup skipped: <reasonCode>` or `#N: remote branch cleanup skipped: <reasonCode>`. Pass these lines through with the rest of the output. A cleanup warning is not a delivery failure: it does not change the exit code or the delivery result, so do not rerun, repair, or halt because of it. Do not clean up the branch or the default checkout by hand; the controller owns that step.

## Subagent turns

A stage subagent runs in the background while this session waits. Do not poll it, and do not call `wait` in a loop.

1. When `supervise`, `wait` or `decide` prints `NMG_SDLC_EXECUTE_WORKER`, end your turn with no further tool call. The hooks module resumes this session when the subagent hands back or a check-in notice arrives.
2. A stage hand-back means run `wait --session <id> --after <seq>` with the session id and sequence it gives you. A check-in notice prints the exact command, reading `nmg-sdlc /sdlc-execute report <seq> is waiting. Run: ... wait --session <id> --after <after>`. Run that command as printed.
3. Read the output as in the table above. A stage report or check-in report waits for one `decide`.

## Set the goal

Every path reaches this section once its issue set is resolved, before any `supervise` call. The hooks module refuses `supervise` until the run's `/goal` is set. Supervision therefore never runs without a goal that names the whole queue, and that goal can be judged from the conversation alone.

1. Run `node "<plugin-root>/scripts/sdlc-execute.mjs" goal` with the same issue tokens that `supervise` will receive: the trimmed explicit tokens, the resolved numbers in order, or no tokens on a bare issue branch.
2. If its JSON has `"ok": false`, print its `reasonCode` and stop without calling `supervise`. The helper reports `goal_issues_unresolved` when a bare run is not on an issue branch.
3. Otherwise end your turn with no further action. Do not run `/goal` yourself: the hooks module sets it after this turn ends, and the goal's own turn starts supervision.
4. In the goal's turn, run `supervise` with the same tokens as step 1, followed by `--check-in-seconds N` when present in `$ARGUMENTS`. Then supervise its reports as below.
5. A `supervise` call refused because no goal is set means this turn must end now. Do not retry it in the same turn.
6. When a hooks-module prompt reports `/sdlc-execute stopped: goal_unavailable: <reason>`, print that line exactly and stop. The refused `supervise` never runs.

A run that resolves no issue set stops in **Select specified issues** and never reaches this section, so it sets no goal.

### Completion and stop lines

The goal is judged from your replies alone, so print the completion lines in the reply itself:

- After the controller finishes, repeat every `#N: MERGED and CLOSED` line from its output verbatim in your reply.
- On a `halt` decision or a non-remediable controller exit, print `/sdlc-execute stopped: <diagnosis>` as the reply's last line.
- The person can run `/goal clear` to stop the goal-driven continuation.

## Headless runs

A headless run starts the controller from the command line and keeps its process alive until the controller finishes.

- Start one with `claude -p --session-id <uuid> --plugin-dir <nmg-sdlc checkout> "/sdlc-execute #N"` on an Opus or Fable model. Choose the `<uuid>` yourself so the result can be recovered later.
- The run's last output is the controller's final result lines: `#N: MERGED and CLOSED` for each delivered issue, or `/sdlc-execute stopped: <diagnosis>`.
- `claude -p --resume <uuid> "/sdlc-execute --result"` prints those recorded lines and exits with the controller's exit status. The record is `.nmg-sdlc/execute/results/<uuid>.json`. When no record exists, it prints `No /sdlc-execute result is recorded for session <uuid>.` and exits 2. It changes nothing.
- Only `/sdlc-execute` runs headless. Interactive commands, such as `/sdlc-draft-issue` and `/sdlc-write-spec`, need the TUI's plan and question tools: headless, they print `Run /<name> in the TUI.` and exit 2.

## Supervise each report

Keep the session id. Answer every report before doing anything else, because the controller waits for your decision.

1. Read the whole report. Then inspect the artifacts it names, read-only: the handoff and its artifacts, `git show --stat <sha>` or `git diff <headBefore>..<headAfter>` for the stage's commits, the verification report and readiness `gaps` after verify, and `activity` and `waiting` at a check-in. Treat `outsideSpecPaths` as a signal to explain: a worker that changed files the spec does not declare may be drifting.
2. Diagnose before deciding: what did the worker do, did it do what the stage needed, and is anything blocking it? Classify a failure as code (the repository must change), environmental (outside the repository, such as a host tool, network, credential or disk), or a stuck or drifting worker. Whenever you can clear a blocker yourself with a safe, reversible action, do it under **Safe actions** before choosing a decision.
3. Choose exactly one decision and run its printed command, with `--text` for every decision except `accept` and `continue`:

| Decision | Offered at | Use it when |
|----------|------------|-------------|
| `accept` | stage | The result is sound (passed or truthfully failed) and the controller's routing should proceed: next stage, or the implement repair after a failure |
| `continue` | check-in | The worker is making progress; the next check-in follows after the interval |
| `prompt --text "..."` | both, while the subagent is running | The live worker needs a correction it can apply in place, such as the missing step, the real cause, or a scope reminder. The text joins the running subagent's conversation, and the controller then waits for its fresh handoff |
| `redispatch --text "..."` | both | The worker should be replaced: it is stuck, drifting, or out of context, or its stage must run again with your guidance. The controller starts the same stage (or implement when the branch needs it) as a new subagent with your guidance and the failure evidence |
| `halt --text "<diagnosis>"` | both | Only for a login or credential the person must enter interactively; a product or spec decision; an action that is destructive, irreversible, or touches shared or production systems; or a blocker still present after a remediation based on a different hypothesis. The run stops non-zero with your diagnosis; the branch, worktree and remote stay as they are |

`prompt` adds guidance to the running subagent's conversation. `redispatch` and `halt` stop the subagent first.

4. Read the next output and repeat until the controller finishes.

### Safe actions

At every stage (start, implement, verify, deliver), on a stage report, on a check-in report, and after a non-report controller exit, take any action that is safe, reversible, and moves the issue toward delivery of its spec, without asking the person. Do not wait for the action to appear on the list below. Ask yourself whether the person would make the same fix, and whether it is safe and reversible. If both answers are yes, make it.

An action is safe and reversible when it changes no tracked repository file, loses no work or data that cannot be regenerated, and touches no shared or production system.

These examples illustrate that rule. They are not an exhaustive list:

- start or restart the local container/Kubernetes runtime (for example Rancher Desktop via `rdctl`)
- boot an iOS simulator or Android emulator
- restart a stopped host service or port forward
- stop a hung test or build process the run itself started
- add `.nmg-sdlc/` to `.git/info/exclude` when untracked plugin runtime is the only dirt
- wait for a transient network or GitHub failure to clear, then rerun `supervise` (which resumes from live evidence)
- wait for still-running required PR checks to finish, then `redispatch` deliver
- run every `supervise`, `decide`, and `wait` command from the project root
- free regenerable caches when the disk is full

After the action, continue the run: `prompt` the worker when it is live and can proceed in place; `redispatch` the same stage with guidance that names the fix; or rerun `supervise` when the controller already exited. If the same blocker remains, try one remediation based on a different hypothesis. `halt` with the diagnosis if it remains after that, or when the blocker matches a `halt` case in the decision table.

The hard boundaries still apply to every remediation: never edit product code, specs, or other tracked repository files; never commit, push, or open PRs; never bypass branch protection or required checks. A redispatched stage is held to the same full registered gate at the exact source head.

### Hung worker processes

A check-in reports `activity_unchanged`, so its `activity` object shows no recent tool calls or transcript text, and a process the worker started has used about 0% CPU for several minutes. Do not answer `continue` again. Check that process's activity, for example with `ps -o pid,pcpu,etime,command` on macOS or Linux. Then either stop the hung process under **Safe actions** and `prompt` the worker with that diagnosis, or `prompt` the worker to stop it and rerun the command itself.

### Gates stay with the controller

Accepting a report or answering a check-in never makes delivery happen early. Deliver runs only after a full-green registered gate at the exact source head. A non-green verify you accept goes back to implement, and a red gate is diagnosed, not argued around. Prefer `prompt` or `redispatch` with a concrete, different hypothesis over repeating an unchanged attempt.

## Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional flags and the current branch is not an issue branch.

1. Run `node "<plugin-root>/scripts/sdlc-execute.mjs" list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `supervise`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `supervise`.
4. Otherwise use one `AskUserQuestion` call with one question that sets `multiSelect: true` (header `Issues`). Do not mark any option ` (Recommended)`. The question text lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue options (the tool allows at most four), or every issue when fewer than four exist. There is no Cancel chip. Because `AskUserQuestion` needs at least two options, a single returned issue is paired with exactly `Stop — run nothing`; selecting only that option prints nothing further and stops without invoking `supervise`. Submitting the selection is the confirm action; dismissing the question stops without invoking `supervise`. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected issue options with Other tokens (multi-select answers are comma-separated labels): issues in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Follow **Set the goal** with the selected numbers as separate `#N` tokens in the resolved order. Its goal turn runs `supervise` with those tokens, followed by `--check-in-seconds N` when present in `$ARGUMENTS`.
8. If `AskUserQuestion` is unavailable (no UI: `claude -p`, the SDK), print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `supervise`.
