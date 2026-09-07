---
name: sdlc-execute
description: "Run automated SDLC delivery"
---


# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` and `--recover-stale` at most once each among issue tokens; absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation. Decide whether issue tokens remain after removing both flags. With issue tokens, invoke `node "/Users/rnunley/.omp/recovery/nmg-sdlc-reviewed-bda2935/scripts/sdlc-execute.mjs" run` with every trimmed token. With no issue tokens, execute the packaged `# Select specified issues` section from `workflows/execute/references/selection.md`: discover exact-branch recovery before any picker. Read that package-root reference if the section is not already inlined. Never translate a discovered queue into explicit issue arguments; the bare `run` invocation owns recovery authorization.

Bare recovery preserves the persisted queue, completed stages and prior failure history. It may reclaim only proven stale ownership and consume one durable recovery allowance per exhausted run/issue/step before dispatch. Explicit queues and `--recover-stale` with an explicit queue never grant that allowance. A failed, ambiguous or lost recovery cannot replay or start automatic follow-on repair; commits, changed summaries and plugin upgrades do not replenish it. A validated passed handoff may settle and continue every remaining review, verification and exact-head delivery gate. Never bypass intervention, branch or ownership blockers.

Only a parameter-free invocation grants the one-time exhausted recovery allowance. Optional flags may retain their existing resume or ownership behavior, but neither `--recover-stale` alone nor `--retain-worker` grants fresh repair work.

Current reviews use controller-owned per-slice snapshots and host receipts, not
unbounded nested review agents. A proven contamination consumes one replacement
for the whole review stage; missing proof, empty output, or a failed replacement
stops without replenishing remediation. Original review evidence stays intact.
Publication helpers reconcile a failed first push before their terminal handoff.
After safe base reconciliation, handle `mergeability_reverification_required`
before generic remediation: preserve stale evidence, invalidate every
review/fix/verify completion, and rerun those gates under the same recovery owner.
Do not mint allowances from the new head or alter existing exhausted-run records.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.


# Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional `--retain-worker` and `--recover-stale` flags.

Before selection, run `node "/Users/rnunley/.omp/recovery/nmg-sdlc-reviewed-bda2935/scripts/sdlc-execute.mjs" discover-recovery` in the current project.

- If the helper fails, returns unreadable output or reports `blocked`, print its evidence and action, then stop. Do not open a picker or select another issue.
- For `resumable`, `loop-recovery-available` or `recovery-consumed`, invoke `node "/Users/rnunley/.omp/recovery/nmg-sdlc-reviewed-bda2935/scripts/sdlc-execute.mjs" run` once without issue tokens, forwarding only flags already supplied by the user. The controller revalidates identity and ownership, settles genuine passed handoffs, and refuses a consumed unsuccessful recovery without replay. Do not ask for a token, reason, flag or confirmation. Pass the result through and stop.
- Only `absent` or `completed` falls through to the selection steps below. Completed delivery is not reopened.

1. Run `node "/Users/rnunley/.omp/recovery/nmg-sdlc-reviewed-bda2935/scripts/sdlc-execute.mjs" list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one built-in `ask` with `multi: true`. Do not set `recommended`. The question lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue chips, or every issue when fewer than four exist. There is no Cancel chip. Continue is the built-in confirm action. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected chips with Other tokens: chips in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node "/Users/rnunley/.omp/recovery/nmg-sdlc-reviewed-bda2935/scripts/sdlc-execute.mjs" run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` and `--recover-stale` when each was present in `$ARGUMENTS`.
8. If the built-in question UI is unavailable, print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
