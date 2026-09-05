# Root Cause Analysis: Route recoverable implementation failures into repair and reverification

**Issue**: #366
**Date**: 2026-09-05
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

## Root Cause
The existing REMEDIABLE_STEPS includes implement, and isRemediableFailedHandoff requires failed plus intervention false. The write-code bundle fails to distinguish repairable implementation work from external authority. The controller correctly obeys the resulting intervention true and stops. The missing code or design detail is not itself evidence that the approved behavior cannot be implemented.

## Fix Strategy
Change the producing workflow, not the controller safety classifier. Before escalating, read the complete active requirements/design/tasks/scenarios and bounded relevant repository contracts, distinguish engineering details from absent external facts, select an evidence-backed conservative implementation within approved outcomes, document the rationale and any in-scope design clarification, implement, and reverify. Missing code is work to implement, not an external prerequisite. Never weaken approved acceptance criteria or invent calibration/provider facts to force success. An actual need for new product scope or unavailable authority remains intervention.

When a repairable edit/test/design implementation gap remains at handoff, emit status failed, intervention false, reasonCode implementation_failed, next null, exact artifacts and attempted repairs. Preserve useful partial changes and report them honestly; passed still requires all tasks, tests, simplify, commit, push, clean tree and upstream equality. Existing publication failures retain intervention true. Fresh rN-implement sessions consume the evidence and original step contract. Do not add retries, controller coercion of intervention flags, new schema, or an attempt cap.

## Affected Paths
- workflows/write-code/WORKFLOW.md owns repair-first guidance and failure classification.
- agents/spec-implementer.md follows that contract without duplicating it.
- scripts/__tests__/sdlc-execute.test.mjs covers existing implement remediation transitions as needed.
- scripts/__fixtures__/skill-exercise/ and owning exercise runner fixtures prove worker decisions, if an existing fixture supports this path; otherwise use a disposable live OMP exercise.
- README.md documents repairable versus external blockers; skill inventory metadata changes only if required by the existing audit.

## Verification
Exercise the actual composed implementation workflow on disposable approved specs: an in-scope missing implementation detail with a failing consumer test must be repaired and reverified; an unavailable external credential/approval must remain blocked with evidence. Use deterministic controller tests for failed non-intervention implement -> rN-implement -> passed -> review1 and repeated repair identity, preserving cleanup and publication constraints. Run repository tests, applicable surface/inventory and skill validation, and the registered fresh-issue live smoke gate. Deliver through exact-head merge and issue closure; install the delivered version and verify its package version and installed surface separately.

## Risks and Mitigations
Overeager workers might interpret missing external facts as freedom to fabricate: explicitly distinguish implementation policy engineering from factual evidence and approved authority. Overbroad intervention blocks might remain: require exhausted available sources and exact missing input, not a vague missing-policy assertion. Existing stopped consumer checkpoints are not rewritten under this issue.

## Alternatives
Changing isRemediableFailedHandoff to ignore intervention was rejected because it would bypass genuine approval/authority stops. Keeping panes open was rejected because pane lifecycle is not the root cause. Reuse the existing loop and correct its producer.
