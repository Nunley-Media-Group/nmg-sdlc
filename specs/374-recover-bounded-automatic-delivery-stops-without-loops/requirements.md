# Defect Report: Recover bounded automatic delivery stops without loops

**Issue**: #374
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/

---

## Reproduction

1. Run `/sdlc-execute` for an approved issue through host review, verification publication, and exact-head delivery on nmg-sdlc 3.21.0 (observed source `758c22cd5b92f78e68cc983e1817be717121d44f`).
2. Trigger any of: a file-assigned reviewer reading outside its assigned files; an empty or missing host-review artifact; a verification report that committed locally then failed to push; a PR that is `BEHIND` / `DIRTY` / `CONFLICTING`; a `changes_requested` event from automation; or an exact-head merge command whose first re-read is not yet `MERGED`+`CLOSED`.
3. Reinvoke execute without rewriting history or replaying stopped smoke `#96`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every delivery stop family has one disposition. Newly classified safe classes recover automatically under a durable one-use identity per class/run/issue/step with exact outcome reconciliation before side effects. Empty or missing review never becomes a pass. Contaminated review evidence is replaced at most once per `review1` / `review2` with the original assignment. `#369` and `#372` budgets stay isolated. Unproven classes stay fail-closed. |
| **Actual** | Invalid reviewer scope invalidates the whole host review as `review_failed` intervention. Empty review artifacts can be passed as `No findings.` Committed unpublished verification reports cannot resume. Remediable `mergeability_defect` hard-fails as `merge_failed`. Automation review requests escalate as `human_review`. One post-merge observation or unresolved transport can fail an already-landed merge. |

## Acceptance Criteria

### AC1: Complete stop-class inventory

**Given** the execute, start/dispatch, implementation/fix, review, verification/publication, CI/bot review, exact-head merge/closure, and cleanup stop families
**When** the spec for this issue is approved
**Then** every family has exactly one disposition: a safe automatic action with preconditions and proof, existing adequate handling that remains, or an explicit required-intervention rationale
**And** the inventory includes at least: controller lease/cancel/process/cleanup/supervisor stops; pane/agent/prompt/process/ownership stops; checkpoint and identity mismatches; branch/dirty-tree/cleanup stops; handoff/remediation-loop/recovery-consumed stops; dependency and issue-graph stops; spec-authority stops; implementation/apply-review/review-artifact/review-failed/delivery-not-complete stops; verification report publication; mergeability defects; CI/bot review attribution; post-merge observation and closure

### AC2: Invalid review slice is replaced, not escalated

**Given** a host review with an explicit issue/base/head/spec/assignment identity and a reviewer that reads outside its assigned files
**When** execute observes that contamination
**Then** it discards the offending evidence, does not rewrite assigned scope, and launches at most one fresh bounded slice replacement for that `review1` or `review2` step under a durable one-use identity
**And** a second contamination or replacement failure for the same step stops fail-closed without converting historical interventions into success
**And** independently valid compliant slices are reused only with exact head/base/spec/scope identity proof

### AC3: Empty or missing review never becomes a pass

**Given** a missing host-review artifact or empty review output
**When** the review helper finalizes the step
**Then** it does not synthesize `No findings.` or any passed handoff from empty or missing output
**And** the step remains failed or blocked with a distinct reason rather than a fabricated pass

### AC4: Verification report publication reconciles exact outcome

**Given** a locally produced verification report whose exact commit exists and whose push did not land, or whose exact commit is already on the expected upstream
**When** execute or verification finalization resumes
**Then** it publishes the known pending commit without a duplicate commit or force-push, or acknowledges the already-published exact state
**And** dirty partial, divergent, or unknown-ownership state stays stopped
**And** Fail/Partial/Incomplete non-pass status is never changed to escape the gate
**And** locally repairable report/protocol evidence may regenerate only when provider authority, config, paths, and real verification remain present

### AC5: Remediable mergeability is not a hard merge failure

**Given** a delivery classifier result of remediable `mergeability_defect` for `BEHIND`, `DIRTY`, or `CONFLICTING`
**When** deliver runs
**Then** it performs only safe in-scope base/head reconciliation followed by fresh complete verification after any content or base change
**And** it does not treat that class as `merge_failed` solely because checks/threads handlers do not match
**And** it does not blindly resolve conflicts outside approved scope

### AC6: Automatic review is not treated as human `changes_requested`

**Given** a `changes_requested` or unresolved-thread event
**When** deliver classifies it
**Then** allow-listed bot or pathless automation is attributed as automatic and proceeds only with supported actionable evidence or an exact unresolved reason
**And** actual human review is never overridden, resolved, or converted into an automatic repair
**And** pathless automation is not relabeled as human review

### AC7: Post-merge observation reconciles before retry or failure

**Given** an exact-head squash merge command has been issued, or a generic transport error occurred around merge or close
**When** deliver decides success or failure
**Then** it reconciles remote exact expected PR, head, merge, and issue-closure identity with bounded read-only eventual-consistency recovery before retry or stop
**And** it never replays merge, never closes an unrelated issue, and never treats one premature observation as proof of failure when identity is still settling
**And** workflow-owned closure runs only when exact issue linkage and user-authorized delivery scope are proven
**And** a merged PR whose linked issue remains open is not silently ignored; it is either closed under that proven scope or stopped as an external blocker after reconciliation

### AC8: Durable one-use recovery identities compose without loops

**Given** a newly classified safe stop class for a run/issue/step
**When** automatic recovery runs
**Then** it consumes a durable one-use identity for that class/run/issue/step before acting, surviving restarts, concurrent invocation, worker replacement, and version/summary/commit churn
**And** it does not refill `#369` two-attempt same-step remediations or `#372` one-shot exhausted-run recoveries
**And** work-dispatching recovery still requires semantic stage or diagnosed-condition advancement to count as progress
**And** identical repair packets are not repeated; nested budgets do not multiply
**And** healthy active jobs have no wall-clock deadline; observer timeout is not a failed command

### AC9: Unproven and unsafe classes stay fail-closed

**Given** a stop class that cannot be proven safe, or a class listed as remaining forbidden
**When** execute observes it
**Then** it stays stopped with an explicit intervention rationale and does not invent an automatic action
**And** forbidden actions remain forbidden: rewriting historical intervention/blocked records into eligibility; treating all nonzero exits as transport; auto-deleting dependency edges; auto-approving or reassigning spec authority; stealing live or ambiguous ownership; blind commit/push/merge/close/pane-close replay; changing credentials, approved scope, or unrelated dirty work; replaying stopped smoke `#96`; manufacturing a passed handoff

### AC10: No regression of existing bounded recovery and gates

**Given** existing `#369` loop detection, `#372` operator-authorized exhausted recovery, passed-handoff settlement, exact stale-lease and absent-worker reconciliation, pending-CI wait, contribution-gate body repair that stops on unchanged body, and exact-head publication/merge/closure gates
**When** this recovery protocol is added
**Then** those behaviors remain; ordinary reinvocation still does not grant new `#369`/`#372` attempts
**And** reusable behavior stays programming-language, framework, stack, and OS agnostic, with consumer commands supplied only by registered project steering

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Inventory every delivery stop family with safe automatic action plus proof, existing adequate handling, or explicit intervention rationale. | Must |
| FR2 | Replace an invalid/contaminated review slice once per review step with original assignment; never synthesize a pass from empty or missing review output. | Must |
| FR3 | Reconcile verification-report and delivery side effects to exact local/remote/ownership truth before retry; settle when proven done or absent. | Must |
| FR4 | Honor remediable mergeability and automatic-vs-human review attribution without overriding human review or resolving out-of-scope conflicts. | Must |
| FR5 | Give each newly classified safe class a durable one-use identity per run/issue/step that cannot refill `#369` or `#372`. | Must |
| FR6 | Keep unproven, ownership, spec-authority, dependency-authority, credential, and exact-head gates fail-closed. | Must |
| FR7 | Keep reusable recovery behavior steering-driven and language/framework/stack/OS agnostic. | Must |

## Out of Scope

- Replaying or repairing around stopped smoke `#96`, or any fake passed handoff / edited success marker.
- PennyScan product code, live trading profiles, databases, broker/service mutations, and unrelated `#360` / `#137` worktrees.
- Auto-deleting official dependency edges, auto-approving specs, stealing live ownership, or changing human review.
- Unlimited retries, wall-clock workflow deadlines, or replenishing `#369`/`#372` allowances.
- Splitting this defect into multiple issues because audits were partitioned.
- Source, test, installed-plugin, or smoke mutations before this issue's approved spec.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #374 | 2026-09-07 | Initial defect report |
