# Verification Report: First-run delivery blocked by missing CHANGELOG.md and push-event checks

**Date**: 2026-10-25
**Issue**: #484
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec

**Verification head**: e7e3017e8afa70a5c844a1dc55926a6b57e9f0e4

---

## Executive Summary

All eight acceptance criteria are implemented and covered by regression tests. The registered gate is complete and passing at the exact head: `repository.tests` (full Jest suite) passed and `repository.nmg-sdlc-smoke` delivered a freshly provisioned smoke issue end to end. One low-severity follow-up outside this spec's task scope is recorded under Remaining Issues.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 2 (both Low, non-blocking)

---

## Issue Scope

- Active issue: #484
- Spec: `specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8]; FR [FR1, FR2, FR3, FR4, FR5]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":484,"specPath":"specs/484-fix-first-run-delivery-missing-changelog-md-and-push-event-checks-block-sdlc-execute","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 484 --spec specs/484-… --base main --controller-run-id 59a1b2a1-6bf3-4e97-b7b8-8451e4d3c1bf` exited 0, `ok: true`
- Artifact: `.nmg-sdlc/verification/484.json`; identity head `e7e3017e8afa70a5c844a1dc55926a6b57e9f0e4`, tree `clean`
- Ceiling: none
- Coverage: declared 2, recorded 2, complete `true`, no missing, duplicate, or unknown results

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Onboarding creates the changelog | Pass | `workflows/onboard-project/WORKFLOW.md` (init step), `references/greenfield.md`, `references/brownfield.md` create `CHANGELOG.md` with `# Changelog` and `## [Unreleased]` when absent and never modify an existing one; asserted by `scripts/__tests__/onboard-changelog-contract.test.mjs` |
| AC2 | Missing changelog fails with `version_artifact_missing` | Pass | `scripts/sdlc-deliver.mjs` `requireVersionArtifacts` runs first in `synchronizeVersion`, before any read or write; `runDeliverUnlocked` routes `version_artifact_missing` to `fail()`; `sdlc-deliver.test.mjs` asserts reason, summary, unchanged `VERSION` and HEAD |
| AC3 | Missing Unreleased heading fails with a specific reason | Pass | `requireVersionArtifacts` checks the `^## \[Unreleased\]` line (multiline); `updateChangelog` also throws the typed error; covered in `sdlc-deliver.test.mjs` |
| AC4 | Execute prints the failure summary | Pass | `scripts/sdlc-execute.mjs` `prepareVersion` throws `version_preparation_failed: <reason> — <summary>`; `sdlc-execute.test.mjs` asserts `version_preparation_failed: version_artifact_missing — CHANGELOG.md is missing` on stderr |
| AC5 | Upgrade proposes the missing changelog | Pass | `scripts/sdlc-upgrade.mjs` `detectChangelogCreate` / `applyChangelogCreate` (`wx` flag, live re-check, order 10.75); documented in `detection.md` (15), `v3-detectors.md` (17), `upgrade-procedures.md`; `sdlc-upgrade.test.mjs` covers detect, apply, preservation, and an empty re-run |
| AC6 | Existing version preparation preserved | Pass | Valid path unchanged after the precheck; `major_bump_required` routing retained; existing prepare-version tests pass, and this branch's own delivery commit `e7e3017` bumped 4.4.0 → 4.4.1 through it |
| AC7 | Push-event checks do not block delivery | Pass | `scripts/pr-delivery-state.mjs` `normalizeSnapshot` adds a gap only for a missing event; declared PR-only checks resolve only against `observedPrChecks` (`event === 'pull_request'`); `pr-delivery-state.test.mjs` covers the push+pull_request same-name `merge_ready` case and the push-only declared check not resolving |
| AC8 | Failing push-event checks still block delivery | Pass | `classifyPrDeliveryState` filters `FAILURE_CHECKS` across every event → `checks_failed`; covered by the failed-push-check test |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Onboarding creates a missing changelog | Complete | Three workflow files edited |
| T002 | prepare-version fails before mutating | Complete | `requireVersionArtifacts` also rejects symlinked or non-regular artifacts |
| T003 | Execute prints the handoff summary | Complete | Falls back to the reason alone when the summary is empty |
| T004 | Upgrade proposes and applies changelog-create | Complete | Script plus three references |
| T005 | Push-event checks are not snapshot gaps | Complete | Missing event still adds a gap |
| T006 | Document the changelog requirement | Complete | README versioning paragraph; CHANGELOG `### Fixed` entry (rolled to `[4.4.1]` by delivery) |
| T007 | Regression coverage | Complete | Five test files; full suite green |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Precheck isolated in `requireVersionArtifacts`; upgrade detect and apply are separate functions. `sdlc-upgrade.mjs` stays a large module (pre-existing) |
| Open/Closed | 4 | New upgrade kind is added through the existing priority map and dispatch chain |
| Liskov Substitution | 5 | N/A beyond consistent result shapes (`applied` / `already-current` / `skipped:*` / `failed:*`) |
| Interface Segregation | 5 | Typed `reasonCode` on the error matches the existing `major_bump_required` pattern |
| Dependency Inversion | 4 | Deliver precheck uses the injected `fs`; upgrade uses module `fs`, consistent with neighbours |

### Layer Separation

Workflow Markdown states the rules; scripts own deterministic behavior. No hooks-module changes.

### Dependency Flow

No new imports or dependencies.

---

## Security Assessment

- [x] Path validation: artifacts checked via `lstat`; symlinks and non-regular files are rejected (deliver) or skipped (upgrade)
- [x] No overwrite: `writeFileSync(..., { flag: 'wx' })` with an `EEXIST` → `already-current` fallback
- [x] No shell interpolation added
- [x] Fail-closed provenance: a check with no event still blocks; push checks never satisfy PR-only evidence

## Performance Assessment

- [x] One bounded `lstat`/read per artifact; no new scans or network calls

## Testability and Error Handling

- Stable reason codes (`version_artifact_missing`) with summaries naming the exact missing file or heading
- `prepareVersion` keeps the stderr fallback when the handoff is unreadable

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Contract test | Yes |
| AC2 | Yes (SCN002) | Jest | Yes |
| AC3 | Yes (SCN003) | Jest | Yes |
| AC4 | Yes (SCN004) | Jest | Yes |
| AC5 | Yes (SCN005) | Jest | Yes |
| AC6 | Yes (SCN006) | Jest (existing) | Yes |
| AC7 | Yes (SCN007) | Jest | Yes |
| AC8 | Yes (SCN008) | Jest | Yes |

### Coverage Summary

- Feature file: 8 scenarios, 8/8 ACs mapped
- Focused run (5 changed suites): 263/263 passed
- Full suite: `npm test -- --runInBand` (registered `repository.tests`) exited 0

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Reason** | No standalone `exercise-claude.mjs` run; the workflow changes are one-line instruction additions to onboard/upgrade references whose behavior the deterministic contract test (AC1) and upgrade helper tests (AC5) assert. The live end-to-end proof is the registered smoke gate below, which ran this checkout's execute controller through start → implement → verify → deliver |
| **Recommendation** | A live `/sdlc-onboard-project` run on a disposable greenfield project is an optional follow-up, not required for this gate |

---

## Real Smoke Lifecycle Evidence

`repository.nmg-sdlc-smoke` (provider `project.nmg-sdlc-smoke`) passed: "nmg-sdlc-smoke delivered #245".

- Provisioned smoke issue #245 ("Add greeting_crc32 library helper") with an Approved spec in a provider-owned pane
- Pre-run baseline: issue OPEN, no closing PRs
- `sdlc-execute run #245`: start, implement, verify, deliver passed; MERGED and CLOSED
- Proof: PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/247 MERGED at head `aeb58a895fd1a0638b08ad01c593ec35804a3200` (2026-10-25T07:16:45Z); issue #245 CLOSED. Independently re-checked with `gh`

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command, required) | Pass | `npm test -- --runInBand` in `scripts/` exited 0 at `e7e3017` |
| `repository.nmg-sdlc-smoke` (required) | Pass | Smoke #245 delivered via PR #247 at exact head |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 3/3 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

None. The verify publication scope permits only this report.

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-deliver.mjs` `evidenceForHead` (`resolveDeclaredCheck(item.name, observed.evidenceChecks)`) |
| **Issue** | The PR-evidence collection path resolves a declared check by name against checks from every event. A workflow emitting same-name push and pull_request checks makes the bare-name match ambiguous (`mismatch` → `verification_not_ready`) instead of resolving the pull_request check |
| **Impact** | Affects only reports carrying `PR Evidence Pending` obligations. Fails closed: the push check is never counted as evidence, which AC7 requires. Delivery classification (AC7 scope) is fixed |
| **Reason Not Fixed** | Outside T005's named scope and outside the verify publication scope; recommend a follow-up issue to filter `evidenceChecks` to `pull_request` before resolution |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Documentation |
| **Location** | `CHANGELOG.md` `[4.4.1]` |
| **Issue** | Delivery's version preparation added a generated `### Changed` line that repeats the hand-written `### Fixed` entry |
| **Impact** | Cosmetic duplication in release notes |
| **Reason Not Fixed** | Generated by the existing `updateChangelog` behavior (out of scope per the spec's "changelog entry format" exclusion) |

---

## Positive Observations

- The precheck runs before any read or write, which makes the "no file changed, no commit" guarantee structural rather than incidental
- Upgrade apply re-checks live state and uses an exclusive create, so it cannot overwrite an existing file
- The provenance change narrows the rule exactly: unknown events still fail closed

## Recommendations Summary

### Before PR (Must)
- None

### Short Term (Should)
- [ ] Filter PR-evidence check resolution to `pull_request` events (follow-up issue)

### Long Term (Could)
- [ ] Skip the generated `### Changed` line when the `[Unreleased]` section already has an entry for the issue

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-deliver.mjs` | 1 (Low, pre-existing path) | Precheck and fail routing |
| `scripts/sdlc-execute.mjs` | 0 | |
| `scripts/sdlc-upgrade.mjs` | 0 | |
| `scripts/pr-delivery-state.mjs` | 0 | |
| `workflows/onboard-project/**`, `workflows/upgrade-project/references/**` | 0 | |
| `README.md`, `CHANGELOG.md` | 1 (Low, generated) | |
| `scripts/__tests__/*` (5 files) | 0 | |

---

## Recommendation

**Ready for PR**

Every acceptance criterion passes with direct code and test evidence. The registered gate is complete and green at `e7e3017e8afa70a5c844a1dc55926a6b57e9f0e4`, including a real smoke delivery. The two low-severity notes are non-blocking follow-ups.
