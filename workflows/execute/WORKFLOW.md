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

A failed `implement` intervention may enter that same one-time bare recovery only as a proven repaired-publication state. Require the run, strict handoff, exact current HEAD, actual branch, run-bound unique incomplete owner and current read-only owner-bound probe to agree; permit only the probe's explicit stale run-branch discrepancy. Scan every existing controller handoff regardless of Git ignore reporting and read each lifecycle-admitted file through a bounded no-follow descriptor after rejecting symlinked parents, symlinks, nonregular files, identity drift, unrelated issue/step payloads, duplicate attempts and future/unreachable slots. Derive current slots from the checkpoint queue, completed prefix, matching current/failed step and owner-proven prior-issue prefixes; malformed owner steps fail closed. The combined tracked diff from run HEAD must be one unstaged singular Approved `tasks.md`, and the package-scoped detector must prove one or more selected `Files` to `File(s)` label-only changes with every other byte and CR, LF or CRLF separator preserved and current detection converged to zero. Enumerate ignored and untracked state completely. No tracked-writable or untracked-evidence implementation path may be modified, staged, untracked or ignored; arbitrary ignored product, source, spec, controller, allowed, read-only or evidence paths block. Only irrelevant dependency/cache/build ignored state is safe. Admit `.DS_Store` only at the repository root, a tracked-writable/read-only scope-derived manifest workspace root, or that workspace's exact `android`/`ios` root; `.omp`, `.pi-glla`, `specs`, evidence-only roots, fake manifests, missing/non-directory workspaces and nested basename matches block. Terminal evidence is admitted only as the exact structurally valid, unignored goal-ledger trio; any ignored trio entry blocks. No foreign controller lock or prior recovery record may exist.

Discovery is read-only. Before first repaired-publication consumption, parameter-free bare `run` must repeat the complete classifier under its lease, inspect geometry from the actual controller pane identified by `HERDR_PANE_ID`, and allocate the normal `sN-implement` pane using the standard width-versus-height split rule. Split failure consumes and archives nothing, writes no pending dispatch or recovery tuple, and closes only a pane created by that attempt and proven unused. After successful split and revalidation, one checkpoint CAS reserves the original invocation as an exact `prepared` dispatch while leaving `recoveries[]` unchanged. The controller then creates the byte-identical immutable archive and consumes `repaired_publication_intervention` with that invocation. The next CAS creates exactly one matching run recovery and marks dispatch `pending` before `agentStart`. Process loss between safe consumption and that CAS is validated from prepared dispatch plus exact safe record/archive; resume creates only the absent run recovery in its next CAS, never a duplicate tuple or allowance.

A later parameter-free discovery may return `consumed-dispatch-available` only for that same consumed repaired-publication invocation: either the pre-fix stopped `pane_split_failed` compatibility shape or an exact pending/stopped dispatch. It re-proves the immutable archive and digest, run/HEAD/actual branch/incomplete owner, repaired handoff and task publication, clean product/worktree and workflow evidence, empty workers, absence of the recorded consumed-dispatch pane and matching `sN-implement`/`rN-implement` identities, and no competing lock; unrelated sibling/user panes are tolerated. Bare `run` then allocates a fresh standard pane from the current controller geometry, resumes without `consumeSafeRecovery`, a duplicate recovery tuple, remediation, or a new allowance, and starts only `sN-implement`. A pre-consumption `prepared` state with no safe record or run recovery stays on ordinary repaired-publication recovery and reuses its exact prepared pane/invocation once. Durable `starting`/`started` ownership is non-offerable; an agent-start failure is resumable only after its attempt-owned unused pane is closed and no matching worker or agent remains. Any mismatch, non-pane stop, explicit selector, duplicate, completed owner, matching worker/pane/agent, missing archive, or ambiguous crash blocks. Cleanup never infers ownership from an unrelated pane and never removes consumed authority or immutable evidence.

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
