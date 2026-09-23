# Root Cause Analysis: Reconcile independently merged failed-deliver checkpoint

**Issue**: #409
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

---

## Root Cause

`runExecute` accepts a different explicit issue list only for a terminal checkpoint with all steps marked complete and no failure. `discoverRecovery` correctly refuses to resume the prior issue from a different default branch, but neither path recognizes independently completed exact-head delivery. `cleanupCompletedRun` deletes ordinary completed handoffs and cannot safely handle a failed one.

## Fix Strategy

Add a narrow admission-only reconciliation before the issue-list mismatch return. Require one fully bound failed deliver run and recorded delivery PR/head tied to its issue, with no remediation/active worker/foreign lease; query the exact PR and issue via read-only `gh` and verify Git merge ancestry on the clean default checkout. Refuse missing/malformed or ambiguous fields and other selected issues in the old queue. Under the existing checkpoint lock recheck exact bytes and proof-relevant state, write an immutable run-identified archive containing raw checkpoint and original owned evidence before removing only the old run checkpoint. Never reuse `cleanupCompletedRun`'s handoff deletion, synthesize passed evidence, or perform remote write. A fresh run enters the existing admission/dirty-tree/lease path. If archival or CAS fails, retain old checkpoint and block.

## Affected Paths

- `scripts/sdlc-execute.mjs`: proof predicate, archive and locked release, explicit-issue admission.
- `scripts/__tests__/sdlc-execute.test.mjs`: git/GitHub fixture, positive transition and rejected variants.
- `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`: document conservative release and synchronize the manual patch delivery.

## Risks and Boundaries

A merged PR alone does not imply delivery of the recorded head or incorporation into this checkout. A closed issue alone is not enough. Default branch and ancestry must be checked locally, not inferred from remote state. Archive creation must precede checkpoint removal, be exclusive and run-identified, and remain readable after a failed attempt. Existing same-run recovery and terminal cleanup are unchanged.
