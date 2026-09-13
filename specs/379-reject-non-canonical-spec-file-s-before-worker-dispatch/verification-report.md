# Verification Report: Reject non-canonical spec File(s) before worker dispatch

**Date**: 2026-09-13
**Issue**: #379
**Reviewer**: Inline architecture-reviewer / verify-code owner
**Scope**: Implementation verification at `9a2b266413f85fcc0d10a6a207a753a9a280b6c6`

## Executive Summary

### Implementation Status: Pass

The recovery-store contention defect is fixed by the pushed real-owner regression and owner-conditional lock cleanup integrated through `c3ad48c`. The terminal smoke tombstone remains anchored to outer head `765b5b94721f0c58cd8991cb812b8c1015ce4634`; exact-head verification at `9a2b266413f85fcc0d10a6a207a753a9a280b6c6` proved stored-head ancestry, validated every intervening changed path against the narrow #379 provider/test/spec/changelog allowlist, preserved the original proof identity, recorded the current validation head separately, and revalidated PR #112 as MERGED at the retained exact head with issue #109 CLOSED. No smoke issue, clone, queue, or nested execute was created or rerun.

| Category | Score (1–5) |
|---|---:|
| Spec compliance | 5 |
| SOLID | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error handling | 5 |
| Architecture average (five checklists) | 4.6 |
| Overall average (six categories) | 4.7 |

## Issue Scope

- Active issue: #379.
- Spec: `specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch`.
- Manifest: implicit single issue; no issue-scope.json.
- Resolver: `implicit_single_issue`.
- Delivery: AC1–AC7; FR1–FR10; T001–T005; SCN001–SCN017.
- Separate regression identifiers: none.
- All four active specification files declare singular issue #379 and Approved.

<!-- nmg-sdlc-issue-scope: {"issueNumber":379,"specPath":"specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014","SCN015","SCN016","SCN017"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass.
- PR evidence: Not required for #379 verification readiness.
- Retained smoke delivery: exact remote proof revalidated for issue #109 and PR #112 without a new smoke invocation.

## Deterministic Steering Artifact and Ceiling

`.omp/sdlc/verification/379.json` was generated at exact head `9a2b266413f85fcc0d10a6a207a753a9a280b6c6`. Coverage is declared 2, recorded 2, complete true, with no ceiling. Both required results passed:

- `repository.tests`: passed at the exact head.
- `repository.nmg-sdlc-smoke`: passed by terminal-proof replay. Evidence records original outer head `765b5b94721f0c58cd8991cb812b8c1015ce4634`, current validation head `9a2b266413f85fcc0d10a6a207a753a9a280b6c6`, the complete seven-path intervening diff, retained nested run `85bad261-c3e2-4895-a2f9-a52a28a4decd`, issue #109, PR #112, and exact accepted head `044365a7e7c94d2d7e048b780c2f9968821b0d93`.

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | Execute and publication regressions prove invalid delivery File(s) fail before dispatch or publication with located `publication_scope_unproven` diagnostics. |
| AC2 | Pass | Safe-recovery parser regressions preserve canonical literal authorization. |
| AC3 | Pass | Bounded glob/directory expansion and empty-expansion rejection pass in the full suite. |
| AC4 | Pass | Workflow/template contracts, README, skill inventory, and plugin-surface validation agree on the canonical grammar. |
| AC5 | Pass | Full suite preserves valid declarations, annotations, path boundaries, publication ownership, and existing behavior. |
| AC6 | Pass | Upgrade regressions cover canonical rewrite, unsafe findings, projected legacy destinations, CRLF, and stale plans. |
| AC7 | Pass | `createSmokeRecoveryStore.write` keeps a real paused owner lock through two losing contenders and permits the next write only after owner release. Terminal proof advances only across stored-head ancestry and the exact approved path set, rechecks those facts on same-head replay, rejects non-ancestor/controller/delivery/workflow/consumer/tampered-history cases, preserves original identity/proof, and revalidates immutable remote MERGED/CLOSED evidence without executing smoke. |

## Task Completion

| Task | Status | Evidence |
|---|---|---|
| T001 | Complete | Shared parser, diagnostics, and bounded expansion behavior are implemented and passing. |
| T002 | Complete | Publish and execute preflight gates are implemented and passing. |
| T003 | Complete | Authoring contract, public docs, templates, and upgrade rewrite are present; inventory and plugin surface are clean. |
| T004 | Complete | Parser, execute, publish, upgrade, and current-spec regressions pass. |
| T005 | Complete | Exact retained recovery, real lock contention, bounded terminal head advancement, repeated replay, tampered history/path rejection, and remote terminal proof all pass. |

## Architecture Assessment

- **SOLID 4/5:** Recovery storage and provider command execution remain injectable. The provider is large, but the exceptional #379 head-advance authority is isolated in one validator and one immutable path contract.
- **Security 5/5:** Lock removal requires acquisition ownership. Terminal advancement is default-deny, requires exact issue/spec/validation/config/queue identity, Git ancestry, a complete NUL-delimited path set, and fresh remote exact-head closure proof on every replay.
- **Performance 4/5:** Terminal replay adds two bounded local Git checks and one existing bounded GitHub proof query. No clone, queue, or nested controller runs.
- **Testability 5/5:** Real subprocess contention exercises paused serialization, two losing writers, owner release, and a subsequent successful write. Provider tests cover positive advancement, repeated same-head validation, non-ancestor history, forbidden paths, and post-persistence tampering.
- **Error handling 5/5:** Environmental ancestry/diff failures remain Incomplete; contract mismatches fail closed; malformed/empty path output is rejected; failed remote or persistence operations cannot become Pass.

## Test and BDD Results

- Exact focused owner-lock regression: passed, 1 test selected.
- Terminal-proof focused regressions: passed, 8 tests selected.
- Complete smoke-provider suite: passed, 70/70 tests.
- Full registered suite: 55 suites passed, one expected suite skipped; 1157 tests passed, two expected tests skipped; zero failures.
- Exact-head deterministic `repository.tests`: exit 0.
- BDD: SCN001–SCN017 cover AC1–AC7, including owner lock contention, bounded provider-fix head advancement, repeated replay, and tampered history/path rejection.
- Current-spec validator: passed for 75 genuine issue specs, 16 required archive entries, 16 rewrite capabilities, and 16 active workflow mappings.

## Exercise Test Results

The exact-head project provider was exercised by `sdlc-verify-steering.mjs` using the installed candidate. It replayed the existing terminal tombstone only. Evidence contains the stored-head ancestry check, complete allowed changed-path output, terminal identity, and live GitHub exact PR/head/MERGED plus issue CLOSED result. It contains no clone or `sdlc-execute run` command. No disposable fixture or replacement smoke issue was created. Generic `skill-exercise-runner` fixtures do not exist for `write-spec` or `upgrade-project`; this remediation did not modify those workflow bundles.

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|---|---|---|
| Contract tests | Pass | Exact-head deterministic command exit 0; full suite 55 passed suites and 1157 passed tests. |
| Live smoke | Pass | Existing terminal proof only: original head ancestry and all seven intervening paths validated; PR #112 remotely MERGED at `044365a7e7c94d2d7e048b780c2f9968821b0d93`; issue #109 CLOSED. |
| Skill inventory | Pass | 43 items mapped; clean. |
| OMP plugin surface | Pass | Repository plugin surface validation passed. |
| Skill exercise | Not applicable to remediation delta | No workflow bundle changed after `c3ad48c`; exact provider behavior was exercised by the required deterministic steering runner. |
| Prompt quality | Pass | Existing workflow contracts remain unchanged by this remediation. |
| Git hygiene | Pass | `git diff --check main...HEAD` exited 0; branch and upstream were equal before report publication. |
| Product safety review | Pass | Owner-safe locking and per-replay bounded terminal advancement are implemented and regression-covered. |

**Gate Summary**: all applicable required gates passed; deterministic coverage complete with no ceiling.

## Fixes Applied

| Severity | Category | Location | Original issue | Fix | Routing |
|---|---|---|---|---|---|
| Critical | Security / error handling | `steering/extensions/nmg-sdlc-smoke.mjs` | A losing writer could unlink the active writer's lock. | Integrated pushed real-owner lock cleanup and paused-serialization contention regression through `c3ad48c`. | direct |
| High | Verification identity | `steering/extensions/nmg-sdlc-smoke.mjs` | The retained terminal tombstone was bound to pre-fix outer head `765b5b9`. | Added narrow #379 stored-head ancestry and complete path validation, fresh remote proof on every replay, preserved original audit identity, and separate current validation identity. | direct |
| High | Testing | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | A recorded validation identity could become mistaken for replay authority. | Added repeated same-head validation plus post-persistence ancestry and path-tamper rejection. | direct |

## Remaining Issues

None within the approved #379 scope.

## Recommendation

**Ready for delivery.** Exact-head local, deterministic steering, retained smoke, architecture, and acceptance evidence pass. The verify finalizer may publish this report and write the controller-owned `379-verify.json` handoff.
