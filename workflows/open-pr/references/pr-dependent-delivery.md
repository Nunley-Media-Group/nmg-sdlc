# Controlled PR-Dependent Delivery (v3)

Kept for PR-evidence-pending path from verify.

Entry requires pr_evidence_pending from readiness helper.

Create/reuse exact draft for head, collect H1 evidence with exact event: pull_request, re-verify, push report update, collect H2, write final marker, gh pr ready.

Before report mutation, bind the standalone session or controller namespace to
its durable logical recovery owner. A previously committed unpublished report
is reconciled by `reconcileStagePublication` for step `deliver`, subject
`docs: record PR evidence for #N`, and only the active report path. Push the
known commit once without force, or acknowledge its exact upstream state.
Fail/Partial/Incomplete reports never become Pass to escape publication.

No epic reconciliation.

Failure keeps branch + draft, reports exact gap. Resume re-validates markers and heads.
