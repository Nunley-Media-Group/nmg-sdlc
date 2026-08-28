# Tasks: Enforce one controller writer and close stale workers

**Issue**: #291
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/290-bind-sdlc-run-checkpoints-to-project-identity-with-cas-writes/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add exclusive controller lease and helper guards | [ ] |
| T002 | Bind worker ownership and close owned panes | [ ] |
| T003 | Add coordination and cleanup regressions | [ ] |
| T004 | Verify controller suites and public contracts | [ ] |
| T005 | Remove all prompt-size ceiling contracts | [ ] |
| T006 | Document delivery-generated and public-contract path coverage | [ ] |

---

### T001: Add Exclusive Controller Lease

**File(s)**: `scripts/sdlc-controller-lease.mjs`, `scripts/sdlc-execute.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/sdlc-verify-steering.mjs`
**Type**: Create, Modify
**Depends**: Issue #290 implementation
**Acceptance**:
- [ ] Execute acquires `.omp/sdlc/controller.lock` with `wx` after read-only preflight and before any controller mutation
- [ ] Lease identity includes canonical project root, checkpoint run id, controller pane, pid, and start time
- [ ] A second execute fails `controller_lease_held` without changing run state, handoffs, branches, verification evidence, or pull requests
- [ ] Verify/deliver with an active lease require an exact `--controller-run-id`; standalone use remains allowed when no lease exists
- [ ] Owner-only release runs on every ordinary return and handled `SIGINT` / `SIGTERM`; foreign leases are never removed

### T002: Bind and Clean Up Owned Workers

**File(s)**: `scripts/sdlc-execute.mjs`, `workflows/execute/WORKFLOW.md`, `workflows/open-pr/WORKFLOW.md`, `workflows/verify-code/WORKFLOW.md`, `README.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `runState.workers` records exact name, pane, project root, run id, issue, step, branch, and head through issue #290 CAS writes
- [ ] Retained discovery looks up only `s${issue}-${step}` and reuses it only when the live pane and full ownership/current checkout identity match
- [ ] Prefix collisions and missing/mismatched ownership stop with `retained_worker_mismatch` and leave unrelated panes open
- [ ] Terminal stop and cancellation close only matching controller-owned panes by default and remove their ownership records
- [ ] `/sdlc-execute --retain-worker [#N ...]` is the sole keep-open escape and refreshes retained branch/head metadata
- [ ] Execute-scoped verify/deliver workers receive and pass their checkpoint run id
- [ ] Resolve and follow `skill://skill-creator` before editing workflow-bundled files; update README for the user-visible flag

### T003: Add Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, applicable verification controller test file
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] AC1 covers second execute plus unscoped verify/deliver rejection and proves protected artifacts remain byte-for-byte unchanged
- [ ] AC2 covers exact same-run reuse, `s42-controller` prefix collision, wrong pane/project/run/issue/step/branch/head, and unrelated-pane preservation
- [ ] AC3 covers default stop cleanup, explicit retention, successful passed-handoff close, and handled cancellation cleanup
- [ ] Lease release tests prove only the owner-created file is removed
- [ ] Every `@regression` scenario in `feature.gherkin` maps to a Jest case

### T004: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, workflow and prompt contract suites
**Type**: Verify (no file changes)
**Depends**: T003, T005
**Acceptance**:
- [ ] Focused execute, delivery, verification, prompt registry/rendering, and workflow contract suites exit 0
- [ ] Multi-issue, remediation, retained-worker resume, passed-handoff close, and standalone verify/deliver fixtures still pass
- [ ] `node scripts/verify-current-specs.mjs`, the full repository test command, and `git diff --check` exit 0

### T005: Remove All Prompt-Size Ceiling Contracts

**File(s)**: `src/sdlc-prompt-snippets.mjs`, `src/sdlc-steering-runtime.mjs`, `scripts/sdlc-steering.mjs`, `scripts/sdlc-upgrade.mjs`, `scripts/__tests__/rendered-prompt-contract.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`, `scripts/__tests__/sdlc-steering-runtime.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`, `references/steering-schema.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Delete automated-body and worker-prompt ceiling constants and every UTF-8 size assertion
- [ ] Delete plugin and builtin fragment `byteBound` declarations, the worker-header bound, and registration/render exceeded-bound checks
- [ ] Reject `byteBound` as an unknown fragment or project-manifest key; do not accept, ignore, strip, alias, or enforce it
- [ ] Reject initialize and migration snippet inputs containing `byteBound` or any unknown field before returning plan actions or manifest output
- [ ] Canonicalize every accepted manifest/snippet writer record by explicit key selection rather than arbitrary-field spread
- [ ] Prove rejected initialize and migration inputs return no plan, create no actions/output files, and leave input objects and existing steering files byte-for-byte unchanged
- [ ] Preserve non-size structural validation, prompt provenance byte counts, placeholder expansion, deterministic ordering, hashes, provider/consumer/slot rules, source-path confinement, and non-empty bodies
- [ ] Preserve every #291 controller lease, worker ownership, and cleanup path
- [ ] Record explicit supersession of prompt-quota rules from #193, #259, #265, and #271

### T006: Cover Delivery and Public-Contract Artifacts

**File(s)**: `NMG_SDLC_STEERING_PLAN.md`, `VERSION`, `commands/sdlc-execute.md`, `commands/sdlc-open-pr.md`, `commands/sdlc-verify-code.md`, `package.json`, `workflows/execute/references/selection.md`
**Type**: Verify delivery-generated and public-contract changes
**Depends**: T001, T002, T004, T005
**Acceptance**:
- [ ] `NMG_SDLC_STEERING_PLAN.md` exposes steering fragment identity, path, consumer, slot, and order without restoring removed live-byte or bound contracts; steering-runtime and full-suite evidence cover this generated plan behavior
- [ ] `VERSION` and `package.json` remain synchronized at the delivery-selected patch release; delivery-controller tests prove both Node version artifacts are updated together
- [ ] `commands/sdlc-execute.md` accepts `--retain-worker` at most once, removes it before empty-selection handling, forwards it to `run`, and documents default owned-pane cleanup; execute parser, prompt, retention, and cleanup regressions cover the rendered command contract
- [ ] `commands/sdlc-open-pr.md` forwards the exact non-empty controller run id to initial, remediation, and repeated delivery-controller invocations while preserving standalone omission; delivery CLI and execute prompt regressions cover scoped and standalone behavior
- [ ] `commands/sdlc-verify-code.md` forwards the exact non-empty controller run id to steering verification and verification finalization while preserving standalone omission; verification-runtime and finalization lease regressions cover both calls
- [ ] `package.json` preserves the OMP extension manifest while matching `VERSION`; delivery and extension-command tests cover version synchronization and the packaged extension declaration
- [ ] `workflows/execute/references/selection.md` treats an optional `--retain-worker` as a flag rather than an issue token and forwards it exactly once after selected issue numbers; execute parsing and default-backlog regressions cover selection behavior

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the coordination defect
- [x] Regression coverage is included
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep into issues #290, #292, or #293
- [x] File paths reference actual project structure (per `structure.md`)
