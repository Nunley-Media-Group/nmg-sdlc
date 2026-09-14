# Verification Report: Support single-package publication-only upgrades

**Date**: 2026-09-13
**Issue**: #388
**Reviewer**: Exact-head directory-authority remediation verification
**Scope**: Sole definitive review finding at requested head `c25818910c2dcacf320e9c8c4dfaa768eb50aea6`: persistent directory records, authority digest and final-rerun equality, adversarial replacement regressions, full repository gates, and disposable actual-source CLI exercise; no publication, merge, installation, or nested execution

## Implementation Status: Pass

The selected-package result now carries regular-file and directory inventories separately. Each globally path-sorted directory record contains one repository-relative POSIX path, high-resolution identity, and captured deterministic name/type listing; records are JSON-safe, unique, included in approval authority, and compared exactly during the final authority rerun. The final synchronous boundary remains authority and exact approval equality, target proof, stage proof, lock proof, then immediate rename. No protection is claimed for non-target inventory mutation after authority completion or non-cooperative mutation inside the documented pathname syscall gaps. No native dependency was added.

## Issue Scope

- Correction baseline head: `c25818910c2dcacf320e9c8c4dfaa768eb50aea6`
- Verified source SHA-256: `e40b3456a4fda6374f468f9cfedf85b6d660104246118a63816325022774fad7` (`scripts/sdlc-upgrade.mjs`)
- Active issue/spec: #388 / `specs/388-support-package-scoped-publication-only-upgrades`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009]
- Regression: unbounded `detectUpgrade()` / `applyUpgrade()`, pre-#388 legacy command resolution and option-value consumption, publication grammar/report compatibility, and hidden Markdown task visibility

<!-- nmg-sdlc-issue-scope: {"issueNumber":388,"specPath":"specs/388-support-package-scoped-publication-only-upgrades","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | API and CLI require exactly one `--spec`; zero, repeated, or multiple selections fail before detection/apply. Unselected rewrite/finding packages remain byte-identical. |
| AC2 | Pass | Approval hashes canonical root/package, a globally sorted descriptor-read regular-file inventory, and a separately globally sorted directory inventory. Every directory record carries POSIX path, high-resolution identity, and deterministic name/type listing; a reversed-`readdirSync` detection produces byte-equivalent records, file inventory, and approval id. Source digests, exact-string issue digits, and the rewrite/finding plan remain bound from the private descriptor-read tasks Buffer. |
| AC3 | Pass | Dedicated apply requires exact directory-record and approval-id equality before final target proof, then proves stage and lock before immediate atomic rename. JSON reports expose metadata but no raw Buffer; no dependency, backfill, GitHub, or other phase is reachable. |
| AC4 | Pass | Replacing an empty directory with an identical empty listing, or replacing a non-empty directory while preserving its listing and descendant file inode/bytes, changes approval authority and stale apply performs zero target renames. Prior file, stage, target, and lock failure boundaries remain covered. |
| AC5 | Pass | Minimal ASCII Buffer spans preserve mixed EOL and invalid byte `0xff`; visible duplicate declarations remain byte-identical blocking findings. Fenced/commented duplicate headings and escaped backticks use the declaration parser's exact paired-delimiter visibility semantics, so visible T001 is not suppressed. |
| AC6 | Pass | Focused and disposable PathCast-shaped fixtures convert exactly four labels, preserve unrelated package hashes, and converge from four writes to zero. |
| AC7 | Pass | Command resolution scans with the pre-#388 legacy command set first. Any resolved legacy command keeps publication-command positionals ignored; strict validation runs only when no legacy command resolves and a publication command does. |

## Finding Disposition

1. **Incorrect final synchronous ordering** — remediated. The uninterrupted sequence now completes the descriptor-bound package authority rerun and exact approval-id equality before final target identity/bytes proof, final staged identity/exact-output proof, final lock identity/exact-owner proof, and immediate `renameSync`.
2. **Directory inventory not bound across traversal** — remediated. Each directory binds lstat identity before and after its initial sorted `readdirSync`, traverses only the captured entries, then requires the same identity and identical sorted names/types around the final listing. Symlink replacement, plain-directory replacement, and late-file insertion all cause zero commits with unchanged tasks.
3. **Mixed descriptor identity and pathname task bytes** — remediated. `inventoryPublicationPackage()` carries exact descriptor-read Buffers; selected `publicationFilesUpgrade()` accepts only carried sources and fails if `tasks.md` is absent. Existing repository-wide behavior is isolated in the clearly named `legacyPublicationFilesUpgrade()` path planner. A regression observes zero selected-path `readFileSync(tasksPath)` calls across detect and apply.
4. **Final target/stage/lock mutation coverage** — remediated. Target same-byte replacement is injected after the authority's final directory listing/lstat and reaches final target descriptor proof; stage replacement/mutation occurs during authority and reaches final stage proof; lock replacement/mutation reaches final lock proof. Each performs zero target renames.
5. **Cooperative syscall boundary** — preserved. Non-target inventory mutation after authority completion and non-cooperative mutation after a target, stage, or lock final proof inside the immediately following pathname syscall gap remain undefined external interference.
6. **Directory identity discarded from approval authority** — remediated. `inventoryPublicationPackage()` now returns one JSON-safe record per traversed directory after final identity/listing validation. Detection carries a separately globally sorted, duplicate-free `selectedDirectories` result into canonical authority, and final apply requires exact directory-record equality before target proof. Empty and non-empty identical-listing replacements produce a different id and stale apply leaves tasks unchanged with zero target rename; reversing raw `readdirSync` order preserves both inventories and the approval id exactly.

## Lock, Target, and Stage Shape

- Lock: `<root>/.nmg-sdlc-publication.lock`, regular file, mode `0600`, exclusive creation, fsynced token/pid JSON; matching high-resolution pre-open/descriptor/post-read identity and exact owner bytes gate both target rename and lock unlink, with `O_NOFOLLOW` where available.
- Inventory/target: every regular entry is descriptor-bound to matching pre-open lstat, fstat, exact bytes/hash, and post-read lstat. Every directory emits one JSON-safe POSIX-path/identity/listing record only after identity and deterministic names/types are stable across captured-entry traversal. Directory and regular-file records are separately globally path-sorted; selected task planning consumes the private inventory Buffer directly.
- Stage: `<root>/.nmg-sdlc-publication.<token>.staged`, exclusive regular file, target mode, exact output Buffer, fsynced and finally revalidated through a descriptor.
- Success: complete authority rerun with exact directory-record and approval-id equality, final target proof, final stage proof, and final lock proof are followed immediately by one atomic stage-to-`tasks.md` rename, then a fresh adjacent lock owner read and pathname unlink.
- Pre-boundary failure: original target is not renamed; mutated/replaced stages or a final lock mismatch retain the lock and stage for inspection without deleting unproven data.
- Post-rename cleanup failure: structured `applied: true`; the unproven lock remains for inspection. There is intentionally no recovery record or rollback transaction.

## Exact Commands and Results

| Command | Result |
|---|---|
| `node --check scripts/sdlc-upgrade.mjs && node --check scripts/__tests__/sdlc-upgrade.test.mjs` | Passed. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "package-scoped publication-only upgrade"` | Passed: 1 suite, 47 focused tests; 45 unrelated tests skipped. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "repairs exactly four\|binds one complete\|directory records\|empty directory replacement\|nonempty directory replacement\|descriptor-bound task snapshots\|authority rerun\|authority completion\|non-tasks replacement\|directory replaced\|late file inserted\|descriptor read boundary\|final stage proof\|final lock proof\|cleanup owner bytes\|atomic rename\|lock\|safe-integer\|single-spec\|duplicate spec\|sorts the complete\|ambiguous\|visibility and rewrites visible T001\|legacy parsing"` | Passed: 1 suite, 43 requested-boundary probes; 49 unrelated tests skipped. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand` | Passed: 1 suite, 92 tests. |
| Legacy positional CLI compatibility probes | Passed through legacy apply with status 0 and no `publication_cli_invalid` in the registered regression suite. |
| `cd scripts && npm test -- --runInBand` | Passed: 55 suites passed, 1 skipped; 1,292 tests passed, 2 skipped; 56 suites and 1,294 tests total. |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Passed. |
| `node scripts/verify-current-specs.mjs` | Passed: 78 genuine issue specs, 16 required archive, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub. |
| `node scripts/skill-inventory-audit.mjs --check` | Passed: 43 items mapped. |
| Version synchronization probe | Passed: `VERSION=3.21.3 package=3.21.3`; no implementation-time bump. |
| `node scripts/contribution-evidence.mjs --root . <input.json>` | Passed: `{"ok":true,"errors":[]}` for the exact 11 changed paths and #388 report. |
| `git diff --check` | Passed after final evidence update. |

## Disposable Actual-Source Exercise

- Source: current checkout `scripts/sdlc-upgrade.mjs`; fixture was a disposed real temporary directory and did not install the plugin.
- Selected: `specs/108-coordinate-the-pathcast-to-miledar-prelaunch-rebrand`.
- Unselected dirty packages: `specs/110-unrelated-rewrite`, `specs/4-unrelated-finding`.
- Approval: `publication-files:824102b8aace5a3840ad97882b9ffac35f2e6632d774053d4c354848cca05fc6`.
- Observed through actual Node CLI from current source: writes `4 -> 0`; four canonical labels and zero legacy labels; unrelated SHA-256 values unchanged; result ids contained only the approved publication id; lock and root-stage files absent after success.

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

- Cooperative filesystem boundary: non-target inventory can change after the completed authority rerun, and a non-cooperative same-credential actor can mutate or replace the target, stage, or lock after its respective final proof inside the immediately following pathname syscall gap. Node has no portable identity-conditional primitive; behavior under that interference is undefined.
- Root staging assumes the repository root and selected package share a filesystem. A nested mount makes rename fail with `publication_files_commit_failed`; absent out-of-scope interference, the target is not renamed.
- A mutated or replaced staged file, final lock mismatch, or failed post-commit lock cleanup intentionally retains inspection evidence; automation does not guess ownership.
- PR publication, push, merge, installation, live smoke, release bump, and issue closure remain outside this assignment.
