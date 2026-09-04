# Root Cause Analysis: Make completed delivery re-entry idempotent after branch restoration

**Issue**: #362
**Date**: 2026-09-04
**Status**: Approved
**Author**: NMG

---

## Root Cause

`runDeliverUnlocked` reads the approved spec and `verification-report.md`, evaluates readiness, loads steering, and requires an issue branch before reading `namespace.runState.delivery`. A successful delivery restores the default branch after merge. If the worker invokes delivery again before settlement, that local branch can lack the newly merged report. The second invocation throws `verification_not_ready` before reaching the existing merged-PR proof path and overwrites the passed handoff.

Observed during required smoke verification for nmg-sdlc #360: smoke issue #79 merged through PR #81 at expected head `adc54e8e9defe439ac7eb745640681b7e806603d`, closed the issue, and wrote `.omp/sdlc/smoke-deliveries/79.json`; the repeated invocation then wrote a failed deliver handoff.

## Fix Strategy

Add an early terminal-resume path immediately after argument/session checks and before `approvedSpec`:

1. Enter only when persisted delivery status is exactly `complete` and contains a valid pull-request number and expected head.
2. Read that exact PR and issue through existing GitHub JSON helpers.
3. Require the PR number and head to match persisted identity, PR state `MERGED`, and issue state `CLOSED`.
4. On success, write the normal passed delivery handoff without any git or GitHub mutation.
5. On mismatch, reuse the existing reconciliation or merge-proof failure classifications.

Extract the smallest shared terminal-proof helper if needed so the normal merged path and early resume cannot drift. Do not load the local spec, readiness report, steering runtime, branch, version, or dirty-tree state on a valid terminal resume.

## Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-deliver.mjs` | Add exact terminal persisted-delivery re-entry before local issue-branch prerequisites. | Makes successful delivery idempotent after restoration. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Cover restored-default success, no mutations, head/PR mismatch, open issue, and normal paths. | Locks AC1–AC4 and fail-closed boundaries. |

## Risks

| Risk | Mitigation |
|------|------------|
| Historical success is accepted | Require status `complete`, exact persisted PR number/head, remote merged state, and closed issue. |
| Re-entry mutates state | Assert absence of git and GitHub mutation commands. |
| Normal delivery bypasses verification | Early path is unreachable unless persisted status is exactly `complete`. |

## Steering Alignment

Delivery remains in `scripts/sdlc-deliver.mjs`; controller state remains authoritative only when corroborated by exact remote terminal proof. The change preserves the registered product, technical, structure, and verification runtime and exact-head delivery contract.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #362 | 2026-09-04 | Initial root cause analysis |
