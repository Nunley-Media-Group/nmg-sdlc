# Tasks: Move exact-head delivery into a controller with on-demand remediation

**Issue**: #195
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Controller | 3 | [ ] |
| Remediation | 2 | [ ] |
| Workflows | 2 | [ ] |
| Verification | 1 | [ ] |
| **Total** | 8 | |

---

### T001: Add injectable delivery controller and CLI

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Exports `runDeliver({ issue, cwd, run, fs, now, sleep })`
- [ ] Supports `--issue N` and validated `--remediation-result human_review`
- [ ] Invalid CLI prints exact usage, exits 2, and writes no handoff
- [ ] All `gh` and `git` operations use injected `run`
- [ ] Terminal valid-N paths write and print the deliver handoff path

### T002: Implement versioning and PR create/resume

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Resolves approved spec and verification readiness using existing contracts
- [ ] Preserves BREAKING major gate and bug/enhancement bump matrix
- [ ] Leftover spike does not skip bump
- [ ] Synchronizes VERSION, package.json, CHANGELOG, and steering-declared files
- [ ] Resume of an existing delivery PR does not bump a second time
- [ ] Push and PR create/resume remain exact-branch and non-force

### T003: Implement readiness, exact-head merge, and proof

**File(s)**: `scripts/sdlc-deliver.mjs`, `scripts/pr-delivery-state.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Calls `classifyPrDeliveryState` rather than duplicating its rules
- [ ] Bot identities come from typename, coderabbitai, and steering configuration
- [ ] Ready head H is passed to `gh pr merge --match-head-commit H`
- [ ] A changed head is reclassified before merge
- [ ] Passed handoff requires PR MERGED at H and issue CLOSED
- [ ] Local branch deletion occurs only after proof

### T004: Add deterministic remediation packet

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Actionable bot threads or failing in-scope checks print one `NMG_SDLC_REMEDIATION: <json>` line
- [ ] Packet includes schemaVersion, kind, issue, PR, head SHA, check names, thread context, and handoff path
- [ ] Controller exits 3 and does not report passed
- [ ] Rerun always re-fetches current state and head
- [ ] No nested OMP or worker launch exists

### T005: Bound pending delivery and human intervention

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Pending-only state observes at 30-second intervals
- [ ] One-hour ceiling writes failed `delivery_pending` intervention handoff
- [ ] Human threads and CHANGES_REQUESTED write `human_review`
- [ ] `--remediation-result human_review` writes the same controller-owned handoff
- [ ] No intervention path merges or resolves review threads

### T006: Compact open-pr workflow around controller loop

**File(s)**: `workflows/open-pr/WORKFLOW.md`, `workflows/address-pr-comments/WORKFLOW.md`
**Type**: Modify
**Depends**: T004, T005
**Acceptance**:
- [ ] Open-pr frontmatter remains stable and body invokes `scripts/sdlc-deliver.mjs --issue N`
- [ ] Exit 3 packet is handled in the same worker, followed by targeted verification, non-force push, and controller rerun
- [ ] Ambiguous remediation invokes controller human-review result
- [ ] Address-pr-comments remains on-demand guidance, not unconditional prompt text

### T007: Remove unconditional deliver extra workflow

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, prompt-byte tests, generated command surfaces if affected
**Type**: Modify
**Depends**: T006
**Acceptance**:
- [ ] `STEP_EXTRA_WORKFLOWS` retains `implement: ['simplify']` and removes deliver extras
- [ ] Deliver worker prompt contains compact Open PR but not `# Address PR Comments`
- [ ] Implement worker prompt still contains `# Simplify`
- [ ] Four sibling worker and handoff keep-open behavior remains unchanged
- [ ] Changed prompt ceilings are measured output plus 256 bytes; unrelated ceilings are unchanged

### T008: Cover controller terminal and remediation paths

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`, existing delivery/execute/prompt tests
**Type**: Create | Modify
**Depends**: T001-T007
**Acceptance**:
- [ ] Tests inject run/fs/time/sleep; no live GitHub, git mutation, or real wait
- [ ] Tests cover invalid CLI, major gate, spike bump, resume idempotence, remediation JSON, human review, pending timeout, exact-head merge, head change, merge proof, and branch deletion ordering
- [ ] Existing `classifyPrDeliveryState` tests remain authoritative
- [ ] Focused controller, execute, delivery-state, command rendering, prompt-byte, and extension tests exit 0
- [ ] Verification runs two distinct issues end to end against the real GitHub repository `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`
- [ ] The verification handoff preserves fresh issue URLs, PR URLs, head SHAs, merged PR states, and closed issue states
- [ ] Missing GitHub auth, repository access, Herdr execution, merge proof, or closure proof fails verification rather than falling back to fixtures

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #195 | 2026-08-21 | Initial feature spec |
