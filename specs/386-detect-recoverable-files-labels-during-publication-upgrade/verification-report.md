# Verification Report: Detect recoverable Files labels during publication upgrade

**Issue**: #386
**Date**: 2026-09-13
**Status**: Passed
**Implementation Revision**: `19b1b8eb0eb7877142424ece25005dcdca46b892`
**Base Revision**: `e9f433749bce13f3c53d19b9ce2e814992863a3b`

## Scope

The singular Approved package is `specs/386-detect-recoverable-files-labels-during-publication-upgrade/`. The implementation changes only publication upgrade detection, focused regression coverage, and the issue-owned Unreleased changelog entry. `parseDeliveryTaskFileLines()` remains unchanged and is used as the fail-closed authority while constructing candidate rewrites.

## Acceptance Results

| Acceptance criterion | Result | Evidence |
|---|---|---|
| AC1 | Passed | Focused detection emitted actionable `publication-files:02a552a7bd22d4b5807995605294d32cc87111862865f5f3e986e8ba041c5948` for the exact supported `Files` near miss. |
| AC2 | Passed | The direct PathCast-shaped exercise planned rewrites at lines 5, 9, 13, and 17; apply changed those four label prefixes only; repeat detection returned zero publication actions. |
| AC3 | Passed | The focused unsafe-boundary regression emitted no rewrites for missing, duplicate, mixed canonical/near-miss, unsupported, malformed, ambiguous, fenced, or HTML-comment declarations. Visible unsafe file-like declarations remained findings. |
| AC4 | Passed | The unchanged delivery parser rejected the pre-state with `publication_scope_unproven` at T001 line 5 and accepted the post-state's complete 18-path set. |
| AC5 | Passed | Existing canonical prose and annotation recovery regressions remained green; `CHANGELOG.md` records #386 under Unreleased Fixed. |

## Changed-Path Mapping

| Path | Spec task | Behavior |
|---|---|---|
| `scripts/sdlc-upgrade.mjs` | T001 | Uses the fail-closed parser to validate each task-local candidate, canonicalizes only exact singular `Files`, and discards provisional rewrites when task authority remains unsafe. |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | T002 | Proves the PathCast-shaped pre/post contract, exact changed labels and paths, repeat-run cleanup, and unsafe declaration boundaries. |
| `CHANGELOG.md` | T003 | Records the pending issue-owned defect fix. |
| `specs/386-detect-recoverable-files-labels-during-publication-upgrade/requirements.md` | Spec | Approved requirements and scope for #386. |
| `specs/386-detect-recoverable-files-labels-during-publication-upgrade/design.md` | Spec | Root cause, parser reuse, safety invariants, and blast radius. |
| `specs/386-detect-recoverable-files-labels-during-publication-upgrade/tasks.md` | Spec | Exact source, test, and changelog ownership. |
| `specs/386-detect-recoverable-files-labels-during-publication-upgrade/feature.gherkin` | Spec | SCN001–SCN005 map the acceptance contract. |
| `specs/386-detect-recoverable-files-labels-during-publication-upgrade/verification-report.md` | Evidence | This managed command, outcome, path, and exercise record. |

## Command Evidence

- `cd scripts && npm test -- --runInBand __tests__/sdlc-upgrade.test.mjs` — passed: 1 suite, 41 tests, 0 failures.
- `cd scripts && npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs` — passed: 1 suite, 102 tests, 0 failures.
- `cd scripts && npm test -- --runInBand` — passed at implementation revision: 55 suites passed, 1 suite skipped; 1241 tests passed, 2 tests skipped; exit 0.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/skill-inventory-audit.mjs --check` — passed: clean, 43 items mapped.
- `node scripts/verify-current-specs.mjs` — passed: 77 genuine issue specs, 16 required archive entries, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub.
- `git diff --check origin/main...HEAD` — passed with no diagnostics at implementation revision.
- `node scripts/contribution-evidence.mjs --root . /tmp/nmg-sdlc-386-contribution.json` — passed with `{"ok":true,"errors":[]}` using the exact eight-path pre-review evidence set.

## Direct PathCast-Shaped Exercise

A disposable local root reproduced the four task declarations from PathCast issue #108 without touching PathCast or collecting the unrelated dependency graph.

### Pre-state

- `parseDeliveryTaskFileLines()` returned `publication_scope_unproven` for T001, line 5, with the exact `**Files**:` entry.
- Focused `detectUpgrade(root, { includeIssueDependencies: false })` emitted digest-bound action `publication-files:02a552a7bd22d4b5807995605294d32cc87111862865f5f3e986e8ba041c5948`.
- Package source digest: `51f0417db01543ba882c1cf6183faabc15cefe323e5c373dbf851ee991d0bba4`.
- Planned rewrite lines: 5, 9, 13, 17. Findings: none.

### Apply and post-state

- Applying only the detected action returned `status: applied` for `specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand/tasks.md` in the disposable root.
- A line-by-line comparison found exactly four changes. Every change was `**Files**:` to `**File(s)**:`; declaration values and every unrelated byte were unchanged.
- Repeat focused detection emitted zero publication actions.
- The unchanged delivery parser accepted the post-state and returned this complete unique path set:
  - `.github/workflows/miledar-ip-guardrails.yml`
  - `api/.artifacts/miledar-ip-guardrails/evidence.json`
  - `api/package.json`
  - `api/src/__tests__/features/miledar_ip_guardrails.feature`
  - `api/src/__tests__/steps/miledar_ip_guardrails.steps.ts`
  - `api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts`
  - `api/src/scripts/capture-miledar-ip-evidence.ts`
  - `api/src/scripts/reconcile-miledar-ip-guardrails.ts`
  - `api/src/services/ip-guardrails/semantic.ts`
  - `api/src/services/ip-guardrails/service.ts`
  - `api/src/services/ip-guardrails/types.ts`
  - `artifacts/issue-108/hosted-check.json`
  - `artifacts/issue-108/live-ruleset.json`
  - `artifacts/issue-108/local-results.json`
  - `artifacts/issue-108/merged-inputs.json`
  - `artifacts/issue-108/reconciliation.json`
  - `docs/release/miledar-ip-guardrails.json`
  - `docs/release/miledar-ip-product-safety.md`

The disposable root and exercise script were removed after output capture.

## Steering Alignment

- Product: preserves digest-bound, approval-gated upgrade and default-deny delivery authority.
- Technical: Node.js ESM, built-in modules only, path grammar remains centralized, no shell interpolation or network dependency added.
- Structure: changes stay in the runner, its focused Jest suite, the issue-owned spec, and the pending changelog.

## Boundaries and Known Gaps

- Dependency collection was intentionally disabled in the focused reproduction. The reported unrelated `dependency_unreadable` condition did not block the isolated publication detector or approved apply and was not expanded into this issue.
- No nmg-sdlc workflow, Herdr worker, mutable consumer smoke, plugin installation, PathCast mutation, pull request, merge, or issue closure was performed. Those actions are outside this manual pre-review checkpoint and cannot be inferred from this local evidence.
