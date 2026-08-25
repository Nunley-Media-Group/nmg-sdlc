# Verification Report: Add controller-owned fresh-session remediation loops

**Date**: 2026-08-25
**Issue**: #259
**Reviewer**: Codex
**Scope**: Implementation verification against approved specification

---

## Executive Summary

The implementation satisfies the six acceptance criteria and five approved tasks. The controller persists failure evidence before closing a remediable worker, starts and retries fresh `r<N>-<step>` OMP sessions, preserves the original handoff identity, resumes live remediation without duplicate step workers, and retains fail-closed behavior for non-remediable outcomes. The earlier complete Jest suite, current 152-test focused controller suite, and six-test prompt-contract suite pass. Nine subsequent smoke-product findings were fixed and covered locally; no GitHub smoke rerun was performed or claimed by this correction.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 4 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | **4.3** |

### Implementation Status: Pass
**Total Issues**: 0

---

## Issue Scope

- Active issue: #259
- Spec: `specs/259-add-controller-owned-fresh-session-remediation-loops`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004, T005]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006]
- Regression: AC [AC3, AC4]; FR [FR7, FR8]; scenarios [SCN003, SCN004]

<!-- nmg-sdlc-issue-scope: {"issueNumber":259,"specPath":"specs/259-add-controller-owned-fresh-session-remediation-loops","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006"]},"regression":{"acceptanceCriteria":["AC3","AC4"],"functionalRequirements":["FR7","FR8"],"scenarios":["SCN003","SCN004"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required
- Current focused controller verification: Pass (152 tests)
- Current prompt-contract verification: Pass (6 tests)
- GitHub smoke rerun: Not run; no smoke pass claimed

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A remediable failed handoff is persisted, its pane closes, one fresh rem session reruns the original step, and the queue continues on pass. | Pass | `scripts/sdlc-execute.mjs:896-1026`, `scripts/sdlc-execute.mjs:1176-1188`, `scripts/__tests__/sdlc-execute.test.mjs:1206-1220` |
| AC2 | A remediable rem failure closes and retries in a fresh session with incremented evidence. | Pass | `scripts/sdlc-execute.mjs:896-927`, `scripts/sdlc-execute.mjs:1126-1135`, `scripts/__tests__/sdlc-execute.test.mjs:1222-1236` |
| AC3 | Blocked, unknown, missing/invalid, stalled, intervention, and start outcomes remain fail-closed with their panes preserved. | Pass | `scripts/sdlc-execute.mjs:1110-1159`, `scripts/__tests__/sdlc-execute.test.mjs:1408-1446` |
| AC4 | A genuine blocker stops remediation; a later pane-free resume can use the existing backward-next rewind without advancing later issues. | Pass | `scripts/sdlc-execute.mjs:1137-1159`, `scripts/sdlc-execute.mjs:1235-1271`, `scripts/__tests__/sdlc-execute.test.mjs:1254-1325`, `scripts/__tests__/sdlc-execute.test.mjs:2116-2140` |
| AC5 | Recovery maintains one rem pane and the original step identity; live remediation resume does not duplicate workers. | Pass | `scripts/sdlc-execute.mjs:1229-1285`, `scripts/__tests__/sdlc-execute.test.mjs:1239-1247`, `scripts/__tests__/sdlc-execute.test.mjs:1327-1405` |
| AC6 | Behavioral fixtures cover topology, retries, identity transfer, automatic continuation, no duplicates, fail-closed outcomes, interactive review picker readiness, retained-worker status races, absent-versus-invalid classification, and bounded settled-handoff correction races. | Pass | Current focused Jest result: 1 suite, 152 tests passed; fresh delivery, retained, and remediation fixtures make incomplete handoffs valid during later observations, while permanent missing/invalid boundaries retain their panes with exact reasons and no duplicate or remediation worker. |

---

## Regression Obligations

| Obligation | Status | Evidence |
|------------|--------|----------|
| AC3 / FR7 / SCN003: non-remediable outcomes keep their worker pane and do not start rem. | Pass | `does not rem a failed start or intervention handoff` and `does not rem blocked unknown missing stalled or invalid outcomes` pass in the focused suite. |
| AC4 / FR8 / SCN004: backward-next rewind remains available only after remediation stops and no live rem worker remains. | Pass | `stops rem on a genuine blocker and preserves its pane` and `rewinds a stopped blocked remediation after its pane disappears` pass. |
| Serial issue boundary: later issues do not start before current issue delivery completes. | Pass | Existing serial-controller coverage and `keeps later queued issues blocked until remediated delivery completes` pass in the focused suite. |

### Post-verification Review Picker Regressions

| Regression | Status | Evidence |
|------------|--------|----------|
| Narrow/titleless Review Mode renderings must be recognized without relying on a title. | Pass locally | Commits `37b9080` and `7ef9f80`; `completes fresh review selection from narrow titleless picker rows` and `resumes a retained review from narrow titleless picker rows`. |
| Complete Review Mode structure must accept supported Unicode and ASCII navigation hints while rejecting title-only, partial, unrelated, or ambiguous screens. | Pass locally | Commits `fb4ae21` and `8676a88`; `rejects a titled review screen without the complete picker structure`, `keeps Unicode titleless review picker coverage`, and existing ambiguous-screen coverage. |
| Numbered base-branch selection must require a recognized branch-picker context, exactly one numbered `main` row, populated option rows, and a supported navigation hint. The search counter remains sufficient context for titleless pickers but is optional for a recognized titled picker. | Pass locally | Counter-present staged fixtures remain covered by `waits for the complete live review branch picker structure` and `waits for a retained live review branch picker to render completely`. Fresh and retained footerless numbered fixtures accept complete titled ASCII-hint screens and reject the same screens before navigation renders. |
| A stale non-idle retained-review sample must be re-checked with the complete interactive picker before any blocking wait for `working`; genuine working/non-actionable workers retain the unbounded settlement wait. | Pass locally | `resamples a stale retained review state before waiting on its complete picker` verifies mode and branch keys precede the `--until working` call; `fails closed on a complete retained branch picker without a resolvable selection` verifies `review_failed`, no keys, and no wait; and `keeps the unbounded settlement wait for a genuinely working retained review` verifies no timeout and no duplicate review worker. |
| The captured footerless unnumbered branch picker must be actionable in both fresh and retained preflight only under its strict complete structure. | Pass locally | `accepts the captured live unnumbered branch picker for a fresh review` and `accepts the captured live unnumbered branch picker for a retained review` use the preserved `s17-review2` layout with its cursor on the feature branch and unmarked exact `main` row. Eleven fresh negative boundaries reject title-only, no-navigation, empty, single-row, zero/multiple-cursor, zero/duplicate-default, prose, ambiguous, and incomplete staged screens; retained coverage verifies selection occurs before any `agent wait --until working`. |
| Existing unreadable, malformed, schema-invalid, or identity-mismatched handoffs must remain distinct from absent handoffs and must never seed remediation. | Pass locally | `readExpectedHandoff` returns `missing_handoff` only when the path is absent and `invalid_handoff` for every existing invalid artifact. Fresh, retained, and active-remediation fixtures verify stable failure state, accurate retained-pane output, no replacement worker, and no additional remediation history. |
| A settled worker may still be completing or correcting its terminal handoff after its first idle/done observation. | Pass locally | Fresh delivery, retained-worker, and active-remediation fixtures deterministically replace an initially incomplete handoff during the existing bounded observation budget and continue without duplicate workers or remediation. Permanent invalid and missing fixtures exhaust 49 re-observation pauses, retain the pane, and preserve `invalid_handoff` or `missing_handoff`; valid failed/blocked handoffs are consumed immediately and are not retried. |

No GitHub smoke rerun was performed after these fixes. This section records local changed-contract evidence only.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Add remediable predicate and persist-then-close. | Complete | Exact step allowlist and predicate exported; retained and new-worker paths route through persisted remediation evidence before close. |
| T002 | Start one rem session with deterministic recovery prompt. | Complete | `r<N>-<step>` OMP session, rem CLI, review completion, original handoff identity, and normal pass consumption implemented. |
| T003 | Retry remediation, resume without duplicates, and defer rewind. | Complete | Fresh retry loop, exact live-rem lookup, active/stopped remediation state, and pane-free rewind implemented. |
| T004 | Add rem-loop controller tests. | Complete | Fixture and behavioral coverage added in `scripts/__tests__/sdlc-execute.test.mjs`. |
| T005 | Verify focused controller suite. | Complete | Current focused result: 152/152 controller tests and 6/6 prompt-contract tests passed. |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Remediation predicate, prompt rendering, persistence, and loop control are separated into focused helpers inside the controller module. The existing controller file remains large, but the change does not introduce a second orchestration abstraction. |
| Open/Closed | 4 | The remediable allowlist and helper boundary isolate policy without changing `VALID_STEPS` or prompt consumers. |
| Liskov Substitution | 4 | Herdr and command adapters retain their injected contracts; remediation reuses the same worker and handoff interfaces. |
| Interface Segregation | 4 | New helpers accept narrow state/evidence objects and do not widen worker contracts. |
| Dependency Inversion | 4 | `runExecute` continues to use injected `run`, `herdr`, and filesystem seams, preserving deterministic fixture tests. |

### Layer Separation

The execute controller remains an orchestrator: it persists state, launches sibling `--kind omp` workers, validates handoffs, and advances workflow state. Product edits and PR writes remain worker-owned. No workflow, agent, extension, or prompt-registry layer was widened.

### Dependency Flow

Remediation composes existing `workerPrompt`, Herdr adapters, handoff validation, pane operations, and run-state persistence. `rem` is not added to `VALID_STEPS` or `WORKER_CONSUMERS`, preserving the queue-step dependency direction.

---

## Security Assessment

**Score: 4/5**

- Authentication and authorization boundaries are unchanged; execute still requires existing GitHub/Herdr preflight.
- `--failed-step` is allowlisted through `REMEDIABLE_STEPS`.
- Rem workers must produce a validated original-step handoff; `step: rem`, mismatches, missing files, and invalid handoffs fail closed.
- Worker summary and artifact values are rendered as prompt text rather than shell source; no new shell interpolation is introduced.
- Only bounded handoff evidence is persisted; worker transcripts and secrets are not copied into run state.

---

## Performance Assessment

**Score: 4/5**

- Recovery uses one blocking controller loop, existing Herdr waits, and the existing 50-observation budget; it adds no polling daemon or duplicate worker scan.
- Settled workers with missing or invalid evidence receive at most 49 one-second re-observation pauses after the first read. Valid evidence, including failed and blocked statuses, returns immediately.
- Failed panes close before fresh sessions start, bounding top-level recovery topology to one rem pane.
- The remediation retry loop remains intentionally unbounded per FR5 and terminates only on pass or a genuine blocker. This is required behavior, not an accidental resource-growth path.
- No new dependencies, network scans, caches, or repeated directory traversals were added.

---

## Error Handling Assessment

**Score: 4/5**

- Stable reason codes cover pane split/close failure, agent start/prompt failure, unknown pane, missing/invalid handoff, and worker failure.
- Missing or invalid evidence is re-read only within the existing bounded observation budget; the final read still determines the exact fail-closed reason.
- Valid failed and blocked handoffs are never retried by the observation helper, and malformed or mismatched evidence is never accepted.
- Failure evidence is written before destructive pane closure.
- Close failure stops remediation and starts no replacement pane.
- Blocked and intervention outcomes preserve the relevant pane and persist exact run failure state.
- Passed handoffs clear both `failed` and `remediation` atomically in the next run-state write.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Behavioral Test | Passes |
|---------------------|-------------|---------------------|--------|
| AC1 / SCN001 | Yes | Yes | Yes |
| AC2 / SCN002 | Yes | Yes | Yes |
| AC3 / SCN003 | Yes | Yes | Yes |
| AC4 / SCN004 | Yes | Yes | Yes |
| AC5 / SCN005 | Yes | Yes | Yes |
| AC6 / SCN006 | Yes | Yes | Yes |

### Coverage Summary

- Feature files: 1 feature, 6 scenarios
- Current focused controller suite: 1 suite passed, 152 tests passed, 0 failed
- Current prompt-contract suite: 1 suite passed, 6 tests passed, 0 failed
- Historical complete contract evidence from the initial issue verification: 43 suites passed; 529 tests passed; 2 expected skips; 0 failed
- Historical expected skips: opt-in exercise suite without `RUN_EXERCISE_TESTS=1`, plus the non-Darwin platform counterpart in `plugin-controller-path.test.mjs`
- Current correction smoke status: GitHub smoke rerun not performed; no smoke pass claimed

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Current focused controller tests | Pass | `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs`: 1 suite passed, 152 tests passed, exit 0. |
| Current prompt-contract tests | Pass | `cd scripts && npm test -- --runInBand __tests__/sdlc-prompt-snippets.test.mjs`: 1 suite passed, 6 tests passed, exit 0. |
| Historical complete contract tests | Pass | Initial issue verification recorded 43 passed suites, 529 passed tests, 2 intentional skips, exit 0. |
| OMP plugin surface | Pass | Initial issue verification recorded `verify-plugin-surface.mjs --root . --label repository` passing. |
| Git hygiene | Pass | Current remediation recorded `git diff --check` exiting 0 with no output. |

**Gate Summary**: Current changed-contract verification passes. Complete-suite and plugin-surface results are retained as clearly labeled historical evidence; GitHub smoke remains pending and is not represented as passed.

---

## Fixes Applied

Nine post-verification smoke-product findings were corrected. The ninth correction gives every settled fresh, retained, delivery, and remediation worker the existing bounded observation budget for an in-flight missing or invalid handoff to become valid, while preserving the final `missing_handoff` or `invalid_handoff` reason, pane retention, and no-remediation behavior when the budget expires. Generated worker prompts now require `validate-handoff` to succeed before printing `NMG_SDLC_HANDOFF`. Controller correctness does not depend on prompt compliance. The eighth correction centralized absent-versus-invalid classification.

---

## Remaining Issues

The GitHub smoke rerun remains pending. No smoke pass is claimed.

---

## Positive Observations

- The implementation preserves the original queue-step and handoff identity instead of introducing a pseudo-step.
- Persistence precedes pane closure, making failed-worker evidence auditable.
- Exact rem-agent lookup and explicit remediation state prevent duplicate `s` and `r` workers on resume.
- Existing intervention and rewind fixtures remain distinct from the new remediable-failure fixture.

---

## Recommendations Summary

### Before PR (Must)

- [x] No remaining local verification blockers.

### Short Term (Should)

- [x] No follow-up required for issue #259.

### Long Term (Could)

- [ ] Consider extracting controller state-machine helpers only if future changes materially increase `runExecute` complexity; no extraction is warranted for this issue alone.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | Centralized bounded settled-handoff observation across fresh, retained, delivery, and remediation consumers; exact final fail-closed classification; remediation, picker, and resume behavior. |
| `src/sdlc-prompt-snippets.mjs` | 0 | Generated worker header requires deterministic handoff validation before the terminal marker. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Deterministic late-correction races plus permanent missing/invalid boundaries, pane retention, and no duplicate/remediation behavior. |
| `scripts/__tests__/sdlc-prompt-snippets.test.mjs` | 0 | Exact generated validation-before-marker contract. |
| `CHANGELOG.md` | 0 | `[Unreleased]` records bounded settled-handoff observation and prompt ordering without weakened validation. |
| `specs/259-add-controller-owned-fresh-session-remediation-loops/*` | 0 | Approved requirements, design, tasks, Gherkin, and current verification evidence. |

---

## Recommendation

**Ready for GitHub smoke rerun**

All local acceptance criteria, regression obligations, approved tasks, architecture checks, the 152-test focused controller suite, and the six-test prompt-contract suite pass. GitHub smoke and delivery were not run by this correction.
