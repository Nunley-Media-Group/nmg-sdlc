# Tasks: Route recoverable implementation failures into repair and reverification

**Issue**: #366
**Date**: 2026-09-05
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/

### T001: Correct repair-first implementation guidance
**File(s)**: workflows/write-code/WORKFLOW.md, agents/spec-implementer.md, README.md
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Resolve skill-creator before bundled edits and inspect the complete affected bundle.
- [ ] Distinguish missing in-scope implementation detail from unavailable external authority and repair/reverify before escalation.
- [ ] Produce remediable failed handoffs for repairable work; preserve explicit genuine blockers and all publication gates.

### T002: Exercise worker decisions and controller recovery
**File(s)**: scripts/__tests__/sdlc-execute.test.mjs, scripts/__fixtures__/skill-exercise/, scripts/skill-inventory.baseline.json
**Type**: Modify only where required
**Depends**: T001
**Acceptance**:
- [ ] Behavioral evidence covers AC1-AC4 without source-text-only assertions.
- [ ] A disposable live OMP exercise proves repair and reverification for an in-scope missing component and truthful stop for external authority.
- [ ] The controller retains original implement identity and does not advance review before a passed published implementation.

### T003: Record implementation verification and delivery prerequisites
**File(s)**: specs/366-route-recoverable-implementation-failures-into-repair-and-reverification/verification-report.md, CHANGELOG.md
**Type**: Modify/Create
**Depends**: T002
**Acceptance**:
- [ ] Run the implementation-owned repository, skill, surface and live worker checks and record exact evidence.
- [ ] Document fresh consumer smoke, release and installed verification as mandatory downstream boundaries, not tasks the implement worker may execute ahead of review.

## Downstream Delivery Requirements

These remain required for issue completion. They are not prerequisites for an implementation handoff: the normal pipeline must first reach their owning stage.

- The verify worker runs the registered fresh consumer smoke gate using the orchestrator-provisioned `NMG_SDLC_SMOKE_ISSUES` queue and records exact evidence.
- The deliver worker synchronizes VERSION/package.json and delivers a patch release through exact-head merged PR and closed issue.
- The requesting orchestrator installs the delivered version and verifies installed version and surface, separately from source evidence.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #366 | 2026-09-05 | Clarify stage ownership after the implementation worker correctly refused to perform downstream merge and installation before review; all delivery requirements remain mandatory. |
