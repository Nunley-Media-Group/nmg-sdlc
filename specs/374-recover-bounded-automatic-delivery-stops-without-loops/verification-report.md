# Verification Report: Recover bounded automatic delivery stops without loops

**Date**: 2026-09-07
**Issue**: #374
**Reviewer**: Inline architecture-reviewer
**Scope**: Approved issue #374; candidate d27cc21b4e5a37a657d7caadad7d46f721187249

## Executive Summary

### Implementation Status: Incomplete

The current full suite passes, but the mandatory fresh smoke invocation failed at review1. The registered provider launched the source controller while reviewer sessions loaded the manager-installed candidate. Host receipts bind to the candidate's absolute isolation-module URL; the source controller rejects that identity. No successful smoke review, verification, exact-head merge, or issue closure is established. This is a plugin/runtime integration blocker, not an unrelated smoke application finding. No source repair, native-proof replay, smoke retry, checkpoint rewrite, or handoff fabrication was performed.

| Category | Score (1-5) |
|---|---:|
| Spec compliance | 3 |
| SOLID | 3 |
| Security | 4 |
| Performance | 3 |
| Testability | 4 |
| Error handling | 4 |
| Architecture average (five checklists) | 3.6 |
| Overall score (six categories) | 3.5 |

## Issue Scope

- Active issue: #374
- Spec: `specs/374-recover-bounded-automatic-delivery-stops-without-loops`
- Manifest: implicit single issue; no issue-scope.json exists or is required.
- Resolver: implicit_single_issue / singular_defect_scope; no gaps.
- Delivery: AC1–AC11; FR1–FR8; T001–T004; SCN001–SCN011.
- Separate resolver regression identifiers: none. Existing bounded recovery remains an explicit AC10 delivery obligation; predecessor ownership and historical evidence are unchanged.

<!-- nmg-sdlc-issue-scope: {"issueNumber":374,"specPath":"specs/374-recover-bounded-automatic-delivery-stops-without-loops","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10","AC11"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete; required smoke failed.
- PR evidence: No qualified PR-only pending marker. Missing live smoke proof is not a PR-only obligation.
- Durable owner binding passed before work: d89d8ee2-1964-467f-a325-d2dec8f8acb6, allowed publication path only this report.

## Deterministic Steering Artifact and Ceiling

Artifact: `.omp/sdlc/verification/374.json`, generated 2026-09-07T21:16:55.965Z.

- HEAD: d27cc21b4e5a37a657d7caadad7d46f721187249; initial tree clean.
- Steering hash: sha256:77451aa3ec3e063af3698d86ea86acfe0b69e4747b2458cd5030f2a0703884c6.
- Spec hash: sha256:a862d1bb0a9567f1be02d4045124d9230519b6554d695703086db7614f87a2c3.
- Coverage: declared 2, recorded 2, complete true; no missing, duplicate, or unknown records.
- Runner exit 1; recorded ceiling **Fail**. The report additionally remains **Incomplete** because required live runtime identity/evidence is invalid. Neither classification permits Pass or PR Evidence Pending.
- Manifest and registered product/tech/structure/verification descriptors loaded; project snippets and smoke extension reviewed. No legacy steering fallback.

Canonical invocation used the candidate sdlc-verify-steering.mjs with --project . --issue 374 --spec specs/374-recover-bounded-automatic-delivery-stops-without-loops --base main --controller-run-id d89d8ee2-1964-467f-a325-d2dec8f8acb6. Explicit environment: NMG_SDLC_PLUGIN_ROOT=/Users/rnunley/.omp/recovery/nmg-sdlc-374-candidate-d27cc21, NMG_SDLC_SMOKE_ISSUES=98, CI=true. Timeout 0; no unchanged retries.

## Acceptance Criteria Verification

| AC / Scenario | Status | Evidence |
|---|---|---|
| AC1 / SCN001: stop inventory | Pass | design.md:128–169 inventories ownership, controller, publication, review, CI, merge, closure, and forbidden classes. |
| AC2 / SCN002: bounded replacement | Incomplete | sdlc-execute.mjs:1581–1779 preserves assignments and originals, consumes one invalid_review_slice record before attempt-2; unit suite passes. Real installed/source review integration rejected valid candidate receipts, preventing completion. |
| AC3 / SCN003: empty/missing review | Pass | sdlc-review-main.mjs:56–85 fails review_artifact_missing/review_empty without synthetic findings; review-main and execute regressions pass. |
| AC4 / SCN004: report publication | Pass (local behavioral proof) | sdlc-safe-recoveries.mjs:618–712 checks owner, clean tree, exact upstream, subjects and allowed paths before one recovery push. Finalizer real-bare-remote regressions pass, preserving non-pass reports. This report is not claimed published before finalization. |
| AC5 / SCN005: mergeability | Pass (local behavioral proof) | sdlc-deliver.mjs reconcileMergeability uses real merge-tree/base/head/conflict inspection; sdlc-execute.mjs:856–906 preserves prior artifacts and invalidates all review/fix/verify gates. Deliver/execute regressions pass. |
| AC6 / SCN006: automation attribution | Pass | pr-delivery-state.mjs:207–225 distinguishes Bot/allowlisted authors from human/unattributed requests; pathless automatic review is automatic_review_unactionable. Classifier/delivery regressions pass. |
| AC7 / SCN007: exact post-merge reconciliation | Pass (local behavioral proof) | reconcilePostMerge in sdlc-deliver.mjs uses three read-only observations and one persisted authorized close, never merge replay; real smoke MERGED/CLOSED remains unproved. |
| AC8 / SCN008: durable one-use owner | Pass (local behavioral proof) | sdlc-safe-recoveries.mjs:418–599 reuses tuple ownership and CAS-persists consumption; real Git/lease regressions exercise fresh/joined leases, session churn, locks and publication replay rejection. |
| AC9 / SCN009: fail closed | Pass | Current smoke actually stops review_scope_unproven without inventing a pass. Scope, unsafe paths, identities, historical evidence and consumed budgets remain protected in the passing suite. |
| AC10 / SCN010: existing gates and portability | Incomplete | Source execute/status/public discovery regressions pass, including predecessor bounds. Source-versus-installed module URL identity prevents the required consumer gate; no predecessor delivery claim. |
| AC11 / SCN011: host isolation | Partial | src/sdlc-review-isolation.mjs:233–375 registers synchronous deny-all handlers and captures host message_end. Retained native proof and current unit tests establish blocking; current candidate smoke receipts show read-only activation. End-to-end receipt acceptance fails across the source/candidate roots. |

FR1–FR8 are covered by the corresponding AC rows; FR2/FR7/FR8 are not claimed end-to-end complete while AC2/AC10/AC11 remain non-passing.

## Regression Obligations

No separate regression identifiers are returned by the singular scope resolver. AC10 requires preservation of #369/#372 budgets, pending CI, unchanged contribution-body stops, exact-head CAS, stale ownership and passed-handoff settlement. The current full suite passes those source regressions; #372's historical approved files and failed evidence were not rewritten or represented as delivered.

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T001 | Partial | Host guard, review replacement, missing/empty behavior and tests exist; installed/source receipt integration is blocked. |
| T002 | Locally verified | Owner/publication/mergeability/bot/post-merge implementations and associated source tests pass. |
| T003 | Complete | Current full suite: 1062 passed, 2 expected skips, zero failures. Eleven scenarios map one-to-one to the eleven ACs. |
| T004 | Incomplete | Local gates and retained native proof available; current fresh smoke fails at review1 with no merge/closure evidence. |

The task checklist's unchecked boxes were not silently marked complete or rewritten.

## Architecture Assessment

All five required checklists were read and applied inline; no review delegation.

- **SOLID 3/5**: dedicated isolation and recovery modules keep enforcement separate, but execute/deliver remain large orchestration files. Functional injected command/Herdr seams support substitution. Absolute module-location identity couples the host reviewer and provider controller deployment roots; this is the blocking integration finding.
- **Security 4/5**: default-deny tool interception, assignment digests, append-only receipts, explicit argv, symlink-safe recovery storage, exact publication paths, and human-review protection are present. Identity mismatch fails closed rather than accepting untrusted proof. Web authentication, SQL, CORS and password storage checklists are not applicable to these local CLI changes.
- **Performance 3/5**: bounded replacement and post-merge observations, file-scoped snapshots, and no workflow deadline. Synchronous CLI Git/filesystem work and full step replacement have measurable overhead but do not introduce an unbounded retry allowance.
- **Testability 4/5**: command/filesystem/Herdr/sleep seams plus real local bare-remote tests cover observable state transitions. Passing source tests did not cover source-controller plus separately installed equivalent candidate receipts; the live smoke exposed that gap.
- **Error handling 4/5**: distinct missing/empty/unproven classifications; preservation of failed evidence and one-use records. Runtime identity failure remains explicit and intervention-bearing. No swallowed error is used to claim success.

## Test and BDD Results

Current registered command: npm test -- --runInBand in scripts/, exit 0. **55 suites passed, 1 skipped; 1062 tests passed, 2 skipped; zero failures; no snapshots.** Expected skips are the opt-in historical start-issue backfill exercise and Windows-only junction exercise on this host. Full captured output is embedded in .omp/sdlc/verification/374.json, repository.tests evidence.

SCN001–SCN011 correspond to AC1–AC11. Gherkin is the scenario contract; source behavioral Jest tests, retained native receipts and this fresh consumer invocation provide execution evidence rather than claiming a separate Cucumber step runner.

## Exercise Test Results

- verify-code deterministic fixture: exit 0, 14 pass / 0 fail / 0 skipped.
- open-pr deterministic fixture: exit 0, 15 pass / 0 fail / 0 skipped.
- review-main fixture: exit 2, fixture missing. Used disposable candidate exercise-omp.mjs RPC fallback against exact WORKFLOW.md bytes. Missing controller assignment/receipt stopped as review_scope_unproven; no reviewers, GitHub writes, commits, pushes, or handoffs. Exit 0. Disposable directory removed after recording evidence.
- Retained native-builtin-proof/result.json: passed, actual native bash/eval/task, no custom registrations, user_bash blocked, assigned read allowed, final result valid/uncontaminated. Module hashes match retained candidate-cutover evidence; driver not rerun.
- Retained source-isolation/probe-outcomes.json and receipts distinguish real traversal/absolute/HTTP/URI/archive read blocking and ordinary-session controls from custom-tool attempts. The later genuine native proof closes only the native-tool gap; neither historical artifact substitutes for current smoke success.

Current local records: .omp/sdlc/evidence/374-verify-local-gates.json. Installation parity: .omp/sdlc/evidence/374-fix2-candidate-cutover.json.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|---|---|---|
| Contract tests | Pass | Current registered exit 0; 1062 tests pass. |
| Fresh live smoke | Fail / runtime evidence Incomplete | Current registered execute exits 1 at #98 review1; no exact-head MERGED/CLOSED proof. |
| Skill inventory | Pass | Exit 0; 43 items mapped, clean. |
| Plugin surface | Pass | Exit 0; repository validation passed. |
| Skill creator validation | Pass with adapter documented | Direct validator exits 1 because it requires SKILL.md. Unchanged five bundle copies with WORKFLOW.md copied to SKILL.md pass validator, exit 0 each; no source renaming or content alteration. |
| Skill exercises | Pass for exercised paths | verify-code/open-pr fixtures; review-main missing-proof RPC fallback. This does not prove successful review integration. |
| Prompt quality | Pass for changed contracts | Explicit owner/scope prerequisites, non-pass paths, supported tool references, authority and evidence chain; no worker asks or history rewrites. Generated command mirrors checked by suite/surface gates. |
| Git hygiene | Pass | git diff --check main...HEAD exit 0, no output. |

## Real Smoke Lifecycle Evidence

- Registered provider only; fresh queue [98]. No authoring clone, #96 replay, manual provider write, or independent controller invocation.
- Retained full-history clone: /var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-hLvFw1.
- Baseline: #98 OPEN, closedByPullRequestsReferences empty, pagination complete.
- Smoke run id: a299cd8c-9468-4aa6-84b5-86b6da578a45.
- Completed stages: start, implement. Stopped stage: review1; reasonCode review_scope_unproven; intervention true; workers {} after invocation-owned review pane cleanup.
- No review1 handoff exists. Reviewer 1 captured genuine No findings; other receipts contain startup/partial read evidence. No terminal smoke delivery proof exists.
- Provider chose controller from request.projectRoot/scripts/sdlc-execute.mjs (steering/extensions/nmg-sdlc-smoke.mjs:300–308), therefore source checkout. Installed reviewer receipts name file:///Users/rnunley/.omp/recovery/nmg-sdlc-374-candidate-d27cc21/src/sdlc-review-isolation.mjs.
- Read-only diagnostic on the exact same reviewer-1 assignment and receipt: source inspectReviewReceipts returns valid:false/review_scope_unproven; candidate inspectReviewReceipts returns valid:true, contaminated:false and captured No findings. No artifact alteration or live driver rerun. Evidence: .omp/sdlc/evidence/374-verify-smoke-diagnosis.json.

## Fixes Applied

None. Candidate source remains unchanged. Disposable validator/exercise artifacts were removed; all failed smoke and retained native evidence remain intact.

## Remaining Issues

| Severity | Location | Finding | Reason not repaired here |
|---|---|---|---|
| High | steering/extensions/nmg-sdlc-smoke.mjs:300; src/sdlc-review-isolation.mjs:199 | Source controller cannot accept installed candidate receipt module identity even for equivalent reviewed modules. Fresh required smoke stops before review completion. | Any source repair requires Main's current candidate coordination and invalidates affected evidence. No peer coordinator is registered in this worker's hub roster; do not weaken identity checks, alter receipts, or replay the reserved smoke invocation. |

## Recommendation

**Not ready for delivery.** Preserve this invocation's failure and exact candidate identity. Coordinate a source/candidate controller identity repair with Main before any new registered smoke experiment. Owning finalizer must emit the truthful non-passing handoff; no Pass or PR Evidence Pending marker is authorized.
