# Verification Report: Hard-remove commit-push from released and upgraded plugin installations

**Date**: 2026-08-13
**Issue**: #148
**Reviewer**: Codex
**Scope**: Implementation verification against `specs/feature-open-pr-skill/`

### Implementation Status: Incomplete

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

**Status**: Incomplete
**Acceptance criteria**: 19/21 passing; 2 partial external-release criteria
**Total unresolved issues**: 2 (1 external verification gate, 1 pre-existing status-parser contract gap)

The repository, staged-release fixture, validator negative cases, open-pr regression contracts, inventory, compatibility, and full script suite pass. Verification fixed one discovery-metadata gap by rejecting `commit-push` anywhere in skill frontmatter, including descriptions. The remaining gap is post-release proof: the active Codex installation is still nmg-sdlc 1.71.0 at SHA `fd15cd75d082f73dd89b45efdd223c80da958258`, not the issue #148 implementation, and Codex CLI 0.147.0 exposes no disposable `--profile` boundary for plugin commands.

## Spec Context

```text
Spec Context:
- activeSpec: specs/feature-open-pr-skill/
- relatedSpecs:
  - specs/feature-plugin-scaffold-and-marketplace-infrastructure/ (score: 4; reasons: matched plugin manifest component, matched marketplace distribution component)
- metadataOnlyCount: 84
- scannedSpecCount: 86
- loadedSpecCount: 2
- gaps: none
```

The active spec remains authoritative. The older marketplace scaffold spec contributes the manifest/distribution boundary but does not replace current paths or installation contracts.

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | PR links to originating issue | Pass | Existing open-pr contract and full suite pass. |
| AC2 | PR references spec files | Pass | Existing open-pr contract and full suite pass. |
| AC3 | PR summary reflects implementation | Pass | Existing open-pr contract and full suite pass. |
| AC4 | Unattended mode outputs completion signal | Pass | Existing open-pr and runner contracts pass. |
| AC5 | Interactive CI monitor opt-in happy path | Pass | Existing open-pr exercise and runner contracts pass. |
| AC6 | Interactive CI monitor opt-out | Pass | Existing open-pr exercise and runner contracts pass. |
| AC7 | CI failure reports and stops | Pass | Existing open-pr exercise and runner contracts pass. |
| AC8 | Unattended-mode parity without prompt | Pass | Existing open-pr exercise and runner contracts pass. |
| AC9 | Unattended mode actively suppresses monitor actions | Pass | Existing open-pr exercise and runner contracts pass. |
| AC10 | Open-pr commits pending work before PR creation | Pass | `scripts/__tests__/open-pr-delivery-contract.test.mjs` preserves the dirty-work delivery contract. |
| AC11 | Open-pr preserves safe rebase and push behavior | Pass | Contract tests retain `--force-with-lease=HEAD:{EXPECTED_SHA}` and push verification. |
| AC12 | Commit-push removed from public workflow | Pass | Complete active skill-tree scan passes and `skills/commit-push/` is absent. |
| AC13 | Runner uses open-pr as delivery handoff | Pass | Runner/config scans contain no `commitPush` step or bounce-back path. |
| AC14 | Clean branch creates no redundant commit | Pass | Existing open-pr contract retains `No additional commit needed`. |
| AC15 | Docs and tests cover simplified workflow | Pass | Open-pr contract and full suite pass; README remains correctly open-pr-only. |
| AC16 | Released plugin contains no commit-push skill | Pass | Repository and staged-release surfaces pass `scripts/verify-plugin-surface.mjs`; manifest still discovers `./skills/`. |
| AC17 | Fresh installations expose only open-pr | Partial | Clean fresh-install fixture passes, but the issue #148 release is not yet selected in a disposable fresh Codex session. |
| AC18 | Upgrades replace the active commit-push surface | Partial | Upgraded-root and inactive-cache fixtures pass, but no published issue #148 release is available for a disposable live upgrade/session exercise. |
| AC19 | Validation detects stale upgrade state | Pass | Stale directory, frontmatter, alias, deprecation, loader-token, and inventory fixtures fail with exit 1 and path-specific diagnostics. |
| AC20 | Open-pr delivery does not regress | Pass | Focused contracts pass 23/23; the full script suite passes 483 tests. |
| AC21 | Active contracts and release notes require hard removal | Pass | Active spec, full skill-tree regression scan, workflow release gate, and `[Unreleased]` changelog entry all require hard removal. |

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001-T016 | Existing open-pr delivery feature and prior enhancements | Complete | Full regression suite remains green. |
| T017 | Create plugin-surface validator | Complete | Zero-dependency CLI, explicit root/label, fail-closed path validation, and exit-code contract verified. |
| T018 | Add fixture and diagnostic coverage | Complete | Clean, stale, invalid, inactive-cache, and frontmatter-description cases pass. |
| T019 | Delete compatibility bundle and tighten scans | Complete | `skills/commit-push/` is absent; manifest remains directory-discovered; full active skill-tree scan passes. |
| T020 | Gate marketplace dispatch and update changelog | Complete | Release validation precedes metadata read and dispatch; `[Unreleased]` records removal. |
| T021 | Verify repository and release contracts | Complete | Repository validator, 23 focused tests, 483 full tests, 569-item inventory, fresh-baseline comparison, and compatibility check pass. |
| T022 | Exercise fresh install and upgrade in disposable profiles | Partial | Fixture proof passes; published-release version/SHA and fresh-session discovery proof remain external. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The validator has one responsibility: validate one explicitly selected plugin surface. |
| Open/Closed | 5 | Violation collection and fixture tables allow new stale metadata shapes without changing CLI flow. |
| Liskov Substitution | 5 | Not inheritance-oriented; filesystem surfaces are consistently handled through one validation contract. |
| Interface Segregation | 5 | CLI accepts only the root and label it needs; internal helpers remain focused. |
| Dependency Inversion | 5 | The workflow supplies explicit roots; the validator does not discover or mutate host caches. |

### Layer Separation and Dependency Flow

The manifest selects the skill root, the validator performs read-only surface inspection, the workflow invokes it before marketplace dispatch, and Jest fixtures isolate filesystem states. No release or cache mutation is embedded in validation. The deletion preserves `open-pr` as the single delivery workflow and keeps historical specs/changelog entries outside the active-surface scan.

## Security Assessment

- [x] Root and label are distinct process arguments; repository values are not interpolated into shell source.
- [x] Absolute, traversal, outside-root realpaths, and symlinked skill entries fail closed.
- [x] Only Node built-ins are used; no dependency or supply-chain expansion.
- [x] The validator is read-only and never deletes cache content.
- [x] No secrets or credentials were added.

## Performance Assessment

- [x] The validator performs one deterministic walk of the selected skill tree and one optional inventory read.
- [x] Directory entries and violations are sorted for deterministic output.
- [x] Synchronous I/O is appropriate for a short-lived release-gate CLI and avoids concurrency complexity.
- [x] No network calls, polling, or unbounded retries are introduced.

The score is 4 rather than 5 because the validator intentionally reads complete text files and has no file-size guard; this is acceptable for the bounded plugin surface but is not a general large-tree scanner.

## Test Coverage

### BDD Scenarios

| Coverage | Result |
|----------|--------|
| Acceptance criteria represented | 21/21 |
| Gherkin scenarios | 24 total; 6 added for issue #148 |
| Executable step definitions | N/A — Gherkin is the prompt-plugin behavioral contract |
| Issue #148 locally executable criteria | 4/6 complete; 2/6 partial pending post-release exercise |

### Automated Verification

| Command | Result |
|---------|--------|
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Pass |
| Focused validator and open-pr contracts | Pass — 23/23 tests |
| `cd scripts && npm test` | Pass — 483 passed, 17 intentionally skipped |
| `node scripts/skill-inventory-audit.mjs --check` | Pass — 569 items mapped |
| Fresh inventory baseline comparison | Pass — 569 items, zero commit-push entries, no deterministic drift |
| `node scripts/codex-compatibility-check.mjs` | Pass |
| `node --check scripts/verify-plugin-surface.mjs` | Pass |
| `git diff --check` | Pass |

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Changed Skill** | `commit-push` (deleted) |
| **Exercise Method** | Repository/staged-release/fresh-install/upgraded-root/stale-root fixtures plus read-only `codex plugin list --json` |
| **Temporary State** | Jest-managed disposable directories; primary installation not modified |
| **Direct `codex exec` Exercise** | Skipped for the target release |
| **Reason** | The deleted skill has no exercise-runner fixture, the issue #148 release is not published/selected, and the active installation is still 1.71.0 at the pre-change SHA. |
| **Recommendation** | After publication, use an externally isolated Codex profile/home to verify version/SHA selection, direct invocation failure, and natural-language routing to `open-pr`. |

### Issue #148 Exercise Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC16 | Pass | Repository and staged-release fixture validation pass. |
| AC17 | Partial | Fresh-install surface fixture passes; live fresh-session discovery is pending. |
| AC18 | Partial | Upgraded-root/inactive-cache fixtures pass; live old-to-new upgrade is pending. |
| AC19 | Pass | Stale selected-root fixtures fail with exact root/path/kind and no mutation. |
| AC20 | Pass | Focused and full open-pr/runner regressions pass. |
| AC21 | Pass | Active contracts, release gate, and changelog are aligned. |

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `cd scripts && npm test`: 483 passed, 17 intentionally skipped. |
| Skill exercise test | Incomplete | Deleted `commit-push` has no exercise-runner fixture; target release is not active in an isolated Codex session. |
| Skill inventory audit | Pass | 569 items mapped; regenerated baseline matches and contains no commit-push entry. |
| Prompt quality review | Pass | No replacement stub or modified prompt was added; complete active skill-tree scan is clean and `open-pr` retains its downstream contract. |
| Behavioral contract review | Pass | Preconditions, postconditions, invariants, exit codes, path boundaries, and no-mutation behavior are covered by fixtures and review. |

**Gate Summary**: 4/5 passed, 0 failed, 1 incomplete

The incomplete exercise gate caps the overall status at **Incomplete** under `steering/tech.md` and the verify-code gate aggregation contract.

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| Medium | Testing / discovery metadata | `scripts/verify-plugin-surface.mjs` and `scripts/__tests__/plugin-surface-verification.test.mjs` | A renamed skill could retain `commit-push` in its always-loaded frontmatter description without failing validation. | Added frontmatter-wide token detection and a regression fixture; focused and full suites pass. | direct |
| Low | Verification evidence | `specs/feature-open-pr-skill/tasks.md` | Recorded test totals predated the new regression fixture. | Updated focused/full totals to 23 and 483. | direct |

The bundled `$nmg-sdlc:simplify` pass found no further worthwhile behavior-preserving cleanup in the fixed files.

## Remaining Issues

| Severity | Category | Location | Issue | Impact | Reason Not Fixed |
|----------|----------|----------|-------|--------|------------------|
| Medium | Testing / release verification | `specs/feature-open-pr-skill/tasks.md` T022 | Published fresh-install, old-to-new upgrade, version/SHA selection, direct invocation failure, and natural-language routing are not yet exercised in fresh sessions. | AC17 and AC18 remain partial; the formal skill-exercise gate is incomplete. | Requires the issue #148 release and an isolated Codex installation boundary; mutating the developer's primary 1.71.0 installation is explicitly out of scope. |
| Low | Integration / verification evidence | `scripts/sdlc-status.mjs` | The status parser accepts only `Pass`, `Partial`, or `Fail`, while verify-code gate aggregation can emit `Incomplete`. | `sdlc-status --json` reports this valid verification report as `unknown`. | Pre-existing status-feature contract outside issue #148; changing it requires its own scoped spec and regression coverage. |

## Positive Observations

- Validation is explicit-root and read-only, so inactive historical caches do not create false failures and are never deleted.
- The marketplace workflow fails before metadata read or dispatch when the release source is stale.
- Fixture coverage is broad and diagnostic assertions include root, relative path, and metadata kind.
- The full open-pr delivery contract remains intact after hard deletion.

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/verify-plugin-surface.mjs` | 1 fixed | Validator implementation and CLI contract. |
| `scripts/__tests__/plugin-surface-verification.test.mjs` | 0 | Clean/stale/invalid/install/upgrade fixture coverage. |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | 0 | Hard-removal and delivery-regression contract. |
| `.github/workflows/sync-marketplace-pointer.yml` | 0 | Release gate ordering verified. |
| `CHANGELOG.md` | 0 | Unreleased removal entry verified. |
| `skills/commit-push/SKILL.md` | 0 | Deletion verified; no replacement surface. |
| `specs/feature-open-pr-skill/` | 0 | Requirements, design, tasks, and 24 Gherkin scenarios reviewed. |
| `steering/product.md`, `steering/tech.md`, `steering/structure.md` | 0 | Product intent, gates, and architecture invariants applied. |

## Recommendation

**Ready for PR with a mandatory post-release verification follow-up.**

All locally controllable implementation and regression evidence is green. Before calling the release complete, publish/select the issue #148 release in an externally isolated Codex environment and close T022 with fresh-install, upgrade, version/SHA, and fresh-session routing evidence. Track the pre-existing `Incomplete` status-parser mismatch separately rather than expanding this feature branch.
