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

### T003: Verify and deliver the repair
**File(s)**: specs/366-route-recoverable-implementation-failures-into-repair-and-reverification/verification-report.md, CHANGELOG.md, VERSION, package.json
**Type**: Modify/Create
**Depends**: T002
**Acceptance**:
- [ ] Run required repository, skill, surface and fresh consumer smoke gates and record exact evidence.
- [ ] Deliver a patch release through exact-head merged PR and closed issue.
- [ ] Install the delivered version and verify installed version and surface; do not conflate source tests with installed proof.
