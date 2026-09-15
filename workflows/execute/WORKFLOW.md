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

A closed exclusive implement worker may instead use one `exclusive_implement_resume` when workers are empty, the unique incomplete implement owner equals the run id, the current issue branch is exact, the failed implement handoff is valid, and checkpoint HEAD is an ancestor of or equal to current HEAD. Discovery remains read-only. Parameter-free bare `run` repeats the matching classifier under its lease, archives the original handoff in class-specific immutable history, consumes the durable class once, CAS-updates checkpoint HEAD to current HEAD, clears failed/remediation state, and dispatches only `sN-implement`. Exclusive dispatch uses `exclusiveResumePrompt` to inspect the failed handoff, Git delta, and every approved task acceptance bullet before editing; it skips satisfied work and performs only remaining authorized work. It never starts vanilla fresh implement, `remediationPrompt`, or `rN-implement`.

Both recovery classes remove the primary failed handoff only for worker output. Any proof mismatch remains the original intervention blocker. A consumed, failed, cancelled, ambiguous or lost dispatch is never offered again, and identical exhausted recovery cannot replay.

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
