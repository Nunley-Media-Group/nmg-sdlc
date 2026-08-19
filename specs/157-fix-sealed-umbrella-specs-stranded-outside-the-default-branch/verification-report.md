# Verification Report: Fix Sealed Umbrella Specs Stranded Outside the Default Branch

**Date**: 2026-08-13
**Issue**: #157
**Reviewer**: Codex
**Scope**: Defect-fix verification against the active spec and bounded related contracts

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.8** |

**Implementation Status**: **Pass — defect fix**
**Acceptance Criteria**: **7/7 passing**
**Tasks**: **6/6 complete**
**Total Remaining Issues**: **0**

The original stranded-spec failure is corrected. Sealing now owns exact spec-only publication, child entry points require refreshed default-branch canonical proof, squash-shaped history is recognized by full tree identity, and upgrade can preview and explicitly prepare only an unambiguous recovery. Three correctness findings discovered during verification were fixed and reverified; no known issue remains.

### Spec Context

- **activeSpec**: `specs/bug-fix-sealed-umbrella-specs-stranded-outside-the-default-branch/`
- **relatedSpecs**:
  - `specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/` — explicit `Related Spec` and the original multi-PR umbrella contract
  - `specs/bug-fix-epic-membership-deadlocking-issue-selection/` — shared epic-relationship classification and child readiness boundary
  - `specs/feature-remove-the-automated-sdlc-loop-and-unattended-mode/` — shared manual-gate and skill-surface invariants
- **scannedSpecCount**: 89
- **loadedSpecCount**: 4
- **metadataOnlyCount**: 85
- **gaps**: none

The active defect spec supersedes history-only sealing and feature-branch-only availability while preserving the related contracts' valid epic identity, explicit human gates, and manual delivery boundaries.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Publish the exact sealed spec canonically before child work | Pass | `skills/write-spec/SKILL.md:207-252`; `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs:38-58` |
| AC2 | Fail closed when a child's parent spec is not canonical | Pass | `skills/start-issue/SKILL.md:159-170`; `skills/write-spec/SKILL.md:51-65`; `skills/write-code/SKILL.md:61-66`; `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs:60-85` |
| AC3 | Preserve seal identity across squash/rebase history shaping | Pass | `scripts/umbrella-spec-status.mjs:303-314`; `scripts/__tests__/exercise-write-spec-epic.test.mjs:99-130` |
| AC4 | Audit initialized projects across all required seal states | Pass | `scripts/umbrella-spec-status.mjs:420-489`; `skills/upgrade-project/SKILL.md:90-100`; classifier matrix tests pass |
| AC5 | Recover one unambiguous stranded spec with exact approval | Pass | `skills/upgrade-project/references/sealed-spec-recovery.md:28-58`; `scripts/__tests__/exercise-upgrade-sealed-spec.test.mjs:102-126` |
| AC6 | Preserve default-branch content on divergence and retain refs | Pass | `skills/upgrade-project/references/sealed-spec-recovery.md:39-54`; `scripts/__tests__/exercise-upgrade-sealed-spec.test.mjs:128-175` |
| AC7 | Make publication/recovery idempotent and preserve prior flows | Pass | `scripts/__tests__/exercise-write-spec-epic.test.mjs:99-140`; `scripts/__tests__/exercise-upgrade-sealed-spec.test.mjs:102-190`; full regression suite passes |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Establish canonical umbrella-spec status evidence | Complete | Read-only helper, shared contract, stable statuses, bounds, and exact four-file validation verified |
| T002 | Publish sealed specs through a spec-only pull request | Complete | Exact staging, no-version delivery, stable marker, PR reuse, and canonical recheck are specified and contract-tested |
| T003 | Enforce canonical readiness at child entry points | Complete | `start-issue`, `write-spec`, and `write-code` gate before their first mutation; feature children cannot reseal the umbrella |
| T004 | Audit and recover affected initialized projects | Complete | Exact approval, revalidation, worktree-only restore, default-wins, and idempotence are exercised |
| T005 | Add forward and recovery regression coverage | Complete | Seven one-to-one Gherkin scenarios, classifier tests, cross-skill contracts, and disposable Git exercises pass |
| T006 | Document and verify the correction | Complete | README, CHANGELOG, inventory, official Codex skill conventions, full suite, and all steering gates verified |

---

## Architecture Assessment

### Blast Radius

- **Shared contract**: `references/canonical-umbrella-spec.md` centralizes the state model consumed by publication, child gates, and upgrade recovery.
- **Mutation boundary**: `scripts/umbrella-spec-status.mjs` is read-only. It fetches an exact remote object without updating `FETCH_HEAD` or a tracking ref and reads Git objects directly.
- **Workflow boundary**: `write-spec` owns no-version umbrella publication; `open-pr` retains versioned implementation delivery; `upgrade-project` prepares recovery content but does not stage, commit, push, open, approve, or merge.
- **Downstream behavior**: child gates add preconditions without altering genuine execution-dependency blocking, relationship metadata, single-PR specs, managed upgrades, or legacy-layout migration.

### Checklist Scores

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 4 | State interpretation is centralized and command/filesystem adapters are injectable; the 561-line classifier remains cohesive but is substantial for one module |
| Security | 5 | Positive issue and normalized path validation, real-path containment, array-based Git arguments, symlink rejection, output/time/ref/spec bounds, and no secret output all pass |
| Performance | 5 | Ref/spec scans are bounded, commits and tree identities are deduplicated, output is capped, and no worktree-wide content scan or persistent cache was added |
| Testability | 5 | Disposable bare-origin repositories, injectable adapters, stable JSON, static boundary tests, and forward/recovery exercises cover success and degradation paths |
| Error Handling | 5 | Discovery/read/metadata failures return named fail-closed states; malformed candidate packages can no longer be skipped; stale approval, divergence, and ambiguity stop safely |

**Architecture score**: **4.8/5**

### Minimal-Change and Simplification Review

Every changed implementation path maps to T001-T006. The required `$nmg-sdlc:simplify` pass hoisted an invariant spec-path prefix out of a tree-entry loop; no further behavior-preserving cleanup was worthwhile. No version bump, marketplace mutation, runner reintroduction, automatic merge, or branch deletion was added.

---

## Security Assessment

- **Authentication/authorization**: unchanged; publication and recovery preserve existing user approval and GitHub authority boundaries.
- **Input validation**: positive issue numbers, exact normalized `specs/<slug>` paths, full object IDs, real project roots, regular four-file trees, and bounded refs are required.
- **Injection prevention**: Git is invoked with argument arrays; no user-derived shell command is constructed by the classifier.
- **Data protection**: diagnostics are bounded and contain evidence identifiers, not environment/config contents.
- **Filesystem safety**: symlinked spec entries and destination collisions fail closed; recovery uses an exact worktree-only restore and preserves index, refs, and unrelated dirt.

## Performance Assessment

- The classifier caps inspected refs at 200, feature spec paths per ref at 200, Git output at 8 MiB, and subprocess duration.
- Candidate commits and identical path/tree identities are deduplicated before classification.
- Default-branch proof fetches one exact object without pulling or checking out.
- Synchronous Git calls are appropriate for the bounded one-shot CLI and keep sequencing deterministic.

---

## Test Coverage

### BDD and Regression Mapping

| Acceptance Criterion | Has Scenario | Executable Mapping | Passes |
|---------------------|-------------|--------------------|--------|
| AC1 | Yes | Seal/publication contract and forward-publication exercise | Yes |
| AC2 | Yes | Cross-skill mutation-boundary contract and stranded child exercise | Yes |
| AC3 | Yes | Marker-retained/lost classifier and squash-shaped publication exercise | Yes |
| AC4 | Yes | Canonical, marker-lost, recoverable, divergent, ambiguous, and unverifiable classifier matrix | Yes |
| AC5 | Yes | Exact restore/index/ref/dirty preservation recovery exercise | Yes |
| AC6 | Yes | Divergent/default-wins, ambiguity, and stale-approval exercises | Yes |
| AC7 | Yes | Repeated classifier/recovery runs and full legacy regression suite | Yes |

- **Feature file**: 7 `@regression` scenarios for 7 ACs
- **Step definitions**: N/A for Markdown plugin contracts; Jest assertions and disposable Git exercises provide executable mappings
- **Focused post-fix tests**: 24 passed across classifier, canonical-contract, and forward-publication suites
- **Full suite**: 26 suites passed; 218 tests passed; 12 opt-in live tests skipped by design across the pre-existing `draft-issue`, `start-issue`, and `open-pr` live exercise suites
- **Unexpected skips/orphaned imports**: none

## Exercise Test Results

### Deterministic Plugin Exercises

| Field | Value |
|-------|-------|
| **Skills Exercised** | `write-spec`, `upgrade-project`; cross-skill boundaries for `start-issue`, `write-code`, and `open-pr` |
| **Test Projects** | Disposable repositories with bare `origin`, independent default/sealing/child histories, and temporary recovery worktrees |
| **Exercise Method** | Jest exercises invoking the real classifier and Git |
| **Gate Handling** | Static contract assertions verify exact approval and mutation ordering; no approval is inferred |
| **Result** | Pass |

Captured behavior included stranded independent children, squash-shaped canonical publication, exact tree equality, default-wins divergence, ambiguous evidence, stale approval reclassification, symlink preservation, unrelated dirty-file preservation, unchanged index/refs, and repeat-run idempotence.

### Live Codex Dry Run

| Field | Value |
|-------|-------|
| **Skill Exercised** | `start-issue` |
| **Test Project** | Disposable Git repository; removed after the run |
| **Exercise Method** | `codex exec` with explicit dry-run/no-mutation instructions |
| **`request_user_input` Handling** | Unsupported in exec mode; treated as no approval and stopped |
| **GitHub/Branch Mutation** | None |

The run resolved live issue #157, passed legacy-layout discovery, reached the mandatory “Ready to start?” gate, and stopped without executing the displayed `gh issue develop` command. This confirms that unavailable or empty gate input is not treated as consent. The acceptance behavior introduced by #157 is covered by the deterministic Git exercises above.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test -- --runInBand`: 26 suites and 218 tests passed; 12 intentional opt-in skips |
| Skill inventory | Pass | `Skill inventory audit: clean (428 items mapped)` |
| Codex compatibility | Pass | `Codex compatibility check passed` |
| Active plugin surface | Pass | `Plugin surface validation passed: repository` |
| Skill creator validation | Pass | `start-issue`, `write-spec`, `write-code`, `upgrade-project`, and `open-pr`: `Skill is valid!` |
| Skill exercise | Pass | Deterministic forward/recovery exercises pass; live Codex dry run stops safely at the user gate |
| Prompt quality | Pass | Changed instructions are unambiguous, ordered before mutation, Codex-native, reference-valid, explicit about authority, and define fail-closed fallbacks |
| Git hygiene | Pass | `git diff --check` exits 0 |

**Gate Summary**: **8/8 passed, 0 failed, 0 incomplete**

Official documentation verification confirmed the current Codex skill layout, `SKILL.md` metadata, repository skill discovery, explicit invocation, references, and plugin-distribution conventions used by this change.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Workflow correctness | `skills/write-spec/SKILL.md:207-209` | A feature child inheriting a canonical umbrella's multi-PR design could enter Seal-Spec Flow and create a child-numbered seal/publication PR | Restricted Seal-Spec Flow to invocations with no coordination parent and added cross-skill regression assertions | `skill-creator` |
| High | Validation/security | `scripts/umbrella-spec-status.mjs:21-26`, `scripts/umbrella-spec-status.mjs:128-149` | Tree validation rejected symlinks but accepted missing or extra artifacts despite the exact four-file archive contract | Required exactly `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`; added missing/extra package tests | `direct` |
| High | Error handling | `scripts/umbrella-spec-status.mjs:259-267` | Audit mode silently skipped malformed multi-PR candidates, potentially misreporting them as absent | Return fail-closed `candidate_scan_failed` evidence and added audit regression coverage | `direct` |
| Low | Performance | `scripts/umbrella-spec-status.mjs:131-139` | The invariant spec-path prefix was recomputed for every tree entry | Hoisted it once before the loop during the required simplify pass | `direct` |

All fixes were followed by focused tests, the full suite, and all applicable steering gates.

## Remaining Issues

None.

## Positive Observations

- Full Git tree identity provides squash/rebase-stable canonical proof without inventing another persistence layer.
- The helper refreshes remote evidence without mutating local branches, remote-tracking refs, the index, or the worktree.
- The publication marker and state vocabulary are shared across all consumers.
- Exact approval, apply-time revalidation, and default-wins handling make recovery conservative and reversible through normal Git review.
- Existing manual user gates remain authoritative; unavailable input is not approval.

## Files Reviewed

| File Group | Issues Found | Notes |
|------------|--------------|-------|
| Active four-file spec and Gherkin | 0 | 7 ACs, 6 tasks, and 7 regression scenarios are consistent |
| Shared canonical/epic references | 0 | State, provenance, and relationship contracts align |
| `scripts/umbrella-spec-status.mjs` | 2 | Both classifier findings fixed and reverified |
| Classifier, contract, forward, and recovery tests | 0 | Added verification regressions; all pass |
| `start-issue`, `write-spec`, `write-code`, `upgrade-project`, `open-pr` | 1 | Child reseal boundary fixed through `skill-creator` |
| README, CHANGELOG, inventory | 0 | Public workflow and mapped surface are current |

## Recommendation

**Ready for PR.** All seven acceptance criteria and all six tasks pass, all eight steering gates are green, every verification finding was fixed and reverified, and no remaining issue is known. This report does not commit, push, open a PR, or publish a release.
