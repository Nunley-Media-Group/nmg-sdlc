# Root Cause Analysis: Restore bounded operator-authorized recovery of stopped delivery

**Issue**: #372
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/

## Root Cause
The ordinary resume gate correctly enforces #369 but has no explicit operator-authorized recovery transition. Legacy exhausted histories remain blocked, as required. A supported exception must be distinct from normal resume and must not reset attempts. Recorded panes that no longer exist can also leave cleanup ownership unresolved.

### Affected Code
| File | Role |
|---|---|
| scripts/sdlc-execute.mjs | Parser, checkpoint ownership, remediation dispatch, validated advancement and stop diagnostics |
| scripts/sdlc-status.mjs | Read-only diagnostics and operator recovery instructions |
| scripts/sdlc-execute-supervisor.mjs | Argument forwarding and cancellation only if needed |
| commands/sdlc-execute.md | Public argument and explicit authorization contract |
| workflows/execute/ | Workflow instructions and loop protection |
| README.md | Operator retry, lease and troubleshooting instructions |
| scripts/__tests__/ | Existing execute/status/supervisor behavioral fixtures |

## Fix Strategy
### Approach
Add an explicit --retry-stopped <identity> --retry-reason <text> pair accepted once each alongside the exact issue queue. Both are required together; invalid forms retain usage exit 2. Neither ordinary execute nor --recover-stale may infer or supply them. The operator obtains an eligible exact-checkpoint identity from read-only status or the stop result. Use an opaque deterministic digest bound to project/run, queue, issue, current step, relevant stopped evidence and repository identity. It must not change merely because of read-only inspection or incidental controller lease bookkeeping. Changed scope, work head or substantive stop evidence invalidates prior authorization. Share computation and eligibility between status and execute rather than creating a second classifier.

Under exclusive controller ownership, revalidate identity and the nonempty trimmed reason, reject consumed identities, and durably append a recovery authorization record before any worker launch or prompt dispatch. Preserve original remediation attempts/history, run identity and handoff evidence; never clear them to obtain a fresh allowance. Record issue/step, stopped identity, reason and terminal disposition. Reentry may settle an already-dispatched matching worker but may not dispatch another. Persistence failure dispatches nothing. Ambiguous launch/prompt/cancellation stays non-passing and cannot replay consumed authorization. Workers, supervisor and remediation never self-authorize another attempt.

Authorization grants exactly one repair worker for the stopped step. A failed authorized recovery stops without automatic follow-on repair. A genuinely validated passed handoff advances by the existing stage contract and leaves durable recovery audit history; later stages retain the normal two-remediation allowance. Preserve terminal delivery reentry verification and completed-stage behavior.

Intervention/blocked evidence, mismatched queues, active owners, live unmatched workers and unreadable/ambiguous ownership do not become retryable. Inspect complete Herdr state through the existing adapter: positively absent recorded panes may be reconciled as absent, not claimed closed. A pane with a different occupant or unprovable absence preserves ownership evidence and fails closed. Never close unrelated panes or manually remove a controller lease.

### Changes
Update public parsing, status and stop output together. Stop output includes primary reason, cleanup reason when present, and exact supported next action. Only eligible loop stops expose a usable recovery identity and retry command. Lease recovery may compose with explicit authorization, but the actions remain semantically separate. Commands/workflows prohibit autonomous retry authorization and explain one-attempt semantics.

### Contract Precedence
#372 adds only the explicit operator-authorized transition absent from #369. Ordinary unchanged reinvocation, legacy exhausted histories, intervention, cancellation and exact-head gates remain unchanged. PennyScan product code and unrelated nmg-sdlc #360 state are out of scope.

## Alternatives Considered
- Reset/delete checkpoint: rejected; destroys evidence and risks duplicate dispatch.
- Treat plugin upgrade or stale-lease recovery as retry permission: rejected; silently defeats loop protection.
- Unbound boolean retry: rejected; cannot safely distinguish replay from authorization for changed state.
- Exact single-use authorization: selected; one auditable bounded transition using existing checkpoint and lease storage.

## Regression Testing
Use existing Jest fixtures for legacy 13-attempt ordinary refusal, one authorized launch, stale/replayed/concurrent refusal, failed recovery stopping, crash/persistence/dispatch ambiguity, intervention refusal, absent versus unknown/reused panes, validated pass advancement and later-stage normal budgets. Preserve usage and supervisor cancellation behavior. Map AC1-AC6 and SCN001-SCN006 to observable evidence, not source-text assertions.

Run an actual isolated CLI exercise using disposable checkpoint and controlled adapters; never modify PennyScan's checkpoint to prove the plugin. Complete all registered validations including fresh invocation-bound nmg-sdlc-smoke delivery. Smoke fixtures must name this recovery hypothesis and remain minimal within the two-attempt/no-unchanged-retry rule. Unrelated smoke application defects remain blockers. Use skill-creator before bundled edits; run applicable inventory/surface/exercise checks, two managed reviews/fixes and final verification/exact-head delivery.

## Risks and Mitigations
- Unstable identity: canonical semantic stopped evidence; compare before incidental persistence; read-only status.
- Concurrent/crashed dispatch: consume under lease before launch; persist ownership; never replay uncertainty.
- Unlimited hidden repair: recovery allowance independent of retained historical counts and exactly one worker.
- False pane absence: require complete positive evidence; protect unreadable/reused identities.
- Gate bypass: reuse existing validated handoff and publication checks unchanged.

## Open Questions
None. The operator authorized bounded recovery repair and subsequent delivery. Conservative implementation details remain within this contract.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #372 | 2026-09-07 | Initial defect specification authorized by the operator request to fix recovery and complete delivery without repeating a loop |
