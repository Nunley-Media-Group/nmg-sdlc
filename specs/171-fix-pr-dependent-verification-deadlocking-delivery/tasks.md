# Tasks: Fix PR-Dependent Verification Deadlocking Delivery

**Issue**: #171
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Implement the shared verification-readiness contract | [x] |
| T002 | Produce qualified pending and satisfied verification evidence | [x] |
| T003 | Keep lifecycle status consistent and read-only | [x] |
| T004 | Implement controlled draft delivery and final-SHA readiness | [x] |
| T005 | Add deterministic deadlock and regression exercises plus docs | [x] |
| T006 | Run complete verification and record evidence | [x] |

Every file under `skills/` and `references/` is skill-bundled and must be created or modified through `$skill-creator`. There is no direct-edit fallback.

---

### T001: Implement the Shared Verification-Readiness Contract

**File(s)**: `references/pr-dependent-verification.md`, `scripts/verification-readiness.mjs`, `scripts/__tests__/verification-readiness.test.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [x] Route the shared-reference creation through `$skill-creator` and define schema version 1, exact pending/satisfied states, consumer result table, field bounds, and preservation rules
- [x] Parse exactly one `nmg-sdlc-pr-readiness` marker as data and never execute or interpolate report content
- [x] Compare issue number, spec path, active delivery/regression identifiers, tests, and steering-gate completion with the existing normalized issue-scope evidence
- [x] Accept only bounded PR-event `required_check`/`check_run` and intrinsically PR-only `merge_blocking` items mapped to active delivery acceptance criteria
- [x] Require exact head SHA, conclusion, URL, and kind-specific observations for satisfied evidence
- [x] Reject missing/duplicate/malformed markers, unknown keys/kinds, generic non-Pass status, scope drift, local omissions, failed/incomplete gates, stale/mismatched evidence, and size/bound violations with stable reason codes
- [x] Expose a zero-dependency reusable function and JSON CLI with stable exit codes and no filesystem or GitHub mutation

**Notes**: The helper classifies machine evidence; it does not select product exceptions, create PRs, run checks, or mutate reports.

### T002: Produce Qualified Pending and Satisfied Verification Evidence

**File(s)**: `skills/verify-code/SKILL.md`, `skills/verify-code/references/report-format.md`, `skills/verify-code/checklists/report-template.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] Use `$skill-creator` for every skill-bundled edit and validate the affected bundle
- [x] Read the shared contract before status aggregation and distinguish Pass, PR Evidence Pending, Partial, Incomplete, and Fail
- [x] Emit pending readiness only after every local delivery/regression obligation, task, scenario, test, architecture finding, and applicable steering gate passes
- [x] Enumerate each qualifying pending item with an allowlisted kind, exact name, and mapped delivery acceptance criteria; never infer it from prose
- [x] When an exact draft PR exists, collect head SHA, required check names, conclusions, links, and merge-blocking observations and emit `pr_evidence_satisfied` only when all declared evidence succeeds
- [x] Keep the local report and GitHub issue comment structurally identical and preserve the existing one-line issue-scope marker
- [x] Generic Partial, Incomplete, Fail, stale-scope, local-failure, and unrecognized-evidence reports remain non-deliverable and receive no qualifying marker

### T003: Keep Lifecycle Status Consistent and Read-Only

**File(s)**: `skills/status/SKILL.md`, `scripts/sdlc-status.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__tests__/status-skill-contract.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [x] Route the status skill edit through `$skill-creator` and point it to the shared contract
- [x] Import the deterministic validator and apply existing report commit/ancestry/implementation freshness checks to valid pending and satisfied evidence
- [x] Collect `isDraft`, `headRefOid`, `mergeStateStatus`, and check state through read-only bounded GitHub queries
- [x] Infer `delivery-validation-pending` for current qualified pending evidence before or during controlled draft delivery
- [x] Report `local verification` complete, `PR evidence` missing, and `$nmg-sdlc:open-pr #N` as the owning next action without claiming full Pass
- [x] Keep generic non-Pass, stale, malformed, scope-mismatched, failed-check, and unavailable evidence at the existing conservative boundary with named gaps
- [x] Preserve schema-versioned JSON, stdout purity, deterministic rendering, and the complete read-only command boundary

### T004: Implement Controlled Draft Delivery and Final-SHA Readiness

**File(s)**: `skills/open-pr/SKILL.md`, `skills/open-pr/references/pr-body.md`, `skills/open-pr/references/ci-monitoring.md`, `skills/open-pr/references/pr-dependent-delivery.md`, `scripts/__tests__/open-pr-delivery-contract.test.mjs`
**Type**: Create / Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [x] Use `$skill-creator` for every open-pr bundle edit and validate the affected bundle
- [x] Preserve the ordinary current-Pass path byte-for-behavior while allowing only valid `pr_evidence_pending` to enter the draft path
- [x] Run the existing scope, version, staging, commit, rebase, force-with-lease, push, and pushed-state gates before draft creation
- [x] Create with `gh pr create --draft` or reuse only an open draft with exact repository, base, head branch, active issue closing reference, and marker identity
- [x] Capture all declared evidence for exact draft head H1, including required check names, conclusions, links, and merge-blocking observations; fail on absent, stale, unknown, failed, cancelled, or timed-out results
- [x] Rerun `$nmg-sdlc:verify-code #N`, require current issue-scoped Pass plus satisfied H1 evidence, commit and safely push any report update, and capture the resulting H2
- [x] Re-evaluate every required check for exact H2, record final H2 evidence in the PR body without changing the head, and call `gh pr ready` only after the record is verified
- [x] Continue to existing automated-review, CI, mergeability, `mergeStateStatus == CLEAN`, explicit merge-choice, and cleanup gates only after readiness
- [x] On every validation failure preserve the feature branch and draft PR and forbid ready, merge, checkout, branch deletion, false Pass, and protection mutation

### T005: Add Deterministic Deadlock and Regression Exercises Plus Docs

**File(s)**: `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs`, `scripts/__fixtures__/pr-dependent-verification/`, `README.md`, `scripts/skill-inventory.baseline.json`
**Type**: Create / Modify
**Depends**: T004
**Acceptance**:
- [x] Reproduce the PathCast #122 boundary with valid local completion and qualified required-check/merge-blocking evidence
- [x] Exercise the H1 draft evidence, verification-report push to H2, final-H2 recheck, recorded evidence, and ready transition with deterministic command/state fixtures
- [x] Add companion pre-PR-capable check, generic Partial, failed-gate, stale-scope, malformed-marker, unknown-kind, stale-head, failed/cancelled/timed-out check, and ordinary Pass fixtures
- [x] Prove only the qualified pending fixture may create/reuse a draft and only fully revalidated H2 may become ready
- [x] Prove every failure preserves the branch/draft and emits no ready, merge, delete, checkout, or protection-mutation command
- [x] Document the local-verification/delivery-validation split, controlled draft lifecycle, status output, exact-SHA rule, and ordinary-path compatibility in README
- [x] Refresh the inventory baseline only for inspected intentional drift

### T006: Run Complete Verification and Record Evidence

**File(s)**: all issue #171 implementation, test, documentation, spec, and approved release files (`.codex-plugin/plugin.json`, `VERSION`, `CHANGELOG.md`)
**Type**: Verify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- [x] Run focused readiness, status, open-pr, and deterministic exercise suites with all cases passing
- [x] Run the complete Jest suite from `scripts/` with no unexpected failures, skips, or orphaned imports
- [x] Run skill inventory, Codex compatibility, active plugin surface, every applicable changed-skill exercise, skill-creator validation, prompt-quality review, and `git diff --check`
- [x] Verify every AC1-AC10 and FR1-FR6 against direct code, contract, fixture, command, or report evidence
- [x] Confirm the diff contains only issue #171 scope and preserves unrelated files, historical specs, released changelog entries, and runtime artifacts
- [x] Confirm `.codex-plugin/plugin.json`, `VERSION`, and the 2.0.8 `CHANGELOG.md` entry are synchronized
- [x] Generate a current issue-scoped verification report and post the matching GitHub verification comment

---

## Dependency Graph

```text
T001 → T002 → T003 → T004 → T005 → T006
```

**Critical path**: T001 → T002 → T003 → T004 → T005 → T006

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #171 | 2026-08-14 | Initial defect task plan |

---

## Validation Checklist

- [x] Tasks remain focused on the verification-to-delivery deadlock and its direct consumers
- [x] Shared contract and every skill-bundled edit route through `$skill-creator`
- [x] Deterministic regression coverage includes the original bug, generic blockers, ordinary Pass, and exact-SHA transitions
- [x] Every task has verifiable acceptance criteria and explicit file paths
- [x] Dependencies are linear and acyclic
- [x] No task changes repository protections, consumer product code, or non-GitHub providers
