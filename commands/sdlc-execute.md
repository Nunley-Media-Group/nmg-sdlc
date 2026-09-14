---
name: sdlc-execute
description: "Run automated SDLC delivery"
---


# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` and `--recover-stale` at most once each among issue tokens; absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation. Decide whether issue tokens remain after removing both flags. With issue tokens, invoke `node "<plugin-root>/scripts/sdlc-execute.mjs" run` with every trimmed token. With no issue tokens, execute the packaged `# Select specified issues` section from `workflows/execute/references/selection.md`: discover exact-branch recovery before any picker. Read that package-root reference if the section is not already inlined. Never translate a discovered queue into explicit issue arguments; the bare `run` invocation owns recovery authorization.

Bare recovery preserves the persisted queue, completed stages and prior failure history. It may reclaim only proven stale ownership and consume one durable recovery allowance per exhausted run/issue/step before dispatch. Explicit queues and `--recover-stale` with an explicit queue never grant that allowance. A failed, ambiguous or lost recovery cannot replay or start automatic follow-on repair; commits, changed summaries and plugin upgrades do not replenish it. A validated passed handoff may settle and continue every remaining review, verification and exact-head delivery gate. Never bypass intervention, branch or ownership blockers.

Only a parameter-free invocation grants the one-time exhausted recovery allowance. Optional flags may retain their existing resume or ownership behavior, but neither `--recover-stale` alone nor `--retain-worker` grants fresh repair work.

A failed `implement` intervention may enter that same one-time bare recovery only as a proven repaired-publication state. Require the run, strict handoff, exact current HEAD, actual branch, run-bound unique incomplete owner and current read-only owner-bound probe to agree; permit only the probe's explicit stale run-branch discrepancy. Scan every existing controller handoff regardless of Git ignore reporting and read each lifecycle-admitted file through a bounded no-follow descriptor after rejecting symlinked parents, symlinks, nonregular files, identity drift, unrelated issue/step payloads, duplicate attempts and future/unreachable slots. Derive current slots from the checkpoint queue, completed prefix, matching current/failed step and owner-proven prior-issue prefixes; malformed owner steps fail closed. The combined tracked diff from run HEAD must be one unstaged singular Approved `tasks.md`, and the package-scoped detector must prove one or more selected `Files` to `File(s)` label-only changes with every other byte and CR, LF or CRLF separator preserved and current detection converged to zero. Enumerate ignored and untracked state completely. No tracked-writable or untracked-evidence implementation path may be modified, staged, untracked or ignored; arbitrary ignored product, source, spec, controller, allowed, read-only or evidence paths block. Only irrelevant dependency/cache/build ignored state is safe. Admit `.DS_Store` only at the repository root, a tracked-writable/read-only scope-derived manifest workspace root, or that workspace's exact `android`/`ios` root; `.omp`, `.pi-glla`, `specs`, evidence-only roots, fake manifests, missing/non-directory workspaces and nested basename matches block. Terminal evidence is admitted only as the exact structurally valid, unignored goal-ledger trio; any ignored trio entry blocks. No foreign controller lock or prior recovery record may exist.

Discovery is read-only. Parameter-free bare `run` must repeat the complete classifier after acquiring its own lease, archive the original failed handoff byte-identically in immutable controller history, consume `repaired_publication_intervention` through the existing durable owner, and append the existing checkpoint recovery tuple by CAS with the archive path and digest. It then removes the primary failed handoff only for worker output and dispatches the normal `sN-implement` worker path—never `runState.remediation`, an `rN-implement` worker or another step. Any mismatch remains the original intervention blocker. A consumed, failed, cancelled, ambiguous or lost dispatch is never offered again.

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

Before selection, run `node "<plugin-root>/scripts/sdlc-execute.mjs" discover-recovery` in the current project. All controller operands in this section are materialized from the active plugin installation; never substitute another recovery installation or the consumer checkout.

- If the helper fails, returns unreadable output or reports `blocked`, print its evidence and action, then stop. Do not open a picker or select another issue.
- For `resumable`, `loop-recovery-available` or `recovery-consumed`, invoke `node "<plugin-root>/scripts/sdlc-execute.mjs" run` once without issue tokens, forwarding only flags already supplied by the user. The controller revalidates identity and ownership, settles genuine passed handoffs, and refuses a consumed unsuccessful recovery without replay. Do not ask for a token, reason, flag or confirmation. Pass the result through and stop.
- Only `absent` or `completed` falls through to the selection steps below. Completed delivery is not reopened.

1. Run `node "<plugin-root>/scripts/sdlc-execute.mjs" list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one built-in `ask` with `multi: true`. Do not set `recommended`. The question lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue chips, or every issue when fewer than four exist. There is no Cancel chip. Continue is the built-in confirm action. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected chips with Other tokens: chips in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node "<plugin-root>/scripts/sdlc-execute.mjs" run` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` and `--recover-stale` when each was present in `$ARGUMENTS`.
8. If the built-in question UI is unavailable, print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
