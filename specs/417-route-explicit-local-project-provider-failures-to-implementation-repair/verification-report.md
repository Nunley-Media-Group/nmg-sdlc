# Verification Report: Project-provider implementation recovery

**Issue**: #417
**Spec**: `specs/417-route-explicit-local-project-provider-failures-to-implementation-repair/`
**Date**: 2026-09-24

### Implementation Status: Fail

The repair reproduces the retained MileDar classification defect and makes the exact original artifact eligible for one operator-authorized implementation recovery. The registered plugin smoke gate remains **Fail**; no passing gate, PR merge, issue closure, or production installation is claimed.

<!-- nmg-sdlc-issue-scope: {"issueNumber":417,"specPath":"specs/417-route-explicit-local-project-provider-failures-to-implementation-repair","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Defect reproduction and repair

- Before: `inspectVerificationArtifactRepair` on retained MileDar `.omp/sdlc/verification/169.json` at `226c77f7ede44a987db5936f624dd82012df49a2` returned `intervention`, `failedExternal: ["repository.robot-integration"]`, no local failures. The original bytes have SHA-256 `4a7afb16391e03492beb941e5f7a35bb406b9683ef22271c110e0fd18afc232c` and the pre-marker five-field provider envelope.
- After (read-only): `discoverRecovery({cwd: <MileDar>, legacyRecoveryDigest: <original SHA-256>})` returned `loop-recovery-available`, `actionable_verification_resume`, issue #169, exact head, `failedLocal: ["repository.robot-integration"]`. Ordinary unmarked classification remains intervention. No MileDar file or steering was changed; no recovery was consumed.
- Explicit new provider results require registered `project.*`, required/applicable failed status, exact request/result identity, complete coverage, a `repairable: true` field, and structured executed local-command evidence (`program`, `args`, `cwd`, nonzero integer `exitCode`). Failed `builtin.command` behavior remains unchanged; the failed ceiling stays Fail. Incomplete external prerequisites and unmarked external failures do not auto-recover.

## Verification commands and outcomes

| Command | Outcome |
|---|---|
| `npm test -- --runInBand` in `scripts/` after rebasing on #415 | 56 suites passed, 1 skipped; 1,568 tests passed, 2 skipped |
| `node scripts/skill-exercise-runner.mjs --skill verify-code` | 14 passed, 0 failed |
| `node scripts/verify-plugin-surface.mjs --root . --label issue-417-rebased` | passed |
| `node scripts/skill-inventory-audit.mjs --check` | clean, 91 items mapped |
| `node scripts/verify-current-specs.mjs` | passed, 90 genuine issue specs |
| `omp plugin doctor` on candidate local link | 5 OK, 0 warnings/errors; version 3.24.6 |
| `NMG_SDLC_SMOKE_ISSUES=129 node scripts/sdlc-verify-steering.mjs --project . --issue 417 --spec specs/417-route-explicit-local-project-provider-failures-to-implementation-repair --base origin/main` | **Fail**: complete coverage 2/2, `repository.tests` passed, `repository.nmg-sdlc-smoke` failed |

## Registered smoke blocker

Fresh approved smoke issue [#129](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/129) had its four-file spec merged via [PR #130](https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/130), both CI workflows passed, and `spec-created` was applied. The spec-only merge closed the issue, so it was reopened before execution. The registered provider cloned it and its implementation worker committed `7defa127f288db20baa6c1c69721e1e31a2615ab` on the issue branch.

The nested controller then stopped at review1 with `review_scope_unproven`, not a verification pass. Reviewer 1 produced a valid read-only final result; reviewer 2 has only read receipts, reviewer 3 has only a session-start receipt. The cause of the missing terminal receipts is unproven. All observed reviewer panes (`w5:p17`–`p19`) stayed in existing workspace/tab `w5:t1`; the original controller pane `w5:p13` remains. The registered controller started OMP reviewer agents in those panes; no new workspace or tab was created. The retained clone is `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-2hBS7G`, with run id `e3386db6-a416-4245-900d-96620bc6b853`, failed step review1 and failed canonical artifact `.omp/sdlc/verification/417.json` in this branch. Retrying unchanged would violate the smoke no-progress rule.

## Disposition

Do not merge #417, close its issue, or install it as the clean merged head while the required registered smoke result is Fail. The candidate global link was restored to clean #415 merged head `c408365bdea3c9ace3ebd6914d4f82fd01fa8885` (v3.24.5), `omp plugin doctor` 5 OK. Preserve the retained clone, failure artifact and this report; resolve the missing review-result blocker under its own authority before any fresh, substantively changed smoke attempt. #418 owns separate start/implementation recovery work and must coordinate the shared `scripts/sdlc-execute.mjs` and version mirrors before merge.
