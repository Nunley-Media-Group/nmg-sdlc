# Verification Report: Prompt-snippet registry for command and worker composition

**Date**: 2026-08-24
**Issue**: #213
**Reviewer**: Codex
**Scope**: Implementation verification against the approved specification

## Executive Summary

| Category | Score (1-5) |
|---|---:|
| Spec Compliance | 4 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Fail

Registry, provenance, fail-closed composition, native-plan rewriting, byte ceilings, and local compatibility tests pass. The live attempt advanced substantially: actual draft workflows produced issues #11 and #12, and actual write-spec workflows produced merged specification PRs #13 and #14 with `spec-created` on both issues. The one required `/sdlc-execute #11 #12` invocation then failed at issue #11 `start` with persisted `reasonCode: pane_split_failed`. No delivery PR exists and both issues remain open. The authoritative two-issue convergence gate is therefore unmet.

## Issue Scope

- Active issue: #213
- Spec: `specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition`
- Delivery: AC [AC1, AC2, AC3, AC4]; FR [FR1, FR2, FR3, FR4, FR5, FR6]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004]
- Regression: AC [AC5]; FR [FR7, FR8]; scenarios [SCN005]

<!-- nmg-sdlc-issue-scope: {"issueNumber":213,"specPath":"specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004"]},"regression":{"acceptanceCriteria":["AC5"],"functionalRequirements":["FR7","FR8"],"scenarios":["SCN005"]}} -->

## Acceptance Criteria Verification

| AC | Status | Evidence |
|---|---|---|
| AC1 | Pass | Registry wiring is present in `src/sdlc-commands.mjs`, `src/extension.ts`, and `scripts/sdlc-execute.mjs`; corrected explicit-extension TUI diagnostics observed the draft command rewrite and native `mode_change: plan`. |
| AC2 | Pass | Registry rendering preserves stable order and writes machine-readable provenance; focused registry coverage passed. |
| AC3 | Pass | Invalid providers, consumers, slots, sources, placeholders, roots, duplicates, and byte bounds fail closed with named errors. |
| AC4 | Pass | Built-in catalog entries remain plugin-owned and byte ceilings remain enforced. |
| AC5 | Fail | The required live lifecycle reached both merged spec PRs but `/sdlc-execute #11 #12` stopped at #11 `start` with `pane_split_failed`; no delivery PRs were created and neither issue closed. |

## Regression Obligations

- [x] FR7: production composition callsites are cut over to the registry while `workflowBody` remains the file-reader adapter.
- [x] Existing command and worker prompt content and byte ceilings remain covered by passing tests.
- [x] The harness explicitly loads `src/extension.ts` under `--no-extensions` after commit `0dc05967063d2d1fd329e3b25dfd592ef7cf96cd`.
- [ ] AC5 / FR8 / SCN005: two merged delivery PRs and two closed issues are absent.

## Task Completion

| Task | Status | Notes |
|---|---|---|
| T001 | Complete | Prompt-snippet registry module and required exports are present. |
| T002 | Complete | Built-in plugin catalog and immutable records are covered. |
| T003 | Complete | Interactive and automated commands compose through the registry. |
| T004 | Complete | Worker prompts compose through the registry and write provenance. |
| T005 | Complete | Registry contracts and named failures have focused coverage. |
| T006 | Complete | Full compatibility suite passed. |
| T007 | Incomplete | Actual draft and write-spec succeeded for both issues; execute failed before the first worker started. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score | Finding |
|---|---:|---|
| Single Responsibility | 5 | Registry validation, rendering, and provenance remain isolated. |
| Open/Closed | 5 | Catalog records add fragments without composition branches. |
| Liskov Substitution | 5 | Registry records and render results preserve stable contracts. |
| Interface Segregation | 5 | Consumers import only required registry operations. |
| Dependency Inversion | 5 | Command and worker consumers depend on the registry API. |

Layer separation remains sound. No source defect was attributed to the live `pane_split_failed` result because the execute process inherited caller identifier `w6:p5R` while the current verification agent occupied `w6:p5T`; the failed run is preserved for a fresh worker to resume safely.

## Security Assessment

**Score: 5/5.** Fragment registration fails closed; absolute, out-of-root, and symlink-escape sources are rejected; substitutions are named and bounded; no shell evaluation was introduced.

## Performance Assessment

**Score: 4/5.** Work is bounded and linear in prompt size. Registry reconstruction performs avoidable synchronous reads, but remains within the approved bounded dispatch design.

## Testability Assessment

**Score: 5/5.** Registry creation and rendering are deterministic; temporary roots cover file and provenance boundaries; errors are directly observable; consumer synchronization and byte ceilings are tested.

## Error Handling Assessment

**Score: 5/5.** Registration validates before mutation, rendering fails before returning partial text, provenance failures collapse to stable codes, and execute persists the live failure as `pane_split_failed` rather than advancing the queue.

## Test Results

| Check | Result |
|---|---|
| Focused native-plan and harness coverage after remediation | Pass — 14/14 |
| Full Jest suite after remediation | Pass — 513 passed, 2 expected skips |
| OMP plugin surface | Pass |
| Corrected explicit-extension TUI diagnostic | Pass — input rewrite and native plan mode observed |
| Actual `/sdlc-draft-issue` for issue #11 | Pass — issue #11 |
| Actual `/sdlc-draft-issue` for issue #12 | Pass — issue #12 |
| Actual `/sdlc-write-spec #11` | Pass — PR #13 merged, `spec-created` |
| Actual `/sdlc-write-spec #12` | Pass — PR #14 merged, `spec-created` |
| One actual `/sdlc-execute #11 #12` | Fail — stopped on #11 `start`, `pane_split_failed` |
| Delivery PRs merged | Fail — none created |
| Issues closed | Fail — #11 and #12 remain open |

## Live Exercise Evidence

Repository: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`.

The execute TUI reported `NMG SDLC ready in Herdr`, accepted `/sdlc-execute #11 #12` once, and invoked:

```text
node "/Volumes/Fast Brick/source/repos/nmg-sdlc/scripts/sdlc-execute.mjs" run '#11' '#12'
```

Controller output:

```text
Stopped on #11 start. Worker pane unknown agent s11-start left open.
```

Persisted run state records issue 11, step `start`, no completed steps, and `reasonCode: pane_split_failed`. Immediate topology inspection found no surviving `s11-start` agent or worker pane. Exact identifiers, states, and cleanup are in `live-smoke-evidence.md`.

## Fixes Applied

| Severity | Category | Location | Fix | Routing |
|---|---|---|---|---|
| High | Verification infrastructure | `scripts/exercise-omp.mjs`, `scripts/__tests__/sdlc-commands.test.mjs` | Explicitly load `src/extension.ts` in the harness and assert the launch invariant. | direct; commit `0dc05967063d2d1fd329e3b25dfd592ef7cf96cd` |

No new source fix was applied for `pane_split_failed`: the evidence shows a caller-pane identifier mismatch, but does not establish an issue #213 registry regression. The run failed closed and is retained for safe fresh-worker diagnosis.

## Remaining Issues

| Severity | Category | Issue | Impact |
|---|---|---|---|
| Critical | Live convergence | Execute failed at #11 start with `pane_split_failed`; no delivery PRs exist and issues #11/#12 remain open. | AC5, FR8, SCN005, and the authoritative completion gate remain unmet. |

## Cleanup

Smoke processes `live-draft-a`, `live-draft-b`, `live-spec-11`, `live-spec-12`, and `live-execute-11-12` are exited. No unrelated process or Herdr pane was stopped. The disposable clone remains for the fresh verification-fix worker to resume without duplicating issues or specification PRs.

## Recommendation

**Needs another fresh verification-fix run.** Reuse issues #11/#12, merged spec PRs #13/#14, the clean clone, and `.omp/sdlc/run.json`. Diagnose the current-pane `pane_split_failed` boundary, then resume the existing queue. Do not pass verification or proceed to issue #213 delivery until both delivery PRs merge and both issues close.
