# Verification Report: Enforce one controller writer and close stale workers

**Date**: 2026-08-28
**Issue**: #291
**Reviewer**: Codex
**Scope**: Fresh implementation verification against approved AC1-AC4 at `8e011965e18ca4fa391b3c96bd29d8aa80abcb44`

---

## Executive Summary

Issue #291 passes its extended contract. Exclusive controller ownership, exact retained-worker identity, conservative pane cleanup, and quota-free prompt composition are implemented and covered by behavioral regressions. The full repository suite passed 713 tests. Focused large-prompt tests passed 35 tests, including an 8,193-byte project fragment and a 100,000-byte plugin fragment. Deterministic steering coverage is complete and both required validations passed against the exact requested head. Before report replacement, the issue branch matched its upstream (`0 0`) and the worktree was clean.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | **4.7** |

### Implementation Status: Pass

**Total Issues**: 0

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/291.json`
- Generated: `2026-08-28T07:16:31.867Z`
- Head: `8e011965e18ca4fa391b3c96bd29d8aa80abcb44`
- Spec hash: `sha256:ffbe7966bfa4ee84994eed25ff1caeaa34f610d144590e1efa113b4e358760a1`
- Coverage: `declared: 2`, `recorded: 2`, `complete: true`
- Ceiling: none
- `repository.tests`: Passed
- `repository.nmg-sdlc-smoke`: Passed

## Issue Scope

- Active issue: #291
- Spec: `specs/291-enforce-one-controller-writer-and-close-stale-workers`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: issue #290 AC [AC1, AC2]; FR [FR1, FR2, FR3]; scenarios [SCN001, SCN002]

<!-- nmg-sdlc-issue-scope: {"issueNumber":291,"specPath":"specs/291-enforce-one-controller-writer-and-close-stale-workers","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":["AC1","AC2"],"functionalRequirements":["FR1","FR2","FR3"],"scenarios":["SCN001","SCN002"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Competing controllers and unscoped phase helpers fail closed before mutation. | Pass | `scripts/sdlc-controller-lease.mjs` acquires the canonical lock with exclusive `wx`; `scripts/sdlc-execute.mjs:1463-1477` acquires before controller mutation; delivery and verification finalization assert the exact scoped run id. Regressions prove protected run, handoff, version, changelog, and controller calls remain unchanged. |
| AC2 | Retained reuse requires exact worker and checkout identity. | Pass | `scripts/sdlc-execute.mjs:1234-1253` compares worker name, pane, canonical root, run id, issue, step, branch, and head; exact-name discovery and `retained_worker_mismatch` paths are covered for prefix collisions, missing metadata, and every mismatched identity field. |
| AC3 | Controller-owned panes close by default; explicit retention is the sole exception. | Pass | `scripts/sdlc-execute.mjs:1256-1302` closes only fully recorded ownership; signal cleanup releases the controller lease; successful retained and newly created workers close and advance. Tests cover default stop, `--retain-worker`, successful handoff, cancellation, owner-only release, and unrelated-pane preservation. |
| AC4 | Structurally valid prompt composition has no byte ceiling. | Pass | `src/sdlc-prompt-snippets.mjs:49-57` excludes `byteBound` from the fragment schema; registration and rendering retain structural checks but contain no quota comparison; catalog tuples and worker header contain no bound. `src/sdlc-steering-runtime.mjs:135-142` accepts exactly `{id,path,consumers,slot,order}`. Focused tests render 8,193-byte project and 100,000-byte plugin fragments, preserve provenance byte counts and placeholder expansion, and reject `byteBound` as `unknown_key`. |

## Regression Obligations

| Contract | Status | Evidence |
|----------|--------|----------|
| #290 AC1 / FR1-FR2 / SCN001: identity-bound CAS rejects stale or mismatched writes without changing bytes | Pass | Full execute regressions passed; worker ownership persists through the existing `persistRunState` CAS boundary rather than introducing an alternate writer. |
| #290 AC2 / FR3 / SCN002: same-identity lifecycle transitions update mutable workflow fields only | Pass | Multi-issue, remediation, retained-worker resume, passed-handoff close, and standalone phase-controller fixtures passed in the full suite. |
| #193 unrelated prompt rendering and workflow composition | Pass | Structural rendered-prompt tests, owned-workflow composition tests, ordering, and full repository regressions passed. Only historical quota rules are superseded. |
| #259 unrelated controller remediation and fresh-session lifecycle | Pass | Execute remediation and lifecycle suites passed; AC4 removes no controller behavior. |
| #265 unrelated plugin/builtin prompt registration behavior | Pass | Provider, consumer, slot, ordering, source, hash, placeholder, and non-empty-body checks remain covered and passed. Only `byteBound` compatibility is removed. |
| #271 unbounded project snippet loading and unrelated steering behavior | Pass | Project snippets load and render through the canonical schema; large project-fragment behavior and steering runtime suites passed. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add exclusive controller lease and helper guards | Complete | Shared owner-bound lease and scoped execute/verify/deliver guards are present and covered. |
| T002 | Bind worker ownership and close owned panes | Complete | Exact ownership, default cleanup, explicit retention, run-id propagation, workflows, commands, README, and changelog are synchronized. |
| T003 | Add coordination and cleanup regressions | Complete | All SCN001-SCN003 cases map to passing Jest coverage. |
| T004 | Verify controller suites and public contracts | Complete | Focused suites, full repository suite, current-spec validation, and patch hygiene passed. |
| T005 | Remove all prompt-size ceiling contracts | Complete | Quota constants/tests/enforcement and fragment bounds are removed; `byteBound` is unknown; structural validation and provenance remain. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | Lease authority is isolated from controller lifecycle and prompt composition remains isolated from steering manifest loading. |
| Open/Closed | 4 | Shared lease helpers support execute, verification, and delivery without duplicated locking; the prompt registry retains extension points through canonical fragments. |
| Liskov Substitution | 4 | Injected run, filesystem, Herdr, process, and provider adapters remain substitutable in fixtures. |
| Interface Segregation | 5 | Lease and fragment interfaces expose only the fields each consumer requires. |
| Dependency Inversion | 4 | Controllers depend on injected side-effect adapters; filesystem locking appropriately remains a concrete process-bound primitive. |

### Layer Separation

Filesystem lease mechanics remain in a zero-dependency shared module. Execute owns worker lifecycle. Verify and deliver controllers only assert scoped authority. Prompt fragments validate and render independently of steering manifest loading. Steering runtime supplies canonical project fragments without owning prompt-size policy.

### Dependency Flow

Controllers depend on the lease module; the lease module does not depend on controllers or Herdr. Steering runtime depends on allowed prompt consumers/slots and emits canonical fragments; the prompt registry remains the structural rendering authority. No compatibility path creates a second quota or ownership implementation.

## Security Assessment

**Score: 5/5.** Exclusive `wx` lock creation, canonical roots, exact serialized owner checks before unlink, exact scoped run ids, fail-closed malformed leases, argument-array command execution, and exact pane ownership prevent foreign mutation and destructive cleanup. Removing prompt quotas does not weaken path confinement, provider allowlists, consumer/slot validation, placeholders, or non-empty-body checks.

## Performance Assessment

**Score: 5/5.** Lease operations are bounded constant-time filesystem work. Exact worker lookup avoids prefix-driven selection. Prompt rendering remains linear in actual prompt size and computes hashes/provenance once; no duplicate size-enforcement pass or avoidable copy was added. Large-prompt tests complete deterministically.

## Testability and Error Handling

- **Testability: 5/5.** Controller dependencies are injected. Prompt registry and steering runtime use deterministic fixtures. Coverage includes exact protected bytes, every ownership field, signals, owner-only release, large project/plugin fragments, unknown legacy keys, placeholders, ordering, hashes, and provenance.
- **Error Handling: 4/5.** Stable `controller_lease_held`, `retained_worker_mismatch`, `pane_close_failed`, and `unknown_key` classifications fail closed. Cleanup preserves unresolved ownership records rather than claiming success. Errors are operationally specific without exposing secrets.

## Test Coverage

### BDD Scenarios

| Scenario | Acceptance Criterion | Jest Coverage | Result |
|----------|----------------------|---------------|--------|
| SCN001 | AC1 | Execute, delivery, steering verification, and finalization lease fixtures | Pass |
| SCN002 | AC2 | Exact reuse, prefix collision, and all identity-field mismatch fixtures | Pass |
| SCN003 | AC3 | Stop, retention, success, cancellation, and unrelated-pane fixtures | Pass |
| SCN004 | AC4 | Prompt registry, steering runtime, and rendered prompt contract fixtures | Pass |

### Test Results

| Command | Result | Evidence |
|---------|--------|----------|
| `npm test -- --runInBand` from `scripts/` | Pass | 49 suites passed, 1 skipped; 713 tests passed, 2 skipped; exit 0. |
| Focused quota-free prompt suites | Pass | 3 suites and 35 tests passed; exit 0. |
| `node scripts/verify-current-specs.mjs` | Pass | 54 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, and 1 deprecated stub verified. |
| `git diff --check` | Pass | Exit 0 with no output. |

## Quota-Free Large-Prompt Evidence

| Surface | Evidence | Result |
|---------|----------|--------|
| Project fragment | `sdlc-prompt-snippets.test.mjs` registers and renders `'x'.repeat(8193)` | Pass |
| Plugin/builtin fragment | Same suite renders `prefix + 100,000 x characters + {{value}}` and expands the placeholder | Pass |
| Fragment schema | `byteBound` is absent from `FRAGMENT_KEYS` and is rejected as `unknown_key` | Pass |
| Project manifest schema | Steering runtime requires exactly `id`, `path`, `consumers`, `slot`, and `order`; leftover `byteBound` is rejected | Pass |
| Automated bodies and worker prompts | Historical ceiling constants and size assertions are absent; `rendered-prompt-contract.test.mjs` retains owned-workflow and controller-result behavior | Pass |
| Provenance | Rendered total and per-fragment byte counts remain observational metadata and match actual UTF-8 output | Pass |

## Path-Specific Delivery Evidence

| Path | Required behavior | Verification evidence |
|------|-------------------|-----------------------|
| `NMG_SDLC_STEERING_PLAN.md` | The generated steering plan lists each prompt fragment's identity, path, consumers, slot, and order without the removed live-byte and bound columns or quota instructions. | The focused steering-runtime and prompt suites passed as part of the 35-test quota-free run; the full 713-test suite passed; `.omp/sdlc/verification/291.json` records complete `repository.tests` and `repository.nmg-sdlc-smoke` steering coverage at the verified head. |
| `VERSION` | Delivery advances the single version source to the selected patch release and keeps it synchronized with the Node package mirror. | `scripts/__tests__/sdlc-deliver.test.mjs` passed in the full suite, including fresh delivery and resume cases that assert the updated `VERSION` value and synchronized package version. |
| `commands/sdlc-execute.md` | The public command accepts `--retain-worker` at most once, removes it before deciding whether issue selection is empty, forwards it once to `run`, and otherwise documents default controller-owned pane cleanup. | `scripts/__tests__/sdlc-execute.test.mjs` passed in the full suite, including parser acceptance/rejection, default-backlog, explicit retention, default stop cleanup, and worker-prompt propagation cases. |
| `commands/sdlc-open-pr.md` | The deliver worker forwards the exact non-empty controller run id to initial, remediation, and repeated controller invocations, while standalone delivery omits the option. | `scripts/__tests__/sdlc-deliver.test.mjs` and `scripts/__tests__/sdlc-execute.test.mjs` passed, covering delivery CLI parsing, scoped authority, standalone delivery, and the worker prompt's `--controller-run-id R` contract. |
| `commands/sdlc-verify-code.md` | Verification forwards the exact non-empty controller run id to both steering verification and report finalization, while standalone verification omits the option. | `scripts/__tests__/sdlc-verification-runtime.test.mjs` and the verification finalization/lease coverage passed in the full suite, including exact scoped-run acceptance and unscoped rejection under an active lease. |
| `package.json` | The package version matches `VERSION` and the manifest remains an OMP extension rooted at `./src/extension.ts`. | Delivery tests passed their synchronized Node-version assertions; `scripts/__tests__/extension-commands.test.mjs` and plugin-surface coverage passed the unchanged extension-manifest contract. |
| `workflows/execute/references/selection.md` | Empty-selection handling occurs only after removing optional `--retain-worker`, and selected issue numbers plus the flag are forwarded exactly once to `run`. | Execute parser and default-backlog regressions passed in `scripts/__tests__/sdlc-execute.test.mjs`, covering flag placement among issue tokens, duplicate rejection, empty issue selection, resolved ordering, and one controller invocation. |

## Exercise Test Results

| Field | Value |
|-------|-------|
| Surface exercised | `/sdlc-status --json` against `Nunley-Media-Group/nmg-sdlc-smoke` |
| Method | Deterministic `repository.nmg-sdlc-smoke` steering provider using this checkout |
| Result | Pass |
| Captured output | Valid JSON with `nextAction.command: /sdlc-draft-issue` |

The live smoke proves this checkout remains loadable in a real consumer project. AC1-AC4 behavior is established by the deterministic controller and prompt-registry fixtures; no mutating GitHub exercise was required.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | Scoped steering artifact records `npm test -- --runInBand` exit 0 at exact head `8e011965e18ca4fa391b3c96bd29d8aa80abcb44`. |
| `repository.nmg-sdlc-smoke` | Pass | Live consumer status returned a valid `/sdlc-draft-issue` next action. |

**Gate Summary**: 2/2 passed, 0 failed, 0 incomplete; coverage complete.

## Branch and Worktree Evidence

- Branch: `291-enforce-one-controller-writer-and-close-stale-workers`
- Verified head: `8e011965e18ca4fa391b3c96bd29d8aa80abcb44`
- Upstream divergence before report replacement: `0 0`
- Worktree before report replacement: clean
- The only intended verification-stage change is this report; `sdlc-finalize-verification` owns its commit, push, synchronization recheck, clean-worktree check, publication handoff, and lease-scoped finalization.

## Fixes Applied

None. Verification did not edit implementation code.

## Remaining Issues

None.

## Positive Observations

- The controller race is fixed at the authority boundary, not hidden by agent-name filtering.
- Exact ownership includes every identity field required by AC2.
- Pane cleanup remains conservative under mismatches and failures.
- AC4 is a clean cutover: obsolete quota keys fail closed instead of being silently ignored.
- Large prompt composition retains all security-relevant structural validation and byte-count provenance.
- Full source tests and live consumer smoke both pass at the requested head.

## Recommendations Summary

### Before PR (Must)

- None.

### Short Term (Should)

- None.

### Long Term (Could)

- None within issue #291 scope.

## Files Reviewed

| Area | Files | Findings |
|------|-------|----------|
| Lease authority | `scripts/sdlc-controller-lease.mjs`, lease tests | 0 |
| Execute ownership and cleanup | `scripts/sdlc-execute.mjs`, execute tests | 0 |
| Scoped phase helpers | delivery, steering verification, and finalization controllers/tests | 0 |
| Prompt quota removal | prompt snippets, steering runtime/controller, rendered prompt and registry tests | 0 |
| Workflow/public contracts | execute/open-pr/verify workflows, commands, README, changelog, steering schema | 0 |
| Specs and regressions | issue #291 package and related issue #290 contract | 0 |

## Recommendation

**Ready for PR.** AC1-AC4, FR1-FR5, T001-T005, SCN001-SCN004, related #290 regression obligations, and the preserved non-quota behavior from issues #193, #259, #265, and #271 all pass. Deterministic steering is complete with no ceiling.
