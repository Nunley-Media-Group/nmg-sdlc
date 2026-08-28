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
| T005 | Rebind an existing PR after the controller-owned version push | [ ] |
| T006 | Restore the next issue branch before retained-worker matching | [ ] |
| T007 | Harden isolated session leaf artifact boundaries | [ ] |
| T008 | Record managed steering alignment and synchronize release metadata | [ ] |

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

### T005: Rebind the Existing PR After Version Publication

**File(s)**: `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify, Verify
**Depends**: T002
**Acceptance**:
- [ ] Immediately after version push, an existing PR is re-read by its persisted PR number
- [ ] Expected head advances only for the same open PR and issue branch when its head equals this run's clean current local `HEAD`
- [ ] Foreign remote drift still persists `delivery_reconciliation_required`
- [ ] Existing-PR mocks move the remote PR head when a clean push succeeds
- [ ] Regression coverage proves merge never uses the pre-version-bump head

### T006: Restore Active Branch Before Live Ownership Matching

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify, Verify
**Depends**: Issue #291 worker ownership
**Acceptance**:
- [ ] Every non-start step restores the expected active issue branch before collision or live-worker ownership matching
- [ ] A clean default-branch checkout left by an earlier delivered issue may switch to the exact next-issue branch
- [ ] Dirty work on a foreign branch blocks checkout and is never overwritten
- [ ] A two-issue resume with an exact live next-issue worker does not report `retained_worker_mismatch`

### T007: Harden Isolated Session Leaf Artifacts

**File(s)**: `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify, Verify
**Depends**: T001
**Acceptance**:
- [ ] Resumed isolated delivery requires a regular non-symlink `run.json`
- [ ] Resumed isolated delivery requires a real non-symlink `handoffs` directory
- [ ] Unsafe leaf artifacts fail with `unsafe_session_path` before run-state reads, Git/GitHub commands, CAS writes, or handoff writes
- [ ] Regression coverage replaces each leaf with an external symlink and proves no command or redirected handoff occurs

### T008: Record Steering Alignment and Synchronize Release Metadata

**File(s)**: `VERSION`, `package.json`, `specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens/verification-report.md`
**Type**: Modify, Verify
**Depends**: T003, T004
**Acceptance**:
- [ ] The implementation explicitly aligns with the registered managed steering runtime in `steering/manifest.json`, including the `project.tech` delivery consumer and required repository verification providers
- [ ] `VERSION` remains the steering-defined version source and records release `3.18.7`
- [ ] `package.json` preserves the OMP plugin manifest and mirrors `VERSION` exactly as version `3.18.7`
- [ ] An executed Node verification parses `package.json`, reads `VERSION`, compares the two values, and exits 0 with both values reported

### T003: Propagate Scope Through Open-PR

**File(s)**: `workflows/open-pr/WORKFLOW.md`, `commands/sdlc-open-pr.md`, `README.md`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Execute-owned workers pass their controller run id on every initial, controlled-draft, remediation, and human-review controller invocation
- [ ] Standalone open-pr initializes one session token and reuses it through every rerun
- [ ] Workflow validates the exact namespace-specific handoff marker and never invents completion from exit 0
- [ ] Resolve and follow `skill://skill-creator` before editing the workflow bundle
- [ ] Packaged `commands/sdlc-open-pr.md` is regenerated exactly from the workflow body
- [ ] README documents isolated standalone delivery and exact handoff completion

### T004: Add Regression Coverage and Verify

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/open-pr-delivery-contract.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify, Verify
**Depends**: T003, T005, T006
**Acceptance**:
- [ ] AC1 covers persisted PR/head, authorized head transition, match-head merge, and exact MERGED+CLOSED pass
- [ ] AC2 covers unexpected open/merged head changes, byte-stable idempotent reconciliation, and absence of follow-up PR mutations
- [ ] AC3 covers canonical A plus isolated B and proves A's checkpoint/handoff bytes unchanged; unscoped delivery is rejected
- [ ] AC4 covers normal execute and standalone session delivery through passed handoff
- [ ] AC5 covers clean post-version-push rebinding, foreign drift rejection, remote-head mock movement, and no pre-bump merge
- [ ] AC6 covers multi-issue default-branch resume with an exact live retained worker plus dirty-work refusal
- [ ] AC7 covers symlinked isolated-session `run.json` and `handoffs` paths and proves rejection before commands or redirected writes
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
