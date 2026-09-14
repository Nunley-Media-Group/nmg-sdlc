---
name: execute
description: "Orchestrate automated delivery for approved, spec-created issues through Herdr OMP worker sessions. Use when the user says execute, ship specified issues, /sdlc-execute, or passes comma- or whitespace-separated issue numbers to deliver. With no numbers, resume the exact current branch's incomplete run before offering issue selection. Do NOT use to draft issues or write specs."
---

# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Accept `--retain-worker` and `--recover-stale` at most once each among issue tokens; absent `--retain-worker` means the controller closes its owned worker panes on every terminal stop or cancellation. Decide whether issue tokens remain after removing both flags. With issue tokens, invoke `node "<plugin-root>/scripts/sdlc-execute.mjs" run` with every trimmed token. With no issue tokens, execute the packaged `# Select specified issues` section from `workflows/execute/references/selection.md`: discover exact-branch recovery before any picker. Read that package-root reference if the section is not already inlined. Never translate a discovered queue into explicit issue arguments; the bare `run` invocation owns recovery authorization.

Bare recovery preserves the persisted queue, completed stages and prior failure history. It may reclaim only proven stale ownership and consume one durable recovery allowance per exhausted run/issue/step before dispatch. Explicit queues and `--recover-stale` with an explicit queue never grant that allowance. A failed, ambiguous or lost recovery cannot replay or start automatic follow-on repair; commits, changed summaries and plugin upgrades do not replenish it. A validated passed handoff may settle and continue every remaining review, verification and exact-head delivery gate. Never bypass intervention, branch or ownership blockers.

Only a parameter-free invocation grants the one-time exhausted recovery allowance. Optional flags may retain their existing resume or ownership behavior, but neither `--recover-stale` alone nor `--retain-worker` grants fresh repair work.

A failed `implement` intervention may enter one of two one-time bare recoveries. Repaired publication retains its exact-HEAD contract: require the run, strict handoff, current HEAD, actual branch, run-bound unique incomplete owner and current read-only owner-bound probe to agree; permit only the probe's explicit stale run-branch discrepancy. Scan every existing controller handoff regardless of Git ignore reporting and read each lifecycle-admitted file through a bounded no-follow descriptor after rejecting symlinked parents, symlinks, nonregular files, identity drift, unrelated issue/step payloads, duplicate attempts and future/unreachable slots. Derive current slots from the checkpoint queue, completed prefix, matching current/failed step and owner-proven prior-issue history. Only an exact byte-level tasks.md repair that rewrites every and only `Files` labels to `File(s)`, preserving separators and all other bytes, can use `repaired_publication_intervention`.

A closed exclusive implement worker may instead use one `exclusive_implement_resume` when workers are empty, the unique incomplete implement owner equals the run id, the current issue branch is exact, and the failed `implementation_failed` handoff is valid. Current HEAD must be a strict descendant containing exactly one single-parent commit whose parent is checkpoint HEAD, subject equals the owner's planned subject, and observed paths are non-denied under `mutationPolicy: outcome`; equal HEAD, multiple commits, merge commits, foreign subjects, dirty tracked/untracked work, unsafe ignored implementation state, or invalid terminal evidence remain blocked. Discovery is read-only. Parameter-free bare `run` repeats the classifier under its lease, archives the original handoff in class-specific immutable history, consumes the durable class once, CAS-updates checkpoint HEAD, clears failed/remediation state, and dispatches only `sN-implement`. `exclusiveResumePrompt` inspects the handoff, Git delta, and every Approved acceptance bullet before editing, skips satisfied work, and performs only remaining outcome-authorized work. It never starts vanilla fresh implement, `remediationPrompt`, or `rN-implement`.

Both recovery classes remove the primary failed handoff only for worker output. Any proof mismatch remains the original intervention blocker. A consumed, failed, cancelled, ambiguous or lost dispatch is never offered again, and identical exhausted recovery cannot replay.

Discovery is read-only. Before first repaired-publication consumption, parameter-free bare `run` must repeat the complete classifier under its lease, inspect geometry from the actual controller pane identified by `HERDR_PANE_ID`, and allocate the normal `sN-implement` pane using the standard width-versus-height split rule. Split failure consumes and archives nothing, writes no pending dispatch or recovery tuple, and closes only a pane created by that attempt and proven unused. After successful split and revalidation, one checkpoint CAS reserves the original invocation as an exact `prepared` dispatch while leaving `recoveries[]` unchanged. The controller then creates the byte-identical immutable archive and consumes `repaired_publication_intervention` with that invocation. The next CAS creates exactly one matching run recovery and marks dispatch `pending` before `agentStart`. Process loss between safe consumption and that CAS is validated from prepared dispatch plus exact safe record/archive; resume creates only the absent run recovery in its next CAS, never a duplicate tuple or allowance.

A later parameter-free discovery may return `consumed-dispatch-available` only for that same consumed repaired-publication invocation: either the pre-fix stopped `pane_split_failed` compatibility shape, an exact pending/stopped dispatch, or a `started` dispatch orphaned by `controller_cancelled`/`process_lost` after both its recorded worker ownership and live handoff disappeared. It re-proves the immutable archive and digest, run/HEAD/actual branch/incomplete owner, repaired handoff and task publication, clean product/worktree and workflow evidence, empty workers, absence of the recorded consumed-dispatch pane and matching `sN-implement`/`rN-implement` identities, absence of any cleanup failure diagnostic, and no competing lock; unrelated sibling/user panes are tolerated. The archived failed handoff is authoritative only when the live handoff is absent in that exact orphaned-start shape or an exact stopped prompt-path `process_lost` shape. Bare `run` then allocates a fresh standard pane from the current controller geometry, resumes without `consumeSafeRecovery`, a duplicate recovery tuple, remediation, or a new invocation, and starts only `sN-implement`. A merely `started` dispatch remains non-offerable while worker, pane, agent, live handoff, cleanup failure, or missing controller-loss evidence makes prior work ambiguous.

After a validated successful resumed implement handoff, remove only the ephemeral pending-dispatch field before next-step persistence. Retain the consumed safe-recovery record, checkpoint recovery, immutable archive, and invocation identity through terminal queue persistence.

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
