# Root Cause Analysis: Restore bounded operator-authorized recovery of stopped delivery

**Issue**: #372
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/

## Root Cause
The no-token public command always enters issue selection. The controller correctly preserves exhausted retry counts but offers no automatic bounded recovery for the branch's interrupted delivery. Lease recovery and a passed handoff are distinct from permission to dispatch new work. This revision replaces the initial explicit token/flag proposal with the user's required bare-command recovery behavior.

### Affected Code
| File | Role |
|---|---|
| scripts/sdlc-execute.mjs | Bare-run discovery, exact branch/checkpoint matching, stale ownership, bounded dispatch and handoff advancement |
| scripts/sdlc-status.mjs | Shared read-only recovery classification and diagnostics |
| scripts/sdlc-execute-supervisor.mjs | Invocation startup/argument forwarding and loss cleanup as needed |
| commands/sdlc-execute.md | Resolve incomplete branch before picker and invoke bare recovery |
| workflows/execute/ | Authoritative bare-invocation and bounded recovery instructions |
| README.md | Resume and blocked-state operator guidance |
| scripts/__tests__/ | Existing execute/status/supervisor regression fixtures |

## Fix Strategy
### Public entry and target resolution
Bare /sdlc-execute first asks the packaged read-only helper whether the exact current branch/project has a matching incomplete run. Reuse shared run/spec/Git identity resolution; the model must not infer state from checklist ticks or choose another issue. Match the linked worker branch as well as authoritative run identity where old run.branch retained the initial default branch. Preserve the complete persisted queue and completed stages. A mismatched, ambiguous or unreadable checkpoint is a blocker, not permission to select unrelated work. Only clean absence of an incomplete run falls through to existing list-specified and selection behavior. Completed terminal runs are not reopened.

Expose the same behavior through the installed execute CLI's no-issue run path so correctness does not depend on model judgment. Helper discovery is read-only; actual recovery happens only in run. A bare invocation may recover a positively stale controller lease automatically using the existing ownership guard; it never steals a live lease. Explicit issue queues and --recover-stale retain their existing semantics, including no implicit fresh retry allowance.

### One durable recovery allowance
For an exhausted loop at the resolved current stage, bare run can consume one audited recovery allowance keyed by immutable runId, issue and step. Consumption is durable under exclusive controller ownership before any worker or prompt dispatch. Preserve all original attempts, failure/history records, work and checkpoint identity. Record the source stopped evidence, invocation identity and terminal disposition in existing checkpoint storage. Missing optional fields on old checkpoints mean no recovery consumed, not a reset of ordinary attempt counts.

The allowance is not keyed solely by mutable revision, head, summary, failure reason or plugin version. After consumption none of those changes, repeated bare invocations or newly written failure packets can grant another recovery for the same unadvanced run/issue/step. No public retry token/reason flags are added. A fresh stage has its normal independent bounded policy. Existing passed-handoff settlement happens through the existing validator without dispatching or consuming unnecessary repair work.

Exactly one repair worker may be launched for recovery. Reentry may settle a durably recorded matching active worker but never create a duplicate. If consumption persisted but dispatch state is unknown, stop rather than replay. Persistence failure means no dispatch. Failure, ambiguity, cancellation or process loss retains the consumed allowance and cannot enter ordinary automatic follow-on remediation. A validated pass advances through existing gates and retains audit history; later stages keep normal two-remediation protection.

### Ownership and failure boundaries
Blocked/intervention evidence, mismatched branch/queue, active controller or unmatched live worker, and unreadable/ambiguous Herdr identity remain non-retryable. Do not downgrade a handoff. Prove pane absence using complete authoritative Herdr evidence and reconcile it as absent, not as a successfully closed live pane. A reused identity or uncertain presence preserves ownership and fails closed. Never manually remove a lease or close unrelated panes.

### Operator output
Status and stop output share authoritative classification: normal resumable run, eligible one-time loop recovery, consumed recovery, completed run, or blocked ownership/intervention. Include primary and cleanup reason and a concrete next action. Bare execute is the action for eligible recovery; a consumed unsuccessful recovery reports what must be repaired and must not recommend another unchanged bare retry. Never describe checklist ticks, activity or commits as stage completion.

### Implementation decisions

- `discover-recovery` and status share `discoverRecovery`; worker/pane evidence uses complete Herdr `agent list` and `pane list` responses through the same read-only ownership classifier. Execution rechecks that evidence under the existing controller lease before reconciling absence.
- Preserve confirmed-absent worker identities in `absentWorkers`, including their exact issue branch. These identities remain authoritative when legacy `run.branch` still names the initial default branch.
- Store audited allowance consumption in checkpoint `recoveries`, keyed by immutable `runId`, issue and step. Preserve the source remediation and failure records, invocation UUID, consumption timestamp and final disposition. The in-memory dispatch permission is invocation-local and cannot be reconstructed after process loss.
- Parameter-free execution alone grants the allowance. Existing optional flags retain their original ownership/retention behavior and do not grant fresh exhausted work. Recovery startup and process-loss paths cannot reuse ordinary worker-start retry permission.
- A validated passed handoff may settle an earlier prompt-pending intervention, but an intervention or blocked handoff itself is never downgraded. Passed absent-worker settlement retains the existing branch/head ancestry check.
- Implementation-owned CLI/OMP exercises use disposable local adapters. Fresh registered consumer smoke, managed review and exact-head delivery remain downstream stage obligations, as specified by T004.

## Contract Precedence
#372 adds the user's automatic bare-invocation transition to #369. It does not relax ordinary automatic retry counts or permit repeat recovery allowance for an unadvanced stage. Bare-command discovery replaces issue selection only for the exact incomplete branch; explicit issue execution retains its previous contract. All downstream publication and delivery checks remain unchanged.

## Alternatives Considered
- Clear checkpoint/history or reset retry epochs on every bare invocation: rejected; destroys evidence and creates a loop.
- Require manual recovery flags/tokens: rejected by the user; bare execute must work.
- Treat any unreadable checkpoint as no run: rejected; risks duplicate ownership and wrong-issue work.
- Branch-scoped bare recovery with a once-per-unadvanced-stage allowance: selected; automatic UX with durable loop protection.

## Regression Testing
Use existing Jest fixtures to cover branch-local no-picker discovery, legacy default run.branch plus exact linked worker branch, clean no-run fallback, completed/ambiguous/mismatched/unreadable state, proven stale versus live ownership, a legacy 13-attempt recovery launching once, concurrent/repeated bare commands, summary/head/version churn after failed recovery, persistence/dispatch/process-loss boundaries, blocked/intervention refusal, missing versus reused panes, passed-handoff advancement and later-stage budgets. Preserve existing explicit-queue usage and cancellation contracts. Map AC1-AC6/SCN001-SCN006 to observable evidence.

Run an actual isolated CLI bare recovery exercise using a disposable checkpoint and controlled adapters, never PennyScan state. Complete all registered validations including fresh invocation-bound nmg-sdlc-smoke delivery. Keep the smoke fixture minimal and hypothesis-bound with two-attempt/no-unchanged-retry limits; unrelated smoke application defects are blockers. Use skill-creator for bundled edits, applicable inventory/surface/exercise gates, two managed reviews/fixes and final verification/exact-head delivery.

## Risks and Mitigations
- Wrong branch adoption: exact shared identity checks before ownership or picker fallback.
- Restart allowance regenerated by churn: durable run/issue/step consumption independent of mutable checkpoint fields.
- Duplicate dispatch on crash/concurrency: lease plus consume-before-dispatch and retained worker identity.
- False absence: only positive complete evidence reconciles ownership; ambiguity remains blocked.
- Hidden gate bypass: unchanged validated handoff, full verification and exact-head delivery paths.

## Open Questions
None. The user explicitly requested automatic no-parameter recovery without weakened loop protection.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #372 | 2026-09-07 | Initial defect specification authorized by the operator request to fix recovery and complete delivery without repeating a loop |
| #372 | 2026-09-07 | Replaced manual flags with exact-branch bare recovery and durable once-per-unadvanced-stage protection at user direction |
