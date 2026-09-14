# Root Cause Analysis: Classify failed consumed-dispatch worker after post-resume cleanup

**Issue**: #395
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/394-resume-consumed-repaired-publication-dispatch-after-pane-split-failure/

---

## Root Cause

#394 makes a consumed repaired-publication invocation resumable across pane allocation, agent-start, and controller-process failure. Its ephemeral `consumedDispatch` marker correctly remains authoritative while that same invocation is prepared, pending, stopped-resumable, or actively started.

The ordinary worker failure path predates that marker. When the resumed standard implement worker returns a new validated failed intervention handoff, the controller closes the owned pane and removes the worker but persists `consumedDispatch.disposition: started`. Discovery therefore interprets an already-settled old dispatch as an orphaned live/resumable dispatch. That precedence masks the new handoff and returns `consumed_dispatch_unproven`.

## Design

### Settlement boundary

Extend the existing terminal worker outcome transition rather than adding a new recovery class. A consumed dispatch may leave the ephemeral dispatch state only when all of these facts are established in one controller-owned path:

1. The dispatch identity exactly matches the current run, issue, implement step, invocation, standard worker name, and current worker pane.
2. The live handoff passes the existing strict handoff validator and is `failed`, `intervention: true`, `reasonCode: implementation_failed`, and `next: null`.
3. The handoff is the fresh worker result, not the archived source handoff identified by the consumed dispatch archive digest.
4. The worker is terminal and its proven-owned pane closes successfully.
5. The worker entry is removed before checkpoint persistence.

On that exact boundary, remove the ephemeral `consumedDispatch` property. The current `failed` object and live handoff remain the ordinary intervention evidence.

Clearing is necessary but not sufficient because the immutable historical recovery still names the repaired-publication class. Discovery selects consumed-dispatch inspection only while the ephemeral marker exists or the historical recovery has the exact legacy pre-dispatch `pane_split_failed` compatibility state. A settled `implementation_failed` outcome with no marker proceeds to ordinary intervention classification. Retaining another dispatch disposition would create a second precedence convention and another invalid state surface.

### Immutable authority

Do not modify the recovery tuple identity, safe-recovery record, archived handoff, archive identity/digest, source failure, or classifier evidence. The existing stop transition may record the fresh worker outcome as the recovery disposition and reason; it must not rewrite the immutable source authority. The settled worker is an outcome of the already-consumed invocation, not authority for another consumed-dispatch resume.

The next legal action must arise from existing ordinary approved-intervention rules after a real specification/scope amendment. No code path reuses the old invocation id or calls consumption APIs during settlement.

### Discovery behavior

No new recovery class is added. Once the ephemeral marker is absent, a historical repaired-publication recovery selects consumed-dispatch inspection only for the exact legacy `pane_split_failed` compatibility state. The fresh failed handoff otherwise reaches existing ordinary intervention classification. Before all settlement invariants are proven, the marker remains and current consumed-dispatch inspection continues to fail closed.

## Failure Modes

| Condition | Result |
|-----------|--------|
| Handoff missing, malformed, blocked, passed, non-intervention, wrong reason, or wrong next step | Preserve consumed dispatch; block |
| Handoff bytes equal the archived source handoff | Preserve consumed dispatch; block |
| Dispatch/run/issue/step/worker/pane identity mismatch | Preserve consumed dispatch; block |
| Worker still active or pane still live | Preserve consumed dispatch; block |
| Pane close fails or ownership is unproven | Preserve worker and consumed dispatch; persist cleanup failure |
| Fresh failed handoff and owned cleanup succeed | Remove only ephemeral consumed dispatch; persist ordinary failure |
| Discovery repeats after settlement without an approved scope amendment | Existing ordinary intervention proof decides; old invocation is never offered |

## Verification Strategy

1. Extend the controlled supervisor fixture through the exact resumed-worker `implementation_failed` outcome.
2. Assert the owned pane closes, the worker entry disappears, the fresh handoff remains, and `consumedDispatch` is absent.
3. Snapshot the recovery tuple identity and immutable source fields, safe-recovery record, and archive bytes/digest before the resumed worker; compare after settlement while allowing the existing outcome disposition to record the fresh stop.
4. Run parameter-free discovery against the settled fixture and prove ordinary intervention classification, no consumed-dispatch recovery id, no mutation, and no manual checkpoint edit; an approved amendment can then satisfy the existing ordinary path without replaying the consumed invocation.
5. Add adversarial cases for malformed or stale handoff, live worker/pane, and pane-close failure; each retains the dispatch and blocks.
6. Run focused supervisor/execute suites, full Jest, command synchronization, plugin/current-spec/inventory/contribution/version/diff gates, and exact-head revalidation.

## Security and Portability

Use existing strict JSON/handoff parsing, ownership classifiers, pane-close boundary, and CAS persistence. Compare archive and handoff bytes or their existing cryptographic digests without normalization. Introduce no shell composition, platform path assumptions, new dependencies, or provider mutation.

## Alternatives Rejected

| Alternative | Reason |
|-------------|--------|
| Mark the old recovery available again | Replays consumed authority and violates one-time semantics |
| Append a replacement allowance or invocation | Mints authority from failure rather than approval |
| Hand-edit `run.json` | Unverifiable mutation destroys deterministic recovery |
| Teach discovery to ignore every started dispatch with empty workers | Could bypass incomplete cleanup or a live pane |
| Retain a new `failed` dispatch disposition | Duplicates ordinary intervention state and creates precedence ambiguity |
| Delete or rewrite the fresh handoff | Destroys the evidence needed by ordinary approved intervention recovery |
