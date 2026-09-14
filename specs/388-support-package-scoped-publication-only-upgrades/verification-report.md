# Verification Report: Support single-package publication-only upgrades

**Date**: 2026-09-13
**Issue**: #388
**Reviewer**: Independent-rereview remediation verification
**Scope**: Approved cooperative single-package contract, descriptor-bound target validation, CLI resolution, task visibility, adversarial regressions, full repository gates, and disposable actual-source CLI exercise; no delivery

## Implementation Status: Pass

The final rereview identified absolute pathname-race guarantees that Node cannot portably provide. The Approved contract now states the cooperative filesystem threat model: authorized nmg-sdlc invocations honor the exclusive root lock; every lock, stage, target, inventory, or byte change observed before the final validated boundary fails closed; deliberate same-credential replacement or mutation after the last validation inside `renameSync` or `unlinkSync` is undefined external interference outside the contract. No native dependency was added.

## Issue Scope

- Review baseline head: `f3c1d1576d3ad8595b17c52e788153fd7bb0cb9b`
- Active issue/spec: #388 / `specs/388-support-package-scoped-publication-only-upgrades`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009]
- Regression: unbounded `detectUpgrade()` / `applyUpgrade()`, pre-#388 legacy command resolution and option-value consumption, publication grammar/report compatibility, and hidden Markdown task visibility

<!-- nmg-sdlc-issue-scope: {"issueNumber":388,"specPath":"specs/388-support-package-scoped-publication-only-upgrades","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | API and CLI require exactly one `--spec`; zero, repeated, or multiple selections fail before detection/apply. Unselected rewrite/finding packages remain byte-identical. |
| AC2 | Pass | Approval hashes canonical root/package, the complete directly sorted inventory, SHA-256 digests, regular-file lstat identities, exact-string issue digits, and exact rewrite/finding plan. Nested `a.txt` versus `a/child` ordering is explicit. |
| AC3 | Pass | Dedicated apply creates one exclusive fsynced root stage, reruns full detection, validates the final target through pre-open lstat, one opened descriptor, descriptor fstat/exact bytes, and post-read path identity, verifies stage bytes/identity, and performs one atomic rename. No dependency, backfill, GitHub, or other phase is reachable. |
| AC4 | Pass | All changes observed before the final validated boundary fail closed. Same-byte target replacement during the descriptor-read boundary is detected before rename. The contract explicitly excludes deliberate same-credential replacement after final validation inside pathname rename/unlink. |
| AC5 | Pass | Minimal ASCII Buffer spans preserve mixed EOL and invalid byte `0xff`; visible duplicate declarations remain byte-identical blocking findings. Fenced/commented duplicate headings and escaped backticks use the declaration parser's exact paired-delimiter visibility semantics, so visible T001 is not suppressed. |
| AC6 | Pass | Focused and disposable PathCast-shaped fixtures convert exactly four labels, preserve unrelated package hashes, and converge from four writes to zero. |
| AC7 | Pass | Command resolution scans with the pre-#388 legacy command set first. Any resolved legacy command keeps publication-command positionals ignored; strict validation runs only when no legacy command resolves and a publication command does. |

## Finding Disposition

1. **Impossible identity-conditional pathname guarantees** — contract narrowed. Node has no portable identity-conditional `renameSync`/`unlinkSync`; post-validation deliberate same-credential replacement inside either pathname syscall is out-of-scope undefined external interference.
2. **Final target path-read race** — remediated. The final target is opened once with `O_NOFOLLOW` where supported and proved by pre-open lstat, descriptor fstat, exact descriptor bytes, and post-read path identity. Same-byte replacement during the read boundary fails before rename.
3. **CLI command-position regression** — remediated. Pre-#388 legacy commands resolve first, so `apply --approve not-an-id detect-publication --root <fixture>` and its `apply-publication` twin both execute legacy apply with status 0 and no `publication_cli_invalid`. Strict validation runs only when no legacy command resolves.
4. **Hidden duplicate task headings** — remediated locally in `scripts/sdlc-upgrade.mjs` without changing `sdlc-safe-recoveries.mjs`. Task ID discovery mirrors declaration validation's Markdown fences, HTML comments, escaped backticks, and paired delimiter roles; visible T001 rewrites rather than silently producing zero.
5. **Practical lock/stage/target checks** — retained. Exclusive fsynced root lock/stage, complete authority rerun, exact identities/bytes, single rename, conservative cleanup, and truthful `applied: true` cleanup failures remain.
6. **Inventory and issue identity** — retained. Sorting is direct and locale-independent; issue digits compare as exact strings, including values above $2^{53}$.

## Lock, Target, and Stage Shape

- Lock: `<root>/.nmg-sdlc-publication.lock`, regular file, mode `0600`, exclusive creation, fsynced token/pid JSON; pre-open/descriptor/post-read identity and exact bytes gate pathname unlink, with `O_NOFOLLOW` where available.
- Target: immediately before commit, one opened descriptor is bound to pre-open lstat and expected identity; exact descriptor bytes and post-read path identity must match.
- Stage: `<root>/.nmg-sdlc-publication.<token>.staged`, exclusive regular file, target mode, exact output Buffer, fsynced and directly revalidated before rename.
- Success: one atomic stage-to-`tasks.md` rename, then validated lock ownership and pathname unlink.
- Pre-boundary failure: original target is not renamed; an exactly owned stage is removed, while a replaced stage is preserved with the lock.
- Post-rename cleanup failure: structured `applied: true`; the validated lock remains ownership evidence. There is intentionally no recovery record or rollback transaction.

## Exact Commands and Results

| Command | Result |
|---|---|
| `node --check scripts/sdlc-upgrade.mjs && node --check scripts/__tests__/sdlc-upgrade.test.mjs` | Passed. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "package-scoped publication-only upgrade"` | Passed: 1 suite, 36 focused tests; 45 unrelated tests skipped. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand --testNamePattern "repairs exactly four\|binds one complete\|revalidates complete\|descriptor read boundary\|staged\|atomic rename\|lock\|safe-integer\|single-spec\|duplicate spec\|sorts the complete\|ambiguous\|visibility and rewrites visible T001\|legacy parsing"` | Passed: 1 suite, 31 requested-boundary probes; 50 unrelated tests skipped. |
| `cd scripts && node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/sdlc-upgrade.test.mjs --runInBand` | Passed: 1 suite, 81 tests. |
| `apply --approve not-an-id detect-publication --root <fixture>` and the `apply-publication` positional twin | Both passed through legacy apply with status 0; neither emitted `publication_cli_invalid`. |
| `cd scripts && npm test -- --runInBand` | Passed: 55 suites passed, 1 skipped; 1,281 tests passed, 2 skipped; 56 suites and 1,283 tests total. |
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
- Approval: `publication-files:54e6567671dbbdc91f32dbef095ed0721f519e7609dba7fde69f356b8fbc9bf5`.
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

- Cooperative filesystem boundary: a non-cooperative same-credential actor can deliberately replace or mutate the lock, stage, or target after its last validation inside the following pathname `renameSync` or `unlinkSync`. Node has no portable identity-conditional primitive; behavior under that external interference is undefined.
- Root staging assumes the repository root and selected package share a filesystem. A nested mount makes rename fail with `publication_files_commit_failed`; absent out-of-scope interference, the target is not renamed.
- A replaced staged file or failed post-commit lock unlink intentionally requires operator inspection/removal; automation does not guess foreign ownership.
- PR publication, push, merge, installation, live smoke, release bump, and issue closure remain outside this assignment.
