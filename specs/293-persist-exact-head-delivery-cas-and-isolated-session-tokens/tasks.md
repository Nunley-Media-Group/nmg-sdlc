# Tasks: Persist exact-head delivery CAS and isolated session tokens

**Issue**: #293
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add scoped delivery namespaces and session initialization | [ ] |
| T002 | Persist expected PR/head and reconciliation through CAS | [ ] |
| T003 | Update open-pr scope propagation and public docs | [ ] |
| T004 | Add exact-head, isolation, and terminal-proof regressions | [ ] |

---

### T001: Add Scoped Delivery Namespaces

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: Issues #290 and #291 implementation
**Acceptance**:
- [ ] Every mutating delivery requires exactly one of matching `--controller-run-id` or valid `--session-token`
- [ ] Missing, conflicting, wrong-project, wrong-issue, or wrong-run scope fails before run, handoff, git, or GitHub mutation
- [ ] `session-init --issue N` creates one UUID-bound `.omp/sdlc/sessions/<token>/run.json` with revision 1 and prints the token
- [ ] Session CAS uses the same lock/compare/atomic/identity invariants as canonical issue #290 state without changing canonical `writeRun` signature
- [ ] Session handoffs stay under their session directory; canonical checkpoint/handoff bytes remain unchanged

### T002: Bind Exact Delivery Identity

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Selected or created PR number and expected head are CAS-persisted before ready, poll, or merge mutation
- [ ] Controlled H1→H2 and remediation head advances require same scope/PR/branch, prior expected head, clean current local head, and one successful CAS
- [ ] Every snapshot and merge uses the persisted PR number/head; merge passes `--match-head-commit <expectedHead>`
- [ ] Unexpected PR/head/merged identity persists `delivery_reconciliation_required` once with expected/observed evidence
- [ ] Reconciliation reruns perform no PR discovery/create, push, ready, or merge and return the same failed handoff
- [ ] Passed handoff is written only after the persisted PR is MERGED at the persisted head and the issue is CLOSED

### T003: Propagate Scope Through Open-PR

**File(s)**: `workflows/open-pr/WORKFLOW.md`, `README.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Execute-owned workers pass their controller run id on every initial, controlled-draft, remediation, and human-review controller invocation
- [ ] Standalone open-pr initializes one session token and reuses it through every rerun
- [ ] Workflow validates the exact namespace-specific handoff marker and never invents completion from exit 0
- [ ] Resolve and follow `skill://skill-creator` before editing the workflow bundle
- [ ] README documents isolated standalone delivery and exact handoff completion

### T004: Add Regression Coverage and Verify

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/open-pr-delivery-contract.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify, Verify
**Depends**: T003
**Acceptance**:
- [ ] AC1 covers persisted PR/head, authorized head transition, match-head merge, and exact MERGED+CLOSED pass
- [ ] AC2 covers unexpected open/merged head changes, byte-stable idempotent reconciliation, and absence of follow-up PR mutations
- [ ] AC3 covers canonical A plus isolated B and proves A's checkpoint/handoff bytes unchanged; unscoped delivery is rejected
- [ ] AC4 covers normal execute and standalone session delivery through passed handoff
- [ ] Every `@regression` scenario maps to a Jest case
- [ ] Focused execute, delivery, open-pr/prompt contract suites, `node scripts/verify-current-specs.mjs`, and `git diff --check` exit 0

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on exact-head delivery identity and isolated state
- [x] Regression coverage is included
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep into review selection or hosted contribution path mapping
- [x] File paths reference actual project structure (per `structure.md`)
