# Verification Report: Recover bounded automatic delivery stops without loops

**Date**: 2026-09-07
**Issue**: #374
**Reviewer**: Fresh inline architecture-reviewer / verify-code owner
**Scope**: Exact source and clean manager-installed candidate 30c0f9d14d4405389c5f1de330cd2e48299f8f55

## Executive Summary

### Implementation Status: Incomplete

The one authorized fresh registered smoke invocation failed at #100 implement. The full current source suite passed. The provider-parity repair selects the explicit candidate controller through the existing resolver and preserves exact isolation-module identity checks, but this invocation never reached review to prove the repaired boundary end-to-end. The implementation worker stopped because the publication scope helper returned only the four spec files: the approved task paths are unquoted, while the helper extracts only backtick-delimited paths. No implementation, review, pre-merge head, new merged implementation PR, or issue closure is proved. The mandatory steering artifact has ceiling **Fail**; this report remains **Incomplete** because the required live acceptance evidence is unavailable. Neither permits delivery.

| Category | Score (1–5) |
|---|---:|
| Spec compliance | 3 |
| SOLID | 3 |
| Security | 4 |
| Performance | 3 |
| Testability | 4 |
| Error handling | 3 |
| Architecture average (five checklists) | 3.4 |
| Overall average (six categories) | 3.3 |

No source repair, candidate edit, smoke retry, replacement queue, native-driver replay, checkpoint/counter mutation, or manufactured handoff occurred in this review. The existing original failed report was not passed merely because the repair publication committed it unchanged.

## Issue Scope

- Active issue: #374.
- Spec: `specs/374-recover-bounded-automatic-delivery-stops-without-loops`.
- Manifest: implicit single issue; no issue-scope.json.
- Resolver: implicit_single_issue.
- Delivery: AC1–AC11; FR1–FR8; T001–T004; SCN001–SCN011.
- Separate regression identifiers: none. AC10 retains the existing #369/#372 obligations without claiming predecessor delivery.
- All four active specification files declare singular #374 and Approved. Related #372 metadata was inspected within the bounded dependency context; its original ownership and failed evidence remain unchanged.

<!-- nmg-sdlc-issue-scope: {"issueNumber":374,"specPath":"specs/374-recover-bounded-automatic-delivery-stops-without-loops","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete; mandatory fresh smoke failed.
- PR evidence: No qualifying PR-only readiness marker. Missing live smoke proof cannot be deferred as PR Evidence Pending.
- Candidate helper bound original durable verify owner `d89d8ee2-1964-467f-a325-d2dec8f8acb6` before work, with `passed:true` and only this report as the allowed publication path.
- Original #374 execute remains stopped. This review does not authorize its replay.

## Preservation and Evidence Identity

Before any canonical replacement, the original report, `.omp/sdlc/handoffs/374-verify.json`, `.omp/sdlc/verification/374.json`, and prior smoke diagnosis were copied byte-for-byte into:

`.omp/sdlc/evidence/374-before-parity-final-verification/20260907T214935.261730Z/`

The archive manifest records each SHA256 and byte count. Original report SHA256: `c0525981a4e26f7bf029ca11a7d83b3562a3889077070c4612c835092790b72c`. No archived or historical failure bytes were changed.

Current preparation and hash proof: `.omp/sdlc/evidence/374-parity-final-preparation.json`. Nine core implementation files match both the previously reviewed d27cc21 candidate and the current candidate byte-for-byte. All five affected workflow bundles also match the prior reviewed source bytes. Retained exercise runner/support hashes match. The narrow new provider repair and its subprocess regression were reviewed directly rather than reopening old audits.

Installation evidence: `.omp/sdlc/evidence/374-provider-parity-candidate-install.json`. Local repair evidence: `.omp/sdlc/evidence/374-provider-parity-local-smoke.log` and `374-provider-parity-focused.log`. The former proves local subprocess selection and receipt acceptance only, not remote delivery; the latter records 39 passed tests, one expected skip, exit 0.

## Deterministic Steering Artifact and Ceiling

Artifact: `.omp/sdlc/verification/374.json`, generated `2026-09-07T21:56:18.364Z`.

- Source HEAD: `30c0f9d14d4405389c5f1de330cd2e48299f8f55`; initial tree clean.
- Steering hash: `sha256:ae22a075cfd78d4a7ee6ccef09899bacabc84201cc650180dd68c975d1d3ca07`.
- Spec hash: `sha256:cf45b135a91a47d60f9cf447282515650241be2a12bae604fbb6b2d7caf74571`.
- Coverage: declared 2, recorded 2, complete true; missing, duplicate and unknown lists empty.
- `repository.tests`: passed, command exit 0.
- `repository.nmg-sdlc-smoke`: failed, execute exit 1.
- Canonical runner: exit 1, ceiling **Fail**. This result is not overridden by prose or retained local evidence.
- Registered product, tech, structure and verification modules, snippets and smoke provider were loaded/reviewed; no legacy steering fallback.

Exactly one invocation:

```text
node /Users/rnunley/.omp/recovery/nmg-sdlc-374-candidate-30c0f9d/scripts/sdlc-verify-steering.mjs --project . --issue 374 --spec specs/374-recover-bounded-automatic-delivery-stops-without-loops --base main --controller-run-id d89d8ee2-1964-467f-a325-d2dec8f8acb6
NMG_SDLC_PLUGIN_ROOT=/Users/rnunley/.omp/recovery/nmg-sdlc-374-candidate-30c0f9d
NMG_SDLC_SMOKE_ISSUES=100
CI=true
timeout=0
```

The current source test suite ran once through that runner, not as a second independent suite. The registered provider alone cloned and invoked the candidate controller. Neither #98 nor #96 was executed.

## Acceptance Criteria Verification

| AC / Scenario | Status | Evidence |
|---|---|---|
| AC1 / SCN001: stop inventory | Pass | Approved design.md:128–169 inventories the controller, ownership, review, publication, dependency, CI, merge, closure and forbidden families. |
| AC2 / SCN002: bounded slice replacement | Incomplete | Unchanged reviewed execute implementation and current regression suite cover immutable assignments, receipt-based contamination, one step-wide replacement and budget preservation. Fresh #100 stopped before review; current installed end-to-end acceptance remains unproved. |
| AC3 / SCN003: empty/missing review | Pass | `scripts/sdlc-review-main.mjs` preserves distinct review_empty/review_artifact_missing without synthetic findings. Current review-main/execute suites pass. |
| AC4 / SCN004: exact report publication | Pass, local behavior only | `sdlc-safe-recoveries.mjs:618–712` and finalizer enforce owner, exact upstream, known subject, clean state and scope before one recovery push. Current real-local-remote regressions pass. This non-pass report is not claimed committed or pushed by finalization. |
| AC5 / SCN005: mergeability reconciliation | Pass, local behavior only | Unchanged `reconcileMergeability` and execute gate invalidation implementation; current deliver/execute suites cover real merge-tree inspection, unsafe conflicts and full gate re-entry without replenishment. |
| AC6 / SCN006: automation attribution | Pass | Current classifier/delivery suites preserve Bot/allowlisted versus human attribution and automatic_review_unactionable for pathless automation. |
| AC7 / SCN007: post-merge reconciliation | Pass, local behavior only | Current deliver regressions cover bounded observations, exact head/linkage and no merge replay. Fresh smoke never reached a pre-merge or closure boundary. |
| AC8 / SCN008: durable one-use owner | Pass, local behavior only | Current safe-recoveries/finalizer/apply-review tests exercise fresh and joined leases, standalone identity reuse, locks and consumed-record replay rejection. Original verify binding succeeded with the original logical run owner. |
| AC9 / SCN009: fail closed | Pass | Smoke #100 stopped intervention-bearing when approved implementation targets were absent from the bound allowlist; no scope bypass or historical success rewrite. Current unsafe-path/identity/budget regressions pass. |
| AC10 / SCN010: compatibility and portability | Incomplete | Current source suite preserves predecessor public discovery/status/bare recovery and existing budgets. Required consumer smoke is blocked by the approved-task/publication-scope syntax mismatch; no predecessor delivery claim. |
| AC11 / SCN011: host-enforced isolation | Partial | Retained genuine native tool proof and exact current source/candidate module hashes establish the unchanged host guard. New local subprocess parity regression accepts candidate receipts without weakening URL identity. Fresh consumer run did not reach review, so installed lifecycle acceptance remains unproved. |

FR1–FR8 map to these AC rows. FR2/FR7/FR8 are not claimed end-to-end complete while AC2/AC10/AC11 remain non-passing.

## Regression Obligations

No separate resolver regression identifiers exist. AC10 explicitly covers #369 loop detection, #372 bare one-shot recoveries[], public diagnostics and ownership/absence gates, passed-handoff settlement, pending CI, unchanged contribution-body stop, and exact-head CAS. The current suite passed these source contracts. No original #372 branch, spec ownership, history or failed evidence was modified or represented as delivered.

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T001 | Partial | Guard/replacement/empty-review source and local behavioral proof exist; fresh installed review completion remains unproved. |
| T002 | Locally verified, integration gap | Current owner/publication/mergeability/bot/post-merge tests pass. Actual implementation scope binding excludes unquoted approved task paths. |
| T003 | Complete for local regression layer | 1064 current tests passed; eleven approved scenarios correspond to eleven ACs. |
| T004 | Incomplete | Applicable local gates and retained host proof available; one authorized fresh smoke stopped implement without merge/closure. |

Unchecked task boxes in the approved package were not rewritten into completion.

## Architecture Assessment

The five installed checklists were applied inline without delegation.

- **SOLID 3/5:** Recovery and isolation modules separate owner/receipt mechanics from orchestration, with injected command/filesystem seams. Execute/deliver remain large. The provider repair reuses `resolvePluginRoot`/`resolvePluginController` rather than introducing a second resolver. The task-authoring/publication-parser boundary still disagrees on path syntax.
- **Security 4/5:** Candidate resolution occurs before remote commands; controller argv is not shell-interpolated. Exact module URL identity, immutable receipts, default-deny host interception, approved scope and human-review boundaries remain intact. The current stop is fail-closed, not a security bypass. Web auth, SQL, CORS and password storage are not applicable to this local CLI repair.
- **Performance 3/5:** The repair adds bounded startup resolution, no polling or retry allowance. Existing synchronous CLI inspection and full slice replacement remain overhead. Healthy workflow commands have no deadline; explicit cancellation/process-loss handling remains distinct. No performance benchmark is claimed.
- **Testability 4/5:** The new regression executes a real isolated candidate subprocess in clone cwd, rejects those receipts from the source module, accepts them from the selected candidate and checks byte preservation. It deliberately does not claim missing delivery proof as success. Current tests do not prevent the observed unquoted task-path integration gap.
- **Error handling 3/5:** Unresolved controllers fail before GitHub activity. Publication/review/ownership failures remain explicit. However, the scope parser returns successful spec-only authority instead of diagnosing that no implementation paths were extracted, leaving the worker to detect the mismatch. The failed worker correctly refuses to widen scope.

No source changes were made during this verification. Fixing this new integration boundary requires Main coordination; the one-shot experiment does not authorize a source/candidate repair, fixture amendment or remote replay.

## Test and BDD Results

Registered `npm test -- --runInBand`, cwd source `scripts/`, exit 0: **55 suites passed, one skipped; 1064 tests passed, two skipped; zero failures; no snapshots**. Expected skips remain the opt-in historical start-issue backfill exercise and Windows-only junction exercise on this host. Full output is embedded in the canonical artifact, `repository.tests` evidence.

SCN001–SCN011 are the behavioral contract. Jest behavior tests, retained host receipts and the actual smoke lifecycle provide evidence; no separate Cucumber runner or successful live coverage of unvisited stages is claimed.

## Exercise and Native Proof

Retained prior evidence is reused only with unchanged content hashes recorded in `.omp/sdlc/evidence/374-parity-final-preparation.json`:

- verify-code fixture: exit 0, 14 pass / 0 fail / 0 skipped.
- open-pr fixture: exit 0, 15 pass / 0 fail / 0 skipped.
- review-main fixture absent (prior exit 2). Prior disposable RPC fallback using exact workflow bytes stopped `review_scope_unproven` on missing assignment/receipt, exit 0, without remote writes/reviewers/handoffs. This is negative-path evidence only.
- Five affected bundles—execute, open-pr, review-main, verify-code, write-code—retain prior successful portable-validator evidence using unchanged temporary copies with WORKFLOW.md copied to SKILL.md. Direct validation originally rejected the repository's WORKFLOW.md naming; no source renaming was performed.
- `.omp/sdlc/evidence/native-builtin-proof/result.json`: passed, actual native bash/eval/task, no custom tool registrations, user_bash blocked, assigned read allowed, captured host result valid and uncontaminated. No native driver/model probes were rerun.
- Current source and candidate extension SHA256: `f1807cff9fae028cb34e10afd9c51cf8123f85b3fd57337dd80ae77301c00a6d`.
- Current source and candidate isolation SHA256: `e501f3e36343ead479053740e0531e4fd0ab44f99330f3a7502c1518dffcd829`.
- Retained source-isolation evidence covers forbidden path/URI/archive attempts and ordinary-session control; genuine native proof closes only the native-tool portion. None substitutes for successful current smoke delivery.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|---|---|---|
| Contract tests | Pass | Current runner exit 0; 1064 tests passed, two expected skips. |
| Fresh live smoke | Fail; required lifecycle evidence Incomplete | One queue100 invocation; stopped implement, no review/pre-merge/MERGED/CLOSED proof. |
| Skill inventory | Pass | Fresh exit 0: 43 items mapped, clean. |
| Plugin surface | Pass | Fresh exit 0: Plugin surface validation passed: repository. |
| Skill creator validation | Pass for unchanged bundles | Retained successful five-bundle adapter validation; all bundle bytes unchanged. |
| Skill exercises | Pass for exercised paths only | Retained verify-code/open-pr fixtures and review-main missing-proof fallback; hashes unchanged. |
| Prompt quality | Pass for unchanged workflow contracts | Explicit stage authority, no worker questions, immutable evidence and downstream handoff rules retained. New task-path interoperability finding is recorded separately, not suppressed. |
| Git hygiene | Pass | Fresh `git diff --check main...HEAD`, exit 0, no output. |

## Real Smoke Lifecycle Evidence

- Named experiment: #374 provider-parity repair; hypothesis that the explicit installed candidate controller accepts installed candidate review receipts without relaxing identity.
- Authorized fresh queue: [100] only. Spec publication PR #101 merged at `3da5090adfcd75f4cbdfd8dcfef17e07d45f0e30`; author proof confirms all four Approved blobs. This spec PR is not implementation-delivery proof.
- Provider baseline: #100 OPEN; closing PR nodes empty; `hasNextPage:false`.
- Full-history provider clone: `/private/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-vB04dl`.
- Smoke run: `ed5f2469-9dc0-4501-92c7-bc92d3addcb7`.
- Completed: start. Stopped: implement, `implementation_failed`, intervention true, next null. Controller exit 1; invocation-owned worker pane w2:p8J closed and checkpoint workers {}.
- Exact worker report: candidate bind passed but allowed only the four spec blobs; no implementation edits, tests, staging, commits or pushes performed.
- Approved tasks.md:21,32,44 uses unquoted `**File(s)**` values. `scripts/sdlc-safe-recoveries.mjs:739–765` extracts only backtick-delimited paths.
- Read-only call to candidate `inspectPublicationScope` against the retained clone reproduced the exact four-file allowlist, exit 0. It did not invoke a controller, provider, lease bind, mutation or repair.
- No review receipt acceptance was reached. No `.omp/sdlc/smoke-deliveries/100.json` exists. No new exact-head merged implementation PR or CLOSED issue evidence is claimed.
- Byte-preserved current run/handoff/owner/provenance and canonical artifact: `.omp/sdlc/evidence/374-parity-final-smoke100/`. Exact diagnosis: `diagnosis.json` there.

## Fixes Applied and Cleanup

None in this verification. The previously authorized provider repair is reviewed, not reimplemented. Failed smoke clone and immutable evidence are intentionally retained. No new temporary driver was created. Old failed evidence remains archived; canonical replacements represent this new invocation only.

## Remaining Issues

| Severity | Location | Finding | Disposition |
|---|---|---|---|
| High | `scripts/sdlc-safe-recoveries.mjs:739–765`; approved smoke tasks.md:21,32,44 | Unquoted approved task targets are omitted from publication authority; bind reports passed with only spec files and implementation cannot proceed. | Preserve stop; Main must coordinate any contract/source/fixture correction. No scope override or repeat invocation authorized. |
| High | AC2, AC10, AC11 / T004 | Repaired provider-parity hypothesis has local proof but no current successful installed review/delivery lifecycle. | Required gate remains non-passing; no new queue or same-queue replay. |

## Recommendation

**Not ready for delivery.** Finalize truthful Incomplete evidence through the owning candidate finalizer with the original #374 run ID. A non-pass finalizer handoff is the result, not permission to resume the original controller. Notify Main with the exact smoke100 stop and retained evidence. Do not manually commit/push a failed report, manufacture a pass, rewrite failed checkpoints, or start another experiment.
