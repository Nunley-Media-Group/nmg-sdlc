# Verification Report: Honor and resume selected issues from the empty /sdlc-execute picker

**Date**: 2026-08-23
**Issue**: #231
**Reviewer**: Codex
**Scope**: Implementation and live interaction verification against approved spec

---

## Executive Summary

Overall status is **Pass**. The implementation satisfies AC1–AC9, FR1–FR9, T001–T009, and SCN001–SCN014 without invoking the real mutating execute controller against this repository.

The real Herdr OMP 18.0.3 TUI was exercised in a disposable consumer project with the branch loaded through `--plugin-dir` and a non-mutating controller fixture. Selected chips, Other tokens, empty Continue, one-option interaction, packaged-command resolution, and OMP explicit-token expansion were observed at the actual UI boundary. The real `parseArgs` implementation was imported by the fixture for the normalized explicit-token smoke.

Two additional `/sdlc-execute` defects were found during smoke testing, added to the approved spec, fixed, and reverified:

1. the packaged file command referred to an unavailable working-directory-relative picker reference and could load stale released instructions;
2. OMP expanded `/sdlc-execute #902` to `/sdlc-execute pr://902`, which the released parser rejected.

The full repository suite passes 403 tests with one intentional environment-gated skip. Inventory and plugin-surface gates pass.

### Implementation Status: Pass

**Total Issues**: 0

---

## Issue Scope

- Active issue: #231
- Spec: `specs/231-honor-and-resume-selected-issues-from-the-empty-sdlc-execute-picker`
- Delivery: AC1–AC9; FR1–FR9; T001–T009; SCN001–SCN014
- Regression: issue #223 picker and explicit-list behavior; issue #208 eight-step review/fix lifecycle; issue #219 retained-worker safety

<!-- nmg-sdlc-issue-scope: {"issueNumber":231,"specPath":"specs/231-honor-and-resume-selected-issues-from-the-empty-sdlc-execute-picker","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010","SCN011","SCN012","SCN013","SCN014"]},"regression":{"acceptanceCriteria":["#223-AC2","#223-AC4","#208-AC1","#219-AC1"],"functionalRequirements":["#223-FR3","#223-FR4"],"scenarios":[]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1 | Pass | Real TUI selected #901 and #902; fixture log recorded `["#901","#902"]` in displayed order |
| AC2 | Pass | Space+Enter on first chip logged `["#901"]`; Down+Space+Enter on second logged `["#902"]` |
| AC3 | Pass | Enter with no selection produced an OMP `Cancelled` ask result, immediately reopened the same two-option picker, and added no controller log line |
| AC4 | Pass | Branch picker rendered `multi`, no Recommended marker, no Cancel chip, issue chips plus automatic Other; explicit arguments bypass the ask |
| AC5 | Pass | One authored option rendered successfully in OMP 18.0.3 with automatic Other; it remained unchecked until Space and logged only `["#901"]` after Enter |
| AC6 | Pass | Controller regression first stops on failed verify, persists the current issue and six-step prefix, then an empty-args resume starts implement → review1 → fix1 → review2 → fix2 → verify → deliver |
| AC7 | Pass | Null, unknown, forward, blocked/non-intervention, active-worker, and pane-close-failure cases start no remediation worker and preserve durable state |
| AC8 | Pass | Consumer-project transcript begins with the branch's complete `# Select specified issues` section; no local workflow file or GitHub lookup supplied picker behavior |
| AC9 | Pass | TUI rendered `/sdlc-execute pr://902`, invoked the fixture with literal `pr://902`, and the real branch `parseArgs` recorded `{ "tokens": ["pr://902"], "issues": [902] }` |

## Functional and Regression Verification

- `workflows/execute/references/selection.md`: one multi-select ask, up to four issue chips, no recommendation, no Cancel, empty/invalid re-ask, stable ordered union.
- `src/sdlc-commands.mjs`: appends the execute picker reference only when rendering the packaged execute command.
- `commands/sdlc-execute.md`: byte-for-byte generated surface contains both the compact entrypoint and picker section.
- `scripts/sdlc-execute.mjs`: accepts only `N`, `#N`, `issue://N`, and `pr://N`; unrelated schemes and nonnumeric URIs remain usage errors.
- `remediationCompletedSteps`: requires matching issue/step, a failed or intervention handoff, a same-or-earlier valid target, and an exact completed lifecycle prefix.
- `runExecute`: consumes remediation only on a later invocation with an idle/done retained worker, closes that pane, persists the truncated prefix, and resumes the normal worker loop.
- A two-issue regression proves #43 does not start while #42 is failed or rerunning; it starts only after remediated #42 completes deliver, and durable state then advances to #43 with an empty completion list.
- Passed retained handoffs, explicit eligibility gates, approved-spec checks, label rechecks, queue order, review/fix pairs, and exact delivery gate remain covered by the existing suite.

## Live Herdr OMP Smoke

| Field | Value |
|-------|-------|
| Runtime | OMP 18.0.3 in Herdr-managed sibling panes |
| Plugin source | Current branch via `--no-extensions --plugin-dir /Volumes/Fast Brick/source/repos/nmg-sdlc` |
| Project | Disposable `/tmp/nmg-sdlc-231-smoke.*` consumer fixture |
| Mutation policy | Fake `list-specified`/`run`; no real execute workers, GitHub mutations, PRs, or issue delivery |
| Controller boundary | Fixture logs argv; final explicit smoke imports real branch `parseArgs` |

Observed controller log sequence:

```json
["#901","#902"]
["#901"]
["#902"]
["#901"]
["#901","#902"]
["pr://902"]
{"tokens":["pr://902"],"issues":[902]}
```

Interpretation:

- first line: user selected both issue chips and pressed Enter;
- second and third: first-only and second-only interactions;
- fourth: exactly-one eligible issue interaction;
- fifth: first chip plus Other `902 901`, normalized to displayed-chip first, typed Other next, first occurrence deduplicated;
- sixth: pre-fix transport observation of OMP's literal `pr://902` argv;
- seventh: post-fix real parser normalization to issue 902.

Empty Continue was verified between the third and fourth recorded controller entries: OMP displayed `Cancelled`, the same ask reopened, and the log remained unchanged.

## Automated Verification

- Focused execute/command suite: **Pass** — 4 suites, 101 tests, 0 failures.
- Final full repository suite: **Pass** — 38 suites, 403 tests passed; 1 environment-gated test skipped; 0 failures.
- `node scripts/skill-inventory-audit.mjs --check`: **Pass** — 43 items mapped.
- `node scripts/verify-plugin-surface.mjs --root . --label repository`: **Pass**.
- `skill://skill-creator`: resolved and read before workflow edits. Its validator requires `SKILL.md` and is not applicable to repository `WORKFLOW.md` bundles; generated-command, inventory, plugin-surface, prompt-limit, full-suite, and live exercise gates cover this bundle.

## Findings Fixed During Verification

| Severity | Boundary | Finding | Fix |
|----------|----------|---------|-----|
| High | Packaged command | Consumer project could not resolve `references/selection.md` and loaded stale released picker instructions | Renderer embeds the installed selection section into `commands/sdlc-execute.md`; entrypoint points to the packaged section |
| High | Explicit fallback | OMP rewrote `#902` to `pr://902`; released parser rejected it | Parser narrowly normalizes numeric `issue://N` / `pr://N`; unrelated URIs remain rejected |
| Medium | One-issue interaction | Repository guidance suggested 2–4 authored options might require a compatibility choice | Live OMP 18.0.3 accepted one issue option plus automatic Other; no synthetic or Cancel option added |

## Remaining Issues

None.

## Recommendation

**Ready for PR.**
