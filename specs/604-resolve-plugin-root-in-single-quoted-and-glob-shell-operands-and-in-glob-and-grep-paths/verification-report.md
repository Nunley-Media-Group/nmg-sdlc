# Verification Report: Resolve plugin-root in single-quoted and glob shell operands and in Glob and Grep paths

**Date**: 2026-11-23
**Issue**: #604
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: 4833d192eb6231ea786c77f01ed15b5a05950433

---

## Executive Summary

The gate passed. All four acceptance criteria and all four functional requirements were verified in the review, which passed on source head `9b685050`. That review found three `info` notes and nothing above `info`. The pre-merge gate then ran at the queue head `4833d192`, with the default branch integrated and the version prepared:

- `repository.tests` passed: the full Jest suite ran because the selection fell back on `hooks/register.test.ts` (`fallback_path`).
- `repository.nmg-sdlc-smoke` passed: the provisioned smoke issue was delivered end to end, and every selected interactive surface was exercised live at this head.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 3 (all `info`)

---

## Issue Scope

- Active issue: #604
- Spec: `specs/604-resolve-plugin-root-in-single-quoted-and-glob-shell-operands-and-in-glob-and-grep-paths`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":604,"specPath":"specs/604-resolve-plugin-root-in-single-quoted-and-glob-shell-operands-and-in-glob-and-grep-paths","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/604.json`, generated 2026-11-23T20:22:52Z, at identity head `4833d192eb6231ea786c77f01ed15b5a05950433` with a clean tree.
- Tier: `pre-merge`. Ceiling: none.
- Coverage: declared 4, recorded 4, complete `true`; nothing missing, duplicated or unknown.
- Selection: mode `all`, reason `fallback_path` (fallback path `hooks/register.test.ts`), model `haiku` at effort `xhigh`, no rejection.
  - Surfaces selected: `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro`, `execute`, `status`, `verify-full`, `plugin-host`, `shared-references`, `project-steering`, `script-assets`, `ci`.
  - Required surfaces: `plugin-host`, `shared-references`, `project-steering`.

---

## Acceptance Criteria Verification

The evidence comes from the review record `.nmg-sdlc/verification/604-review.json`. That review was scoped and passed at `9b685050`, and its results were carried into the queue head. No criterion's tests mock the path under test.

| AC | Description | Status | Exercised | Evidence |
|----|-------------|--------|-----------|----------|
| AC1 | Single-quoted operands resolve | Pass | real entry point | `src/host-events.mjs:241-256` matches single-quoted segments and splices in a root that is safe inside single quotes. @SCN001 is in `scripts/__tests__/plugin-root-materialization.test.mjs`. The Bash hook applies it at `hooks/register.ts:868`. |
| AC2 | Glob operands still expand | Pass | real entry point | `materializedOperand` (`src/host-events.mjs:270-276`) quotes the root and leaves a glob tail unquoted. @SCN002 includes a `/bin/sh` expansion under a root that contains a space. |
| AC3 | Glob and Grep paths resolve | Pass | real entry point | `hooks/register.ts:835-861` forwards `materializePluginRootToolInput(e, $.plugin.root)` to both `next()` calls. The engine-level test in `hooks/register.test.ts:992-1010` passes under `claude plugin test` (66/66), and @SCN003 checks the helper and the handler forwarding. |
| AC4 | Existing rewrites are preserved | Pass | real entry point | @SCN004 and the `sdlc-commands.test.mjs` rewrite table pass. `execute-goal.test.mjs:122` still passes, and the Read handler is unchanged. |

| FR | Status | Evidence |
|----|--------|----------|
| FR1 | Pass | An apostrophe in the root becomes the close-escape-reopen sequence, and no other characters are added (`src/host-events.mjs:237, 248-251`). |
| FR2 | Pass | A glob tail stays unquoted after the quoted root (`src/host-events.mjs:274`). |
| FR3 | Pass | Glob and Grep `path` values are rewritten before the engine receives them (`hooks/register.ts:836, 849, 861`). |
| FR4 | Pass | Read paths, bare operands and double-quoted operands are unchanged. Commands without a placeholder return early (`src/host-events.mjs:232-235`). |

Every design path (DP1 to DP5) and every consumer row (C1 to C5) passed in the review.

---

## Architecture Review

| Area | Score (1-5) | Notes |
|------|-------------|-------|
| SOLID Principles | 5 | The materialization logic stays in `src/host-events.mjs`, which imports nothing from Node. The hooks module only applies it, folding it into its single untyped handler. |
| Security | 5 | Roots are quoted correctly in every context, including roots that contain an apostrophe or a space. Escaped quotes and backslashes are honored. No shell interpolation of untrusted values is added. |
| Performance | 5 | The rewrite is one linear scan per command, and inputs without a placeholder return early. |
| Testability | 4 | The scenario tests drive the real helpers, and a `/bin/sh` expansion test proves glob behavior. The end-to-end Glob/Grep forwarding test runs under `claude plugin test`, not the registered Jest gate (F2). |
| Error Handling | 4 | Other tools and inputs without a placeholder are returned unchanged. One pre-existing double-quote escape edge case is out of scope (F3). |

---

## Test Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/plugin-root-materialization.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/plugin-root-materialization.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/plugin-root-materialization.test.mjs`; engine-level proof in `hooks/register.test.ts` | Implemented |
| AC4 | `@SCN004` | `scripts/__tests__/plugin-root-materialization.test.mjs` | Implemented |

- Test-layer findings: none. Every added test implements a scenario (the only kept layer is `bdd`). `hooks/register.test.ts` extends the hooks module's own host test file rather than adding a test layer.
- Test execution: Pass. The details are under Test Results.

---

## Test Results

| Validation | Tier | Selection | Status | Evidence |
|------------|------|-----------|--------|----------|
| `repository.tests` | change | `{ provider: claude:haiku, reason: fallback_path, fallbackPath: hooks/register.test.ts, selectedCount: null }` | Passed | `npm test -- --runInBand` exited 0: 84 suites passed, 1 skipped; 2008 tests passed, 2 skipped; 998 s. Log: `.nmg-sdlc/verification/604/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | — | — | Passed | All six interactive surfaces were exercised live at this head, and smoke issue #365 was delivered (see below) |
| `repository.tests.full` | full | — | Skipped before merge | Runs only under `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | full | — | Skipped before merge | Runs only under `/sdlc-verify-full` |

**Gate Summary**: 2/2 applicable required validations passed; 0 failed; 0 incomplete.

### Environmental remediation

The first gate run at this head stopped before any test ran. The worktree had no `scripts/node_modules`, so `node_modules/.bin/jest` was not found (`MODULE_NOT_FOUND`). Under the deferral rule, the smoke gate was then recorded as `incomplete`. I ran `npm ci` in `scripts/`; `node_modules` is git-ignored and the tree stayed clean. I then reran the gate once with the source unchanged, and it passed. No code or steering was changed.

---

## Real Smoke Lifecycle Evidence

The `repository.nmg-sdlc-smoke` gate requires a head-bound record for each selected interactive surface. Each record below is under `.nmg-sdlc/smoke/surfaces/`, bound to head `4833d192…` with status `passed`.

| Surface | Command | Result |
|---------|---------|--------|
| `draft-issue` | `/sdlc-draft-issue <provision.need>` | Created smoke issue #365, "Add greeting_capitalize library helper" |
| `write-spec` | `/sdlc-write-spec #365` | #365 carries the `spec-created` label, and spec PR #366 ("docs: approve spec for #365") is merged |
| `onboard-project` | `/sdlc-onboard-project` | Found the repository already onboarded and recommended upgrade; the plan was approved with no file changes |
| `upgrade-project` | `/sdlc-upgrade-project` | `detect` found 7 items; I chose the smallest options, and `apply` wrote only `steering/test-layers.json` in the clone |
| `steering` | `/sdlc-steering` | Made a one-line edit to a snippet; `apply` and `validate` passed |
| `run-retro` | `/sdlc-run-retro` | Wrote `steering/retrospective.md` and the state file in the clone |

Execute delivery:

- The baseline recorded no closing PR for #365.
- `/sdlc-execute #365` ran headless in a fresh clone of `Nunley-Media-Group/nmg-sdlc-smoke`.
- Proof: PR #367 is `MERGED` at `headRefOid` `db096109f339b059dab61be7018df6952a4cf1f2`, and issue #365 is `CLOSED`.

### Coverage of #604's call sites

- In the onboard-project, steering, upgrade-project and write-spec sessions, every Bash and Read call resolved plugin paths to the `--plugin-dir` checkout.
- None of the live sessions made a Glob or Grep call with a `<plugin-root>` path, so the Glob/Grep path and the single-quoted/glob operand forms were not triggered live. Those forms are proven by @SCN001 to @SCN004 and the hooks-engine test.

### Observations from the live surfaces (outside #604's scope)

These are recorded for follow-up. None blocks this change.

- In `draft-issue` and `run-retro`, the model found packaged templates with a glob over `~/.claude/plugins/cache/*/nmg-sdlc/*` rather than through `<plugin-root>`. It read them from an older installed copy (4.7.0) instead of the `--plugin-dir` checkout. The rendered prompt for these workflows does not give the model a resolved root path or a literal token to type.
- In `write-spec`, `publish-approved-spec.mjs prepare` reported a spec directory that did not exist yet. The model ran `mkdir -p` and continued.
- In `upgrade-project` and `steering`, auto mode blocked one post-approval Bash call. In `steering`, the model rewrote the call and continued. In `upgrade-project`, the approved `apply` command was run through `!` inside the disposable smoke clone. Per the owner's standing note, that workaround is accepted when it stays inside the smoke clone.
- Claude Code redraws the TUI, so `tmux capture-pane -S -` keeps only the visible pane. The surface transcripts are partial, and the session JSONL files hold the full record.

---

## Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| — | — | — | None in the gate phase. The review-phase repair (commit `9b68505`) belongs to the implement stage. | — | — |

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| info | Documentation | `src/sdlc-prompt-snippets.mjs:258` | The JSDoc for `pluginPathsNote` still says "(Bash commands and Read paths)" (F1). | It is a comment only and has no effect on behavior. |
| info | Testability | `hooks/register.test.ts` | The engine-level Glob/Grep test runs under `claude plugin test`, not the registered Jest gate (F2). | The gate still covers the helper and the handler forwarding through @SCN003. |
| info | Error handling | `src/host-events.mjs` | Pre-existing: an escaped `\$NMG_SDLC_PLUGIN_ROOT` inside double quotes is still rewritten (F3). | The behavior predates this change, is unchanged from main, and is outside the spec. |

## Recommendation

Ready for PR.
