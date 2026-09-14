# Verification Report: Support single-package publication-only upgrades

**Date**: 2026-09-13
**Issue**: #388
**Reviewer**: Independent-rereview remediation verification
**Scope**: Approved single-package contract, implementation, adversarial regressions, full repository gates, and disposable actual-source CLI exercise; no delivery

## Implementation Status: Pass

The rereview initially exposed failure modes in a multi-package transaction. The approved contract was then narrowed to the actual workflow need: exactly one issue-owned package and one `tasks.md` target. This deletes multi-target rollback, original-inode staging, lock-directory cleanup, and recovery-record machinery. Dedicated apply now performs one fsynced root-stage write and one atomic rename under one identity-bound root lock file.

## Issue Scope

- Baseline head: `25e9f199e68513e1c6adad89305ef7791ecf4491`
- Active issue/spec: #388 / `specs/388-support-package-scoped-publication-only-upgrades`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009]
- Regression: unbounded `detectUpgrade()` / `applyUpgrade()`, publication grammar/report compatibility, and legacy command parsing

<!-- nmg-sdlc-issue-scope: {"issueNumber":388,"specPath":"specs/388-support-package-scoped-publication-only-upgrades","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | API and CLI require exactly one `--spec`; zero, repeated, or multiple selections fail before detection/apply. Unselected rewrite/finding packages remain byte-identical. |
| AC2 | Pass | Approval hashes canonical root/package, the complete directly sorted inventory, SHA-256 digests, regular-file lstat identities, exact-string issue digits, and exact rewrite/finding plan. Nested `a.txt` versus `a/child` ordering is explicit. |
| AC3 | Pass | Dedicated apply creates one exclusive fsynced root stage, reruns full detection, validates target/stage bytes and identities, and performs one atomic rename. `O_NOFOLLOW` is defense in depth; lstat/descriptor/lstat proof is portable. No dependency, backfill, GitHub, or other phase is reachable. |
| AC4 | Pass | Raw symlink traversal, stale inventory/target, same-byte identity swap, stage replacement/mutation, pre-existing or symlinked lock, partial/wrong owner bytes, and same-token replacement inode fail closed. Atomic rename failure leaves original bytes/inode unchanged. |
| AC5 | Pass | Minimal ASCII Buffer spans preserve mixed EOL and invalid byte `0xff`; duplicate declarations remain byte-identical blocking findings. |
| AC6 | Pass | Focused and disposable PathCast-shaped fixtures convert exactly four labels, preserve unrelated package hashes, and converge from four writes to zero. |
| AC7 | Pass | Publication CLI requires one command token, one spec, and one apply approval; ambiguous syntax fails before mutation while legacy command-looking values remain compatible. |

## Finding Disposition

1. **HIGH total rollback failure** — eliminated by the approved single-target cutover. No original target is moved before commit; failed atomic rename leaves it untouched. Multi-target rollback/recovery code and tests were deleted.
2. **HIGH identity restoration / cross-platform rollback** — eliminated with the same design. One staged-to-target rename either succeeds or reports `publication_files_commit_failed` with `applied: false`; no byte-copy or inode-restoration claim remains.
3. **HIGH lock setup race** — remediated by one exclusive regular root lock file. Portable ownership requires matching lstat identity before open, descriptor identity, exact owner bytes, and matching lstat after read; `O_NOFOLLOW` is supplemental. Partial/wrong bytes and pre-existing/symlinked locks remain untouched.
4. **MEDIUM successful-commit cleanup failure** — remediated. The outcome is set by the successful rename; lock unlink failure reports `publication_files_cleanup_failed`, `state: applied_cleanup_failed`, `applied: true`, and retains exact token/pid owner bytes.
5. **MEDIUM inventory sorting** — remediated by collecting the complete single-package inventory and sorting repository-relative paths with direct `<`/`>` comparison.
6. **MEDIUM issue identity** — remediated inside `scripts/sdlc-upgrade.mjs` only; directory/frontmatter digits compare as exact strings, including values above $2^{53}$.
7. **Follow-up stage/lock ownership blockers** — remediated by exact stage byte/identity checks immediately before rename and exact lock inode/mode/size plus owner-byte proof before unlink. Same-token replacement locks receive zero writes/deletes.

## Lock and Stage Shape

- Lock: `<root>/.nmg-sdlc-publication.lock`, regular file, mode `0600`, exclusive creation, fsynced token/pid JSON; pre-open/descriptor/post-read identity and exact bytes gate deletion, with `O_NOFOLLOW` where available.
- Stage: `<root>/.nmg-sdlc-publication.<token>.staged`, exclusive regular file, target mode, exact output Buffer, fsynced and directly revalidated before rename.
- Success: atomic stage-to-`tasks.md` rename, then exact lock identity/bytes verification and unlink.
- Pre-rename failure: original target remains untouched; exact owned stage is removed. A replaced stage is preserved with the lock.
- Post-rename cleanup failure: structured `applied: true`; the valid lock file remains ownership evidence. There is intentionally no recovery record or rollback transaction.

## Exact Commands and Results

| Command | Result |
|---|---|
| `node --check scripts/sdlc-upgrade.mjs && node --check scripts/__tests__/sdlc-upgrade.test.mjs` | Passed. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "package-scoped publication-only upgrade"` | Passed: 1 suite, 33 focused tests; 45 unrelated tests skipped. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "repairs exactly four|binds one complete|revalidates complete|staged|atomic rename|lock|safe-integer|single-spec|duplicate spec|sorts the complete|rejects an ambiguous"` | Passed: 1 suite, 24 requested-boundary probes; 54 unrelated tests skipped. Multi-target rollback has no probe because that subsystem was deleted by the approved single-target cutover. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand` | Passed: 1 suite, 78 tests. |
| `cd scripts && npm test -- --runInBand` | Passed: 55 suites passed, 1 skipped; 1,278 tests passed, 2 skipped; 56 suites and 1,280 tests total. |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Passed. |
| `node scripts/verify-current-specs.mjs` | Passed: 78 genuine issue specs, 16 required archive, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub. |
| `node scripts/skill-inventory-audit.mjs --check` | Passed: 43 items mapped. |
| Version synchronization probe | Passed: `VERSION=3.21.3 package=3.21.3`; no implementation-time bump. |
| Raw documentation byte probe | Passed: portable `<plugin-root>` counts 1/2/4 and personal-path counts 0/0/0 across README/workflow/detector reference. |
| `node scripts/contribution-evidence.mjs --root . <input.json>` | Passed: `{"ok":true,"errors":[]}` for the exact 11 changed paths and #388 report. |
| `git diff --check` | Passed after final evidence update. |

## Disposable Actual-Source Exercise

- Source: current checkout `scripts/sdlc-upgrade.mjs`; fixture was a disposed real temporary directory and did not install the plugin.
- Selected: `specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand`.
- Unselected dirty packages: `specs/110-unrelated-rewrite`, `specs/4-unrelated-finding`.
- Approval: `publication-files:9ec3ec7fcf3710b3b9121757504bca1bf54b8a4eb36000c05d3dd1227b69d09f`.
- Observed: writes `4 -> 0`; four canonical labels; unrelated SHA-256 values unchanged; result ids contained only the approved publication id; lock and root-stage files absent after success.

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

## Residual Risks

- The root lock is cooperative; a process that ignores it can still race between final checks and rename. Exact target/stage validation minimizes but cannot remove that filesystem race.
- Root staging assumes the repository root and selected package share a filesystem. A nested mount makes rename fail before target mutation with `publication_files_commit_failed`.
- A replaced staged file or failed post-commit lock unlink intentionally requires operator inspection/removal; automation does not guess foreign ownership.
- PR publication, push, merge, installation, live smoke, release bump, and issue closure remain outside this assignment.
