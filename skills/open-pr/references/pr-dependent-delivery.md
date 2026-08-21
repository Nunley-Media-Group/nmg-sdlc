# Controlled PR-Dependent Delivery (v3)

Kept for PR-evidence-pending path from verify.

Entry requires pr_evidence_pending from readiness helper.

Create/reuse exact draft for head, collect H1 evidence with exact event: pull_request, re-verify, push report update, collect H2, write final marker, gh pr ready.

No epic reconciliation.

Failure keeps branch + draft, reports exact gap. Resume re-validates markers and heads.
