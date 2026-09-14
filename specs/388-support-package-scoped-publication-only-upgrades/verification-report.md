# Verification Report: Support package-scoped publication-only upgrades

**Date**: 2026-09-13
**Issue**: #388
**Reviewer**: Independent-review remediation verification
**Scope**: Approved specification, implementation, independent findings, focused/full changed-surface tests, and disposable installed-source exercise; no delivery

## Implementation Status: Pass after independent-review remediation

The dedicated selected-package contract now holds a project-owned lock across final inventory/identity revalidation and a staged multi-target commit, restores original bytes on injected write/rename failure, rejects symlinked root components, performs Buffer-slice ASCII rewrites without normalizing invalid UTF-8, and rejects ambiguous publication CLI forms before mutation. A final PathCast-shaped actual-source CLI fixture converted exactly four selected labels, retained same-line byte `0xff`, left unrelated dirty packages unchanged, invoked no fake `gh`, and converged to zero writes.

## Issue Scope

- Active issue: #388
- Spec: `specs/388-support-package-scoped-publication-only-upgrades`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008]
- Regression: existing unbounded `detectUpgrade()` / `applyUpgrade()` behavior and the prior publication detector suite

<!-- nmg-sdlc-issue-scope: {"issueNumber":388,"specPath":"specs/388-support-package-scoped-publication-only-upgrades","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | `detectPublicationUpgrade(root, { specDirs })` still validates a non-empty explicit set and scopes publication inspection to that set. The fixture had selected #108 plus two unrelated dirty packages; only #108 entered the selected report. |
| AC2 | Pass | Approval hashing binds exact symlink-free root, sorted selection, recursively inventoried regular-file SHA-256 digests, stable `device`/`inode`/`mode`/`size` identities, target identity, and exact rewrite/finding records. Apply holds `.nmg-sdlc-publication.lock` while staging and rerunning the complete report immediately before commit. |
| AC3 | Pass | `applyPublicationUpgrade` stages exact original/output Buffers before rename and moves each original target inode into owned staging during commit. Injected second staged-write failure committed nothing; injected second target-rename failure rolled every moved inode back. Both selected originals compared byte- and inode-identical and the owned lock was removed. No dependency, backfill, GitHub, or other apply phase is reachable. |
| AC4 | Pass | Root-final-component, ancestor, raw symlink-before-`..`, and missing-component/`..`/symlink spellings fail with `publication_root_symlink`; lexical inspection continues past a missing component before `path.resolve`. Existing invalid/stale cases remain covered. Staging-time inventory addition and same-byte inode replacement fail with `publication_files_plan_stale` before target commit. A staged-rename failure safely restores a temporarily absent target. Foreign lock bytes remain untouched, while injected owner-metadata creation failure removes the exact self-created lock directory by its captured device/inode. |
| AC5 | Pass | Reversible grammar inspection plus minimal Buffer-slice writes preserve every byte outside approved ASCII spans. The regression places raw `0xff` on the first rewritten declaration line and compares the entire output to an expected Buffer formed only by the four label replacements. Repeat detection reports zero writes. |
| AC6 | Pass | Focused and disposable tests name T001-T004 and prove exactly four `**Files**` → `**File(s)**` replacements while unrelated package hashes remain identical. The disposable same-line `0xff` also remains present. |
| AC7 | Pass | New publication commands require exactly one command token and reject unknown options, positionals, duplicate singleton options, missing/option-like values, and extra commands before mutation. A process test proves legacy `detect` still ignores its historically ignored positional/unknown-option forms. Raw bytes in current README/workflow/reference contain portable `<plugin-root>` tokens. |

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T001 | Complete | Added symlink-component rejection, exact-byte plus lstat-identity inventory, required target-identity binding in every selected write plan, project mutation lock, staged snapshots, final under-lock revalidation, minimal ASCII Buffer splices, original-inode staging, and multi-target rollback in `scripts/sdlc-upgrade.mjs`. |
| T002 | Complete | Added strict parsing only for `detect-publication` / `apply-publication`; updated the workflow contract and detector reference with transaction, byte, identity, and root boundaries. |
| T003 | Complete | Twenty-five focused regressions cover the original selected contract plus second-write/rename rollback, final staged inventory drift, same-byte inode replacement, temporarily missing-target rollback, raw lexical symlink traversal, foreign and setup-failed lock ownership, duplicate-declaration blocking, same-line invalid UTF-8, seven ambiguous argv forms, stable approval diagnostics, and legacy parser compatibility. The disposable actual-source CLI exercise covers PathCast plus unrelated packages. |
| T004 | Complete | Updated README, Unreleased changelog, Approved spec, scenarios, and this evidence. Required plugin/current-spec/inventory/version/contribution surfaces are recorded below. |

## Exact Commands and Results

| Command | Result |
|---|---|
| `node --check scripts/sdlc-upgrade.mjs && node --check scripts/__tests__/sdlc-upgrade.test.mjs` | Passed after final Buffer-slice remediation. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "package-scoped publication-only upgrade"` | Passed: 1 suite, 25 tests; 45 unrelated tests skipped by the focus filter. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand` | Passed: 1 suite, 70 tests, 0 failures/skips. |
| `cd scripts && npm test -- --runInBand` | Passed final required `repository.tests`: 55 suites passed, 1 skipped; 1,270 tests passed, 2 skipped; 56 suites and 1,272 tests total. |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Passed: repository plugin surface valid. |
| `node scripts/verify-current-specs.mjs` | Passed: 78 genuine issue specs, 16 required archive, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub. |
| `node scripts/skill-inventory-audit.mjs --check` | Passed: 43 items mapped. |
| Raw-byte Python inspection of README, upgrade workflow, and detector reference | Rejected LOW rendered-path claim: literal portable token counts were 1, 2, and 4 respectively; `/Users/rnunley` byte count was zero in all three files. |
| `node -e "const fs=require('node:fs'); const version=fs.readFileSync('VERSION','utf8').trim(); const packageVersion=require('./package.json').version; if(version!==packageVersion) process.exit(1); console.log('VERSION='+version+' package='+packageVersion)"` | Passed: `VERSION=3.21.3 package=3.21.3`; no implementation-time version bump. |
| `node scripts/contribution-evidence.mjs --root . /tmp/nmg-sdlc-388-contribution-evidence.json` | Passed: `{"ok":true,"errors":[]}` for issue #388, the exact 11 changed paths, generated delivery body, and final report. |
| `git diff --check` | Passed with no whitespace errors after final evidence updates. |

## Disposable Installed-Source CLI Exercise

- Fixture: `/private/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-388-pathcast-advisory-jt0js6k7`
- Source entry point: current checkout `scripts/sdlc-upgrade.mjs`
- Selected package: `specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand`
- Unselected dirty packages: `specs/110-unrelated-rewrite` and `specs/4-unrelated-finding`
- Approval: `publication-files:49213d1286b7f4128afb030c54f861ac3e5bd6c37f2b345a9c3e8c62f4e473f6`
- Result: selected writes `4 -> 0`; selected exact output equaled the original Buffer with only four label replacements; raw `0xff` on T001's declaration line remained; the owned lock was absent afterward.
- Unselected #110 SHA-256 before/after: `cf0a6e1d6850d7fd18c899c443b5f0c5c97d3db03f52690a7c1ffb05542a9541`
- Unselected #4 SHA-256 before/after: `62e01ca2a527b57e0224c303032f8222bbad881bdc1a58774d89ad96c5df5c95`
- Result ids contained only the approved publication id; `spec-created-backfill` and fake `gh` marker were absent.

## Steering and Contribution Alignment

- Product: exact package authority now includes a cooperative project mutation boundary, rollback, same-line opaque-byte preservation, and strict no-mutation argument rejection.
- Technical: zero-dependency Node ESM, exact Buffer snapshots/slices, atomic same-filesystem rename, stable reason codes, lstat-based symlink-component rejection, and ownership-token cleanup.
- Structure: runtime behavior remains in `scripts/`; workflow detail remains in `workflows/upgrade-project/references/`; public discoverability remains in README; no PathCast-specific production branch or second mutation convention was added.
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

## Independent Finding Disposition and Remaining Risks

- HIGH partial mutation / final identity drift: **remediated** by digest-bound regular-file lstat identities and required selected target identities, owned lock, all-output staging, final complete report plus direct target-byte/identity revalidation, original-inode staging, and rollback. Persistent storage failure that also defeats both original-inode rollback and fallback write is surfaced as `publication_files_rollback_failed`; software cannot guarantee restoration when the filesystem rejects every restore operation.
- MEDIUM symlinked caller root: **remediated** with stable `publication_root_symlink` for final-component, ancestor, and symlink-before-`..` lexical traversal.
- MEDIUM invalid UTF-8 and duplicate-declaration preservation: **remediated** with exact Buffer-slice edits, same-line `0xff` whole-buffer comparison, and fail-closed duplicate finding with byte-identical output.
- MEDIUM ambiguous publication CLI: **remediated** before mutation while legacy parsing—including command-looking option values—remains unchanged. Malformed or duplicate apply approval values retain `publication_files_approval_invalid`; unrelated syntax uses `publication_cli_invalid`.
- LOW personal installation paths: **rejected** for the current rendered-doc sources. Raw byte counts prove seven literal portable `<plugin-root>` tokens and zero `/Users/rnunley` bytes across README, `WORKFLOW.md`, and `v3-detectors.md`; the display renderer materializes those tokens when presenting content.
- Workflow-bundle validator was not applicable because this repository uses `WORKFLOW.md`, not an Agent Skill `SKILL.md`; plugin surface and the 43-item inventory are the owning validations and both pass.
- Live smoke, PR publication, push, merge, release bump, installation, and issue closure remain outside this remediation assignment.
