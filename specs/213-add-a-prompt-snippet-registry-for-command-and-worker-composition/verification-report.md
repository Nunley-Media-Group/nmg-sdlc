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

Registry, provenance, fail-closed composition, native-plan rewriting, byte ceilings, and local compatibility tests pass. The live exercise now proves the corrected caller-pane environment can create workers: issue #11 passed start and implementation, and pushed commit `34c69c6239e87eb0b330e3fb9fc6fb66d22be031`. The resumed controller stopped at issue #11 `review1` with persisted `reasonCode: review_failed`; `s11-review1` remains open in the base-branch picker with no review handoff. No delivery PR exists, both issues remain open, and issue #12 has not started. The authoritative two-issue convergence gate remains unmet.

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
| AC5 | Fail | Corrected execution passed #11 start and implementation but stopped at #11 review1 with `review_failed`; no delivery PRs were created, neither issue closed, and #12 did not start. |

## Regression Obligations

- [x] FR7: production composition callsites are cut over to the registry while `workflowBody` remains the file-reader adapter.
- [x] Existing command and worker prompt content and byte ceilings remain covered by passing tests.
- [x] The harness explicitly loads `src/extension.ts` under `--no-extensions` after commit `0dc05967063d2d1fd329e3b25dfd592ef7cf96cd`.
- [ ] AC5 / FR8 / SCN005: #11 reached a pushed implementation, but two merged delivery PRs and two closed issues are absent.

## Task Completion

| Task | Status | Notes |
|---|---|---|
| T001 | Complete | Prompt-snippet registry module and required exports are present. |
| T002 | Complete | Built-in plugin catalog and immutable records are covered. |
| T003 | Complete | Interactive and automated commands compose through the registry. |
| T004 | Complete | Worker prompts compose through the registry and write provenance. |
| T005 | Complete | Registry contracts and named failures have focused coverage. |
| T006 | Complete | Full compatibility suite passed. |
| T007 | Incomplete | Actual draft and write-spec succeeded for both issues; corrected execute reached #11 review1, then failed before review completion or delivery. |

## Architecture Assessment

### SOLID Compliance

| Principle | Score | Finding |
|---|---:|---|
| Single Responsibility | 5 | Registry validation, rendering, and provenance remain isolated. |
| Open/Closed | 5 | Catalog records add fragments without composition branches. |
| Liskov Substitution | 5 | Registry records and render results preserve stable contracts. |
| Interface Segregation | 5 | Consumers import only required registry operations. |
| Dependency Inversion | 5 | Command and worker consumers depend on the registry API. |

Layer separation remains sound. The corrected environment eliminated the prior `pane_split_failed`: branch workers were created under caller pane `w6:p5V`. The terminal `review_failed` boundary is preserved without attributing it to the issue #213 registry change; the review worker remains in an interactive base-branch picker and no review handoff exists.

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
| One actual `/sdlc-execute #11 #12` corrected round | Fail — #11 start/implement passed; stopped at #11 review1 with `review_failed` |
| Delivery PRs merged | Fail — none created |
| Issues closed | Fail — #11 and #12 remain open |

## Live Exercise Evidence

Repository: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`.

Before launch, both the environment and `herdr pane current --current` identified caller pane `w6:p5V`. The managed OMP TUI received `HERDR_ENV=1`, `/Users/rnunley/.config/herdr/herdr.sock`, and `HERDR_PANE_ID=w6:p5V` explicitly. It disabled ambient extensions/skills and loaded `/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts`.

The corrected round entered `/sdlc-execute #11 #12` once. The branch controller created real workers: `s11-start` in `w6:p5W`, `s11-implement` in `w6:p5X`, and `s11-review1` in `w6:p5Y`. Start and implementation handoffs passed. The implementation branch is clean, pushed, and points at `34c69c6239e87eb0b330e3fb9fc6fb66d22be031`.

The TUI orchestration agent canceled its original background branch-controller process after receiving an advisor recommendation to use the smoke repository's older installed controller. Its reconciliation run did not duplicate the live implementation worker. After implementation settled, a direct branch-controller resume with the same caller environment advanced the persisted queue to review1 and stopped:

```text
Stopped on #11 review1. Worker pane w6:p5Y agent s11-review1 left open.
```

Persisted state records completed `["start", "implement"]` for issue #11 and `reasonCode: review_failed` at `review1`. No review handoff exists. The retained worker is idle with `/review` and `Select base branch` visible; the issue branch is selected and `main` is available. No `s12-*` worker exists.

GitHub remains terminally incomplete: issues #11 and #12 are open, specification PRs #13/#14 are merged, repository-scoped delivery-branch PR search returned zero results, and no delivery merge SHA exists. Exact environment, worker topology, handoffs, commit, states, and cleanup are in `live-smoke-evidence.md`.

## Fixes Applied

| Severity | Category | Location | Fix | Routing |
|---|---|---|---|---|
| High | Verification infrastructure | `scripts/exercise-omp.mjs`, `scripts/__tests__/sdlc-commands.test.mjs` | Explicitly load `src/extension.ts` in the harness and assert the launch invariant. | direct; commit `0dc05967063d2d1fd329e3b25dfd592ef7cf96cd` |

No nmg-sdlc source fix was applied for this terminal boundary. The corrected caller environment resolved the prior split failure, but this round stopped at the interactive review picker before producing a review handoff. The state is preserved for a fresh verifier rather than manually bypassing the controller contract.

## Remaining Issues


| Severity | Category | Issue | Impact |
|---|---|---|---|
| Critical | Live convergence | Execute stopped at #11 review1 with `review_failed`; #11 has no delivery PR, #12 has not started, and both issues remain open. | AC5, FR8, SCN005, and the authoritative completion gate remain unmet. |
| High | Review orchestration | Retained `s11-review1` is idle in the base-branch picker with no review handoff after the branch controller returned `review_failed`. | A fresh verifier must diagnose/resume the supported review boundary without duplicating resources. |

## Cleanup

The corrected TUI is idle and its controller process exited. Completed start/implement workers were closed. `s11-review1` remains open in pane `w6:p5Y`; no issue #12 worker was created. No unrelated process or pane was stopped. The disposable clone remains clean on the pushed issue #11 branch with runtime state and handoffs preserved.

## Recommendation

**Needs another fresh verification-fix run.** Reuse issues #11/#12, merged spec PRs #13/#14, the clean clone, passed #11 start/implement handoffs, and retained `s11-review1` pane `w6:p5Y`. Diagnose the review picker/controller boundary and resume the persisted serial queue. Do not pass verification or proceed to issue #213 delivery until both delivery PRs merge and both issues close.
