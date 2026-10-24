# Verification Report: Fix write-spec stopping silently after a spec merge that outlasts the Bash timeout

**Date**: 2026-10-24
**Issue**: #489
**Reviewer**: Claude Code (architecture-reviewer, inline)
**Scope**: Implementation verification against spec
**Verification head**: fec99033582198bb1c6ede34d69074fcc5e45547

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.8 |

### Implementation Status: Pass
**Total Issues**: 1 (low, outside AC scope, owned by delivery)

All nine acceptance criteria are implemented and have test coverage. Both registered steering validations (`repository.tests` and `repository.nmg-sdlc-smoke`) passed at the verification head, with complete coverage (2 declared, 2 recorded) and no ceiling.

---

## Issue Scope

- Active issue: #489
- Spec: `specs/489-fix-write-spec-stopping-silently-after-a-spec-merge-that-outlasts-the-bash-timeout`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7]; tasks [T001, T002, T003, T004, T005, T006]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":489,"specPath":"specs/489-fix-write-spec-stopping-silently-after-a-spec-merge-that-outlasts-the-bash-timeout","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7"],"tasks":["T001","T002","T003","T004","T005","T006"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --project . --issue 489 --spec specs/489-… --base main --controller-run-id 75e557b4-0571-4ad3-a3de-e2b409f57c41` exited 0 and wrote `.nmg-sdlc/verification/489.json`:

- `ok: true`, `ceiling: null`
- `coverage`: declared 2, recorded 2, complete true, missing/duplicate/unknown none
- Identity: head `fec99033582198bb1c6ede34d69074fcc5e45547`, tree clean, specHash `sha256:d1bd8bc8…396d`, steeringHash `sha256:d29e9432…0f27`

| Validation | Provider | Required | Result |
|------------|----------|----------|--------|
| `repository.tests` | builtin.command (`npm test -- --runInBand` in `scripts/`) | yes | passed: 51 suites passed and 1 skipped; 1098 tests passed and 2 skipped (1100 total) |
| `repository.nmg-sdlc-smoke` | project extension | yes | passed: "nmg-sdlc-smoke delivered #237" |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Merged publication recognized from helper result, whatever the command spelling | Pass | `src/host-events.mjs`: `writeSpecMergeIssue` (regex on `publish-approved-spec.mjs merge … --issue N`, any quoting or root spelling), `writeSpecMergeResult`, `writeSpecPublication`. `hooks/register.ts` `recordPublication` dedupes by tool-use id and issue. Tests: "a merge quoted differently from the verbatim command submits one Continue prompt", plus the `sdlc-commands.test.mjs` case "recognizes the merge command by its --issue, whatever its spelling" |
| AC2 | Merge helper reports `issue` and `dir` in every `merged: true` result | Pass | `scripts/publish-approved-spec.mjs` `mergeSpec`: the `default_checkout_failed`, `spec_created_label_failed`, and `ok` results now carry `issue: issueN, dir`. Covered by `scripts/__tests__/publish-approved-spec.test.mjs` |
| AC3 | Session returns to the picker in plan mode | Pass | `turn.complete` handler, then `submitContinuation`, then `submitInPlanMode` (runs `/plan` and submits the rendered continuation with `--published`). Tests: "a merged publication submits one plan-mode Continue prompt after the turn ends" |
| AC4 | An unsubmitted continuation stays pending, shows a toast, and is retried | Pass | `submitContinuation` wraps everything in try/catch. A non-empty box, headless session, render failure, or `/plan` failure keeps `pending` true and shows `pendingContinuationNotice(published)`, which names `#N`. Tests: "a draft in the prompt box keeps the continuation pending…" and "a render failure keeps the Continue pending, names the issue, and submits on a later empty turn end" |
| AC5 | Non-publication Bash calls are not recorded | Pass | `writeSpecMergeResult` requires a sole JSON object, `merged: true`, a positive `pr` and `issue`, and a `dir` whose leading number equals `issue`. `writeSpecPublication` requires the `--issue` to match. Background recognition runs only while a merge is outstanding, and only for that issue. Tests: "unrelated merged JSON schedules nothing, and another issue leaves a backgrounded merge outstanding", and "accepts only a sole merged JSON object whose dir leads with its issue" |
| AC6 | Finished and explicit-number behavior preserved | Pass | Existing write-spec Finished tests all pass (approves once, non-Finished never approves, nudge then warn, interrupted). The live smoke provisioning ran `/sdlc-write-spec 237` with this checkout and merged spec PR #238 |
| AC7 | Loop continues until Finished | Pass | Each recorded publication sets `pending`, and each continuation carries the full `published[]`. Test: "after a Finished selection no continuation follows the last publication" |
| AC8 | A background merge is recognized when it completes | Pass | `writeSpec.backgrounded` records the issue when the merge result carries `backgroundTaskId`. A later Bash stdout or Read `file.content` is checked by `recordBackgrounded`, which records the publication once and clears the entry. The session reset clears the set. Tests: "a backgrounded merge records its publication once, when its result is read back" and "a backgrounded merge is also recognized from a Read of its output" |
| AC9 | Workflow runs the merge in the background and waits without a timeout | Pass | `workflows/write-spec/WORKFLOW.md` step 4 and `references/publish.md` say to use `run_in_background: true`, wait for the completion notification with no timeout, polling, or stall rule, then read the full output. Contract test: "runs the merge step in the background and waits for its completion without a timeout". Live: in the smoke provisioning transcript (session `721e5d9a-…`), the merge Bash call ran with `run_in_background: true` and returned `backgroundTaskId: bfqfedxy1` |

### Task Completion

| Task | Status | Evidence |
|------|--------|----------|
| T001 | Done | `scripts/publish-approved-spec.mjs` result fields |
| T002 | Done | `src/host-events.mjs`, `src/host-events.d.mts`, `src/sdlc-commands.mjs` re-exports |
| T003 | Done | `hooks/register.ts` backgrounded set, Read hook, hardened `submitContinuation` |
| T004 | Done | `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md`, README |
| T005 | Done | `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs` |
| T006 | Done | `hooks/register.test.ts`: 6 new cases in "write-spec publication recognition" |

---

## Architecture Review

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | Classification stays in Node-free `src/host-events.mjs`. The hooks module only tracks state and wires events. `recordPublication` and `recordBackgrounded` each have one job |
| Security | 5 | No shell interpolation was added. Recognition is gated on structured JSON and an issue that agrees across command, `issue`, and `dir`. Unrelated merged JSON is ignored unless a merge for that issue is outstanding |
| Performance | 5 | Read and Bash post-processing is O(1) and skipped entirely when no merge is backgrounded |
| Testability | 5 | Pure helpers are unit-tested, and host-kit tests drive the Bash, Read, and turn.complete paths deterministically |
| Error Handling | 4 | Any host-call failure keeps the continuation pending and shows a toast. A merge result consumed through a tool other than Bash or Read (for example a task-output tool) would not be recognized, though the spec limits the requirement to Bash and Read |

---

## Test Results

| Command | Result |
|---------|--------|
| `cd scripts && npm test -- --runInBand` (registered `repository.tests`) | Exit 0. 51 suites passed and 1 skipped; 1098 tests passed and 2 skipped |
| `claude plugin test .` (hooks module, `hooks/register.test.ts`) | Exit 0. 26 passed, 0 failed |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Exit 0 |
| `node scripts/skill-inventory-audit.mjs --check` | Exit 0 |
| `node scripts/skill-exercise-runner.mjs --skill write-spec` | 14 passed, 0 failed, 0 skipped |
| `git diff --check main...HEAD` | Exit 0 |

The TypeScript typecheck was not run: `tsc` is not installed locally, and it is not a registered gate.

### Test Coverage

- BDD scenarios: 9/9 acceptance criteria covered by `feature.gherkin`
- Step definitions: Contract tests (Jest) and hooks-module host-kit tests
- Test execution: Pass

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests | Pass | `repository.tests` passed at the verification head |
| Live smoke project | Pass | `repository.nmg-sdlc-smoke`: provisioned smoke issue #237 (spec PR #238 MERGED) through the real draft-issue and write-spec workflows, then `sdlc-execute run #237` delivered PR #239 MERGED at `d2071476c39e6df5d5ea3df7fbea400a5aadf3e8` and issue #237 CLOSED |
| Skill inventory | Pass | `skill-inventory-audit.mjs --check` exit 0 |
| Claude Code plugin surface | Pass | `verify-plugin-surface.mjs` exit 0 |
| Skill creator validation | Pass | No skill-bundled edits in this verification. Bundles validated by the surface and inventory checks |
| Skill exercise | Pass | write-spec fixture: 14 passed, 0 failed |
| Prompt quality | Pass | The WORKFLOW step 4 instruction is unambiguous: background, wait for notification, read, then act. Success and failure branches are kept |
| Git hygiene | Pass | `git diff --check` exit 0 |

**Gate Summary**: 8/8 passed, 0 failed, 0 incomplete

### Real Smoke Lifecycle Evidence

The `repository.nmg-sdlc-smoke` gate is preserved and passed. The provisioning pane loaded this checkout through `--plugin-dir` and ran `/sdlc-write-spec 237`. The publish merge ran in the background, as the new workflow instructions require, and spec PR #238 merged. The provider ends provisioning on GitHub publication evidence, so the transcript stops at the background completion notification. The hooks-module Continue path after that read is therefore proven by host-kit tests, not by this live run. Execute then delivered #237 end to end.

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None required | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | delivery hygiene | `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json` | Earlier delivery attempts bumped the version twice (4.3.0 → 4.3.2) and left two released headings, `[4.3.1]` and `[4.3.2]`, that both list the #489 fix. A single bug should be one patch bump | Outside the verify publication scope, which can write only `verification-report.md`. Version and changelog synchronization belong to the delivery (open-pr) stage. No acceptance criterion is affected |

## Recommendation

Ready for PR. Delivery should reconcile the duplicate version bump and changelog entry when it prepares the release commit.
