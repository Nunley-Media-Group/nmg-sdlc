# Verification Report: Support package-scoped publication-only upgrades

**Date**: 2026-09-13
**Issue**: #388
**Reviewer**: Manual first-half implementation verification
**Scope**: Approved specification, implementation, focused tests, and disposable installed-source exercise; no independent review or delivery

## Implementation Status: Pass for first-half delivery

The dedicated selected-package contract passed its focused Jest block and the complete `sdlc-upgrade` suite. A disposable PathCast-shaped fixture used the clean issue worktree's actual CLI source, selected only #108, converted exactly four selected labels, left unrelated #110 rewrite bytes and #4 finding bytes unchanged, invoked no fake `gh`, emitted no label-backfill result, and converged to zero writes.

## Issue Scope

- Active issue: #388
- Spec: `specs/388-support-package-scoped-publication-only-upgrades`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: existing unbounded `detectUpgrade()` / `applyUpgrade()` behavior and the prior publication detector suite

<!-- nmg-sdlc-issue-scope: {"issueNumber":388,"specPath":"specs/388-support-package-scoped-publication-only-upgrades","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | `detectPublicationUpgrade(root, { specDirs })` validates a non-empty explicit set and calls `publicationFilesUpgrade` only with validated selected packages. The fixture had three dirty packages; selected report contained only #108. |
| AC2 | Pass | Approval hashing includes schema/mode, canonical real root, sorted selection, recursively inventoried regular-file SHA-256 digests, and exact package rewrites/findings. Reordered equivalent selections produced one id; different root/report/selection and added content were rejected. |
| AC3 | Pass | `applyPublicationUpgrade` is a sibling to `applyUpgrade`, has no command runner, calls only selected detection and `applyPublicationFiles`, and returned only the publication id. Fake `gh` marker remained absent and no `spec-created-backfill` result appeared. |
| AC4 | Pass | Focused cases rejected empty, duplicate, absolute/traversal/outside, missing, symlinked, incomplete, non-Approved, and issue-mismatched selections. Stale source, added inventory, foreign root, foreign selection, and foreign report failed before tasks mutation. Process-level CLI regressions proved separate duplicate approvals, comma-separated multiple approvals, empty-plus-valid approval flags, and empty-plus-valid spec flags fail before writes. |
| AC5 | Pass | Mixed-EOL regression changed only `**Files**:` to `**File(s)**:` while binary selected extras and unrelated bytes remained equal. Repeat selected detection returned `writeCount: 0` and `actionable: false`. |
| AC6 | Pass | Unit assertions name all four expected canonical T001-T004 **File(s)** lines and reject every old `**Files**` label. The CLI fixture recorded four canonical labels, two unselected rewrites plus one unselected finding, identical unselected SHA-256 hashes before/after, and no GitHub marker. |
| AC7 | Pass | Exported APIs and `detect-publication` / `apply-publication` CLI are documented with the portable `<plugin-root>` token in README and the upgrade workflow/reference. Existing 45 upgrade tests plus 9 selected-contract tests passed. Approval-option counts and malformed values are enforced only by `apply-publication`; legacy `apply` retains its prior last-option parsing behavior. |

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T001 | Complete | Dedicated selection validation, report digest, selected detect/apply, byte inventory, and stale checks implemented in `scripts/sdlc-upgrade.mjs`. |
| T002 | Complete | Repeatable `--spec` CLI commands and package-bounded `/sdlc-upgrade-project` workflow contract documented. |
| T003 | Complete | Nine focused Jest cases plus the disposable actual-source CLI fixture cover selection, side effects, staleness, invalid inputs, bytes/EOL, exact four-token repair, convergence, repeated/comma-separated/empty approvals, and empty spec options. |
| T004 | Complete | README and Unreleased changelog updated; plugin/current-spec/inventory/version/contribution surfaces verified below. |

## Exact Commands and Results

| Command | Result |
|---|---|
| `node --check scripts/__tests__/sdlc-upgrade.test.mjs` | Passed; malformed #388 block repaired and parsed cleanly before focused execution. |
| `node --check scripts/sdlc-upgrade.mjs` | Passed. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "package-scoped publication-only upgrade"` | Passed after final compatibility remediation: 1 suite, 9 tests; 45 unrelated tests skipped by the focus filter. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand` | Passed after final compatibility remediation: 1 suite, 54 tests, 0 failures/skips. |
| `cd scripts && npm test -- --runInBand` | Required `repository.tests` command passed: 55 suites passed, 1 skipped; 1,254 tests passed, 2 skipped; 56 suites and 1,256 tests total. |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Passed: repository plugin surface valid. |
| `node scripts/verify-current-specs.mjs` | Passed: 78 genuine issue specs, 16 required archive, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub. |
| `node scripts/skill-inventory-audit.mjs --check` | Passed: 43 items mapped. |
| `node -e "const fs=require('node:fs'); const version=fs.readFileSync('VERSION','utf8').trim(); const packageVersion=require('./package.json').version; if(version!==packageVersion) process.exit(1); console.log('VERSION='+version+' package='+packageVersion)"` | Passed with enforced equality: `VERSION=3.21.3 package=3.21.3`; no implementation-time version bump. |
| `node scripts/contribution-evidence.mjs --root . /tmp/nmg-sdlc-388-contribution-evidence.json` | Passed: `{"ok":true,"errors":[]}` for issue #388, the exact changed-path set, generated delivery body, and this report. |
| `git diff --check` | Passed with no whitespace errors before the verification commit. |
| `shasum -a 256 specs/372-restore-bounded-operator-authorized-recovery-of-stopped-delivery/verification-report.md` in the ambient `/Volumes/Fast Brick/source/repos/nmg-sdlc` checkout | Passed before and after work: `4f2fa5e99cab141cb5bc7d8817adcec329bc5afd9d0fc57121e420f66182cea6`; the pre-existing modified file remained byte-identical. |

## Disposable Installed-Source CLI Exercise

- Fixture: `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-388-pathcast-4Jzo7e`
- Source entry point: `/Volumes/Fast Brick/source/repos/nmg-sdlc-388/scripts/sdlc-upgrade.mjs`
- Selected package: `specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand`
- Unselected dirty packages: `specs/110-unrelated-rewrite` with two writes; `specs/4-unrelated-finding` with one finding
- Detect command: `node /Volumes/Fast Brick/source/repos/nmg-sdlc-388/scripts/sdlc-upgrade.mjs detect-publication --root /var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-388-pathcast-4Jzo7e --spec specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand`
- Apply command: `node /Volumes/Fast Brick/source/repos/nmg-sdlc-388/scripts/sdlc-upgrade.mjs apply-publication --root /var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-388-pathcast-4Jzo7e --spec specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand --approve publication-files:105aa1045a2a2ed94884d7e1e2fb0cb7806a1bca8669fdfc94c01460a268cb4c`
- Repeat detect: same detect command
- Result: selected writes `4 -> 0`; selected canonical labels `4`; repeated actionable `false`; unselected hashes unchanged; result ids contained only the approved publication id; `spec-created-backfill` absent; fake `gh` marker absent.
- Unselected #110 SHA-256 before/after: `4db2930271d5a13014e03e74f70aa2665df5f163fe352b21bf57d7fb6fea3777`
- Unselected #4 SHA-256 before/after: `0748350c3aae0a359b6cfcde3585ca68800553f60c4935489bd3b00d81ad6484`

## Steering and Contribution Alignment

- Product: explicit package authority and byte preservation satisfy safe project adoption and managed-asset preservation.
- Technical: zero-dependency Node ESM, `node:path`, native argument arrays, stable reason codes, symlink rejection, and focused contract/fixture verification.
- Structure: runtime behavior stays in `scripts/`; workflow-only detail stays in `workflows/upgrade-project/references/`; public discoverability stays in README; no second convention or PathCast-specific production branch was added.
- Contribution: issue #388, singular Approved spec package, exact changed paths, behavior evidence, commands, and outcomes are connected in this report.

## Changed Paths

- `CHANGELOG.md`
- `README.md`
- `scripts/sdlc-upgrade.mjs`
- `scripts/__tests__/sdlc-upgrade.test.mjs`
- `workflows/upgrade-project/WORKFLOW.md`
- `workflows/upgrade-project/references/v3-detectors.md`
- `specs/388-support-package-scoped-publication-only-upgrades/requirements.md`
- `specs/388-support-package-scoped-publication-only-upgrades/design.md`
- `specs/388-support-package-scoped-publication-only-upgrades/tasks.md`
- `specs/388-support-package-scoped-publication-only-upgrades/feature.gherkin`
- `specs/388-support-package-scoped-publication-only-upgrades/verification-report.md`

## Deferred Delivery Gates and Risks

- Independent review, live `repository.nmg-sdlc-smoke`, PR publication, merge, release bump, and issue closure are intentionally outside this first-half assignment. The required local `repository.tests` gate passed; the remaining stages stay owned by later delivery.
- The selected contract binds the canonical absolute repository root by design. Moving an approved checkout requires a fresh detection and approval.
- No unresolved defect was observed in the approved implementation scope.
