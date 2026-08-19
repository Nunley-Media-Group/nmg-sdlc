# Verification Report: Fix Canonical Umbrella Rejection of Issue Scope Manifests

**Date**: 2026-08-14
**Issue**: #173
**Reviewer**: Codex
**Scope**: Defect-fix verification against the approved specification

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (blast radius) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **5.0** |

### Implementation Status: Pass

**Total Issues**: 0

The installed 2.0.8 helper reproduced the defect against PathCast parent #108 with `default_spec_invalid` and an `unexpected_spec_entry` gap for `issue-scope.json`. The fixed source classified the same refreshed default commit and spec tree as `canonical` with zero gaps. The implementation adds one exact optional filename, retains complete Git-tree identity, and leaves semantic manifest validation in `issue-spec-scope.mjs`.

---

## Issue Scope

- Active issue: #173
- Spec: `specs/bug-fix-canonical-umbrella-rejection-of-issue-scope-manifests`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN173001, SCN173002, SCN173003, SCN173004, SCN173005]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":173,"specPath":"specs/bug-fix-canonical-umbrella-rejection-of-issue-scope-manifests","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN173001","SCN173002","SCN173003","SCN173004","SCN173005"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Accept lifecycle scope manifests in parent, publication, and audit modes. | Pass | `scripts/umbrella-spec-status.mjs:27`; `scripts/__tests__/umbrella-spec-status.test.mjs:132` |
| AC2 | Preserve exact identity when only manifest bytes differ. | Pass | `scripts/__tests__/umbrella-spec-status.test.mjs:182`; distinct source/default trees produce `divergent`. |
| AC3 | Preserve strict rejection for missing, unknown, unsafe, symlink, directory, and unsupported entries. | Pass | Manifest symlink, directory, and Gitlink/non-blob regressions at `scripts/__tests__/umbrella-spec-status.test.mjs:353`, `:369`, and `:385`, plus existing missing/unknown/traversal coverage; all pass. |
| AC4 | Keep semantic JSON validation in the scope resolver. | Pass | Opaque invalid JSON remains canonical at `scripts/__tests__/umbrella-spec-status.test.mjs:155`; `issue-spec-scope.test.mjs` remains green. |
| AC5 | Prove the real PathCast regression and no-mutation boundary. | Pass | PathCast #108 at `45d9341c6dc0a7bec3e13c4ff6172fffde2f1002` returns `canonical`, tree `cd7323c95dc7deb094ea2de88a137f0dcc5d0a28`, with worktree/index/branch/local refs/remote heads and tags/GitHub issue evidence unchanged. |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Recognize the scope manifest. | Complete | Added only `issue-scope.json` to `OPTIONAL_SPEC_FILES`. |
| T002 | Add classifier regressions. | Complete | Three new behavior assertions failed before the fix and pass afterward; manifest-symlink protection also passes. |
| T003 | Verify source and real consumer. | Complete | Focused suite, full suite, steering gates, and live PathCast proof pass. |

---

## Regression Obligations

No separately mapped historical regression obligations exist for this singular defect spec. The active regression scenarios preserve the adjacent #159 and #157 classifier contracts through the unchanged full test suite.

---

## Architecture Assessment

This defect uses the narrowed blast-radius review required for a minimal fix.

| Question | Result |
|----------|--------|
| What callers share the path? | Parent, publication, and audit modes all use `validateTreeEntries()`; accepting the manifest in all three is intentional and directly tested. |
| Does the fix alter a public signature or result schema? | No. One previously invalid lifecycle-owned tree shape now reaches the existing status classifier; arguments, result fields, and other diagnostics are unchanged. |
| Could it silently drop or reinterpret data? | No. The complete Git tree remains the identity, so raw manifest bytes participate in equality and divergence decisions. |
| Is the diff minimal? | Yes. Runtime behavior changes by one allowlist entry; remaining changes are approved specs and deterministic regression coverage. |

### Architecture Scores

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Existing responsibility separation is preserved; no new abstraction is introduced. |
| Security | 5 | Exact filename allowlisting, blob checks, symlink rejection, and normalized path validation remain intact. |
| Performance | 5 | One additional constant-time `Set` membership option adds no meaningful work or I/O. |
| Testability | 5 | Isolated temporary Git fixtures cover every affected mode and the negative boundaries deterministically. |
| Error Handling | 5 | Stable path-specific failures remain unchanged for every non-recognized or unsafe tree shape. |

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Executable Mapping | Passes |
|---------------------|--------------|--------------------|--------|
| AC1 / SCN173001 | Yes | Lifecycle-sidecar parent/publication/audit Jest test | Yes |
| AC2 / SCN173002 | Yes | Manifest-only tree-divergence Jest test | Yes |
| AC3 / SCN173003 | Yes | Missing, unknown, traversal, object, and symlink Jest tests | Yes |
| AC4 / SCN173004 | Yes | Opaque-manifest Jest test plus scope-resolver suite | Yes |
| AC5 / SCN173005 | Yes | Live PathCast source-helper exercise with before/after state checks | Yes |

### Coverage Summary

- Feature files: 1 file, 5 stable `@SCN...` scenarios, all tagged `@regression`
- Step definitions: Implemented as deterministic Jest contract tests; this repository has no separate Gherkin runtime
- Focused tests: 27/27 passed
- Full repository tests: 393 passed; 12 tests in 3 pre-existing opt-in agent exercise suites skipped as designed
- Unexpected skips: 0

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `cd scripts && npm test`: 35 suites passed, 393 tests passed, exit 0. |
| Codex compatibility | Pass | `node scripts/codex-compatibility-check.mjs`: passed, exit 0. |
| Active plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed, exit 0. |
| Release metadata | Pass | `VERSION` and `.codex-plugin/plugin.json` both declare `2.0.9`; `CHANGELOG.md` records the matching defect fix. |
| Git hygiene | Pass | `node --check scripts/umbrella-spec-status.mjs` and `git diff --check`: exit 0. |

**Gate Summary**: 5/5 applicable gates passed, 0 failed, 0 incomplete. The non-applicable skill-edit gates were not required; the inventory audit was also run defensively and reported 463 mapped items clean.

---

## Reproduction and Fix Evidence

| Boundary | Before | After |
|----------|--------|-------|
| Focused regression | 3 new assertions failed; 22 existing safeguards passed. | 27/27 final assertions passed, including the verification-added directory and Gitlink boundaries. |
| Real PathCast #108 | Installed 2.0.8: `unverifiable`, `default_spec_invalid`, `unexpected_spec_entry:.../issue-scope.json`. | Fixed source: `canonical`, `default_tree_and_marker_present`, zero gaps. |
| PathCast local state | Captured before helper execution. | Worktree, index tree `3a7133dbad658b958c22df1e55f40d37992124b5`, branch `main`, and local refs unchanged. |
| PathCast remote/GitHub state | Remote heads/tags and issue #108 hashes captured before execution. | Remote heads/tags digest `e4263a1360d641459dc27c19fa2ab68650e2a6a28f831817cf25775bfde97143` and issue digest `0d3d72c25d5e06cf41497dd2765408b2fb032375d6da5c916298c9c77175c4ec` unchanged. |

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| High | Contract compatibility | `scripts/umbrella-spec-status.mjs:27` | Canonical validation rejected the lifecycle-required `issue-scope.json`. | Added the exact filename to the optional recognized regular-blob set and retained full-tree comparison. | direct |
| Medium | Test coverage | `scripts/__tests__/umbrella-spec-status.test.mjs:369` | Initial regression coverage did not directly exercise the AC3 directory and unsupported-object branches. | Added isolated directory and Gitlink/non-blob fixtures, then reran focused and full suites. | direct |

---

## Remaining Issues

None.

---

## Positive Observations

- The existing required-versus-optional set split made the production fix genuinely one line.
- Full Git-tree object identity automatically preserves manifest-byte differences without custom normalization.
- The fixture demonstrated a true red-to-green regression while 22 pre-existing safety tests stayed green before the fix.
- Installed-cache failure and source-tree success remain clearly separated; release/install proof is still pending delivery.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/umbrella-spec-status.mjs` | 0 | Minimal exact allowlist correction. |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | 0 | Deterministic acceptance, identity, ownership-boundary, and symlink coverage. |
| `specs/bug-fix-canonical-umbrella-rejection-of-issue-scope-manifests/requirements.md` | 0 | Five testable ACs with narrow scope. |
| `specs/bug-fix-canonical-umbrella-rejection-of-issue-scope-manifests/design.md` | 0 | Root cause and responsibility boundary match the implementation. |
| `specs/bug-fix-canonical-umbrella-rejection-of-issue-scope-manifests/tasks.md` | 0 | All three delivery tasks complete with evidence. |
| `specs/bug-fix-canonical-umbrella-rejection-of-issue-scope-manifests/feature.gherkin` | 0 | Five stable, regression-tagged scenarios map one-to-one to ACs. |

---

## Recommendation

**Ready for PR.** Local source verification is complete with no remaining findings. Published-release and installed-cache proof must follow the protected delivery workflow and must not be inferred from this source-only pass.
