# Verification Report: Exit native plan mode when write-spec Finished is selected

**Date**: 2026-09-27
**Issue**: #444
**Reviewer**: architecture-reviewer (nmg-sdlc verify worker)
**Scope**: Implementation verification against spec
**Verification head**: 3d0e6410c5902e24579468a73c63dcd444007dde

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 4 |
| Error Handling | 4 |
| **Overall** | 4.3 |

### Implementation Status: Pass
**Total Issues**: 2 (both Low, non-blocking)

All 10 acceptance criteria and 7 tasks are implemented. Both manifest-registered validations passed at the exact head `3d0e6410c5902e24579468a73c63dcd444007dde` (coverage 2/2 complete, no ceiling). The live smoke gate provisioned smoke issue #188 unattended (spec PR #189 MERGED), then delivered it through this checkout's execute controller (PR #190 MERGED at `50e70585605ca43129213fc8a204b7be80588391`, issue CLOSED).

---

## Issue Scope

- Active issue: #444
- Spec: `specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10]; FR [FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10]; tasks [T001, T002, T003, T004, T005, T006, T007]; scenarios [SCN001, SCN002, SCN003, SCN004, SCN005, SCN006, SCN007, SCN008, SCN009, SCN010]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":444,"specPath":"specs/444-exit-native-plan-mode-when-write-spec-finished-is-selected","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9","AC10"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10"],"tasks":["T001","T002","T003","T004","T005","T006","T007"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009","SCN010"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --project . --issue 444 --spec specs/444-… --base main --controller-run-id 88d82699-cdbb-4584-a129-d67994245115` → `ok: true`, `ceiling: null`.

Artifact `.omp/sdlc/verification/444.json`: identity head `3d0e6410c5902e24579468a73c63dcd444007dde`, steering `sha256:5ae9b281…68ad`, spec `sha256:f7171ce0…b392`; coverage `declared: 2`, `recorded: 2`, `complete: true`, no missing/duplicate/unknown.

| Validation | Provider | Required | Status | Summary |
|------------|----------|----------|--------|---------|
| `repository.tests` | `builtin.command` | yes | passed | `npm test -- --runInBand` exited 0 — 49 suites passed (1 skipped), 834 tests passed (2 skipped) |
| `repository.nmg-sdlc-smoke` | `project.nmg-sdlc-smoke` | yes | passed | `nmg-sdlc-smoke delivered #188` |

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Continue-loop Finished exits plan mode fully | Pass | `src/extension.ts:95-101` records the Finished selection; `:208-221` exits at a terminal end or the plan-mode decision continuation (`planDecisionContinuation`, `:123-128`); `exitPlanMode` `:181-206` awaits `onSubmit("/plan")` per toggle until mode `none`; test `extension-commands.test.mjs:280` |
| AC2 | Initial-picker Finished exits plan mode fully | Pass | Label `Finished — stop without writing a spec` in `src/sdlc-commands.mjs:97-100`; `workflows/write-spec/WORKFLOW.md:37` step 7 ends the turn without `ask`/`xd://propose`; same exit path; test `extension-commands.test.mjs:280` |
| AC3 | Non-Finished selections keep plan mode | Pass | `writeSpecFinishedSelection` returns `false` for other labels and `customInput` (`src/sdlc-commands.mjs:107-119`); a later non-Finished ask resets `exitPending` (`src/extension.ts:99`); `sdlc-commands.test.mjs:185` cases |
| AC4 | Undispatchable exit fails safe | Pass | `focusedEditor` requires UI, empty draft, focused `CustomEditor`, enabled submit (`src/extension.ts:131-155`); failure/declined confirm → `FINISHED_EXIT_NOTICE` once, pending cleared before dispatch (`:190-205`, `:218-220`); non-decision `willContinue` ends return early (`:211-212`); asserted in `extension-commands.test.mjs:379-383` |
| AC5 | Post-publication continuation is preserved | Pass | Pending continuation wins in the same turn (`src/extension.ts:213-216`); `/sdlc-write-spec` resets published/pending/exit (`:111-117`); test `extension-commands.test.mjs:413-417` |
| AC6 | Smoke gate self-provisions without an explicit queue | Pass | `provisionSmokeIssue` (`steering/extensions/nmg-sdlc-smoke.mjs:702-889`); live: provisioning clone, pane `wF:p2E`, `/sdlc-draft-issue <need>`, `/sdlc-write-spec 188`, spec PR #189 MERGED, then delivery of `[188]`; test `nmg-sdlc-smoke.test.mjs:1351` |
| AC7 | Every provisioning gate is answered automatically | Pass | `askDecision` answers only the Recommended/index-0 option with `enter`, never other issue rows (`:658-674`); plan approval by screen marker or session evidence (`:608-636`, `:851-860`); only `agentSendKeys(["enter"])`; live provisioning needed no operator input; tests `:1351`, `:1386` |
| AC8 | Provisioning completion is proven from GitHub | Pass | `publishedSpec` requires `spec-created` + merged `docs: approve spec for #N` PR (`:685-698`); pane closed in `finally` (`:885-888`); tests `:1408`, `:1421` |
| AC9 | Provisioning failures fail closed, never duplicate issues | Pass | Multiple/zero/stall/free-form → `failed` with screen, status, session, created-issue URL, retained clone (`:733-747`, `:818-865`); launch/cancel/loss → `incomplete` (`:786-813`); recovery reuse/interrupted identity tests `:1435-1519` |
| AC10 | Explicit queues keep priority | Pass | `resolveQueue` (`:173-188`) prefers `config.issues` then the env value; invalid non-blank fails; tests `:1520`, `:1531`, `:448` |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Detect write-spec Finished picker selections | Complete | `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` in `src/sdlc-commands.mjs` |
| T002 | Fully exit native plan mode after a terminal Finished turn | Complete | `src/extension.ts` exit state, decision-continuation detection, awaited toggles |
| T003 | Align write-spec contracts with the Finished exit | Complete | `WORKFLOW.md`, `publish.md`, `references/interactive-gates.md`, `README.md` updated; skill inventory and plugin surface clean |
| T004 | Regression coverage for the Finished exit | Complete | `extension-commands.test.mjs`, `sdlc-commands.test.mjs` |
| T005 | Self-provision smoke issues | Complete | `steering/extensions/nmg-sdlc-smoke.mjs`; frozen `extension` export unchanged |
| T006 | Register provisioning in steering | Complete | `steering/manifest.json` config `{issuesEnv, provision.need}`, `when.kind: always`, required; snippets updated; steering validated by the runner (steering hash recorded, no ceiling) |
| T007 | Regression coverage and docs for smoke provisioning | Complete | SCN006–SCN010 tests; README live-smoke section; CHANGELOG `[Unreleased]` `### Fixed` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Finished classification is a pure function in `sdlc-commands.mjs`; extension owns event wiring. `nmg-sdlc-smoke.mjs` (1688 lines) now holds delivery proof, recovery store, and provisioning TUI driving in one module |
| Open/Closed | 4 | Provisioning added behind `resolveQueue` kinds without changing explicit-queue flow |
| Liskov Substitution | 5 | Injected `runCommand`/`readFileSync`/Herdr adapter substitutes cleanly in tests |
| Interface Segregation | 4 | `createHerdrAdapter` exposes only the needed pane/agent verbs |
| Dependency Inversion | 4 | Provider depends on injected executors; sleep/poll interval injectable |

### Layer Separation

Extension factory dispatches only builtin `/plan` via the focused editor and never mutates Git. Workflow contracts describe the extension's behavior rather than instructing users to type `/plan`. The steering extension remains project-owned and does not change orchestration contracts.

### Dependency Flow

`src/extension.ts` → `src/sdlc-commands.mjs` (pure helpers). Steering provider → plugin runtime via guarded dynamic import; no new runtime dependencies.

---

## Security Assessment

- [x] Authentication: relies on existing `gh` auth; no secret handling added
- [x] Authorization: remote mutation limited to allowlisted `Nunley-Media-Group/nmg-sdlc-smoke` origin, checked on the provisioning clone (`:760-764`)
- [x] Input validation: issue numbers validated as safe positive integers; free-form and multi-select asks fail closed
- [x] Injection prevention: all `git`/`gh`/`herdr` calls use argument arrays; the `--search` value is built from an integer issue number
- [x] Data protection: the provisioner types only the configured need and bare issue numbers; gates answered with `enter` only

---

## Performance Assessment

- [x] Async patterns: `/plan` toggles awaited one at a time; polling uses injectable sleep
- [x] Caching: n/a
- [x] Resource management: owned pane always closed in `finally`; provisioning clone removed on success, retained on failure
- [ ] Query optimization: each 3 s poll re-reads the whole session JSONL and stats every session file in the directory (`:593-604`, `:836`, `:855`) — linear but bounded to one provisioning session (Low)

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes | Yes |
| AC2 | Yes (SCN002) | Yes | Yes |
| AC3 | Yes (SCN003) | Yes | Yes |
| AC4 | Yes (SCN004) | Yes | Yes |
| AC5 | Yes (SCN005) | Yes | Yes |
| AC6 | Yes (SCN006) | Yes | Yes |
| AC7 | Yes (SCN007) | Yes | Yes |
| AC8 | Yes (SCN008) | Yes | Yes |
| AC9 | Yes (SCN009) | Yes | Yes |
| AC10 | Yes (SCN010) | Yes | Yes |

### Coverage Summary

- Feature files: 10 scenarios
- Step definitions: Implemented as Jest ESM tests in `scripts/__tests__/`
- Unit/contract tests: 834 passed, 2 skipped (full suite, 49 suites passed, 1 skipped)
- Integration: live smoke gate (provisioning + delivery) passed

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `write-spec` (and `draft-issue`) |
| **Test Project** | Disposable clone of `Nunley-Media-Group/nmg-sdlc-smoke` (`nmg-sdlc-smoke-provision-CZvif1`) |
| **Exercise Method** | Real TUI in provider-owned Herdr `omp` pane via `repository.nmg-sdlc-smoke`; deterministic fixture `node scripts/skill-exercise-runner.mjs --skill write-spec` |
| **Interactive gate handling** | Automatic Recommended / `Approve and execute` key presses by the provider |
| **Duration** | Steering run 1088 s total (tests + provisioning + delivery) |

### Captured Output Summary

- Provisioning: baseline latest issue #185; `/sdlc-draft-issue <need>` created #188; `/sdlc-write-spec 188` (bare number) published; issue #188 `spec-created`, spec PR #189 MERGED.
- Delivery: `sdlc-execute run #188` → start/implement/verify/deliver passed, `#188: MERGED and CLOSED`; closing PR #190 MERGED with `headRefOid` `50e70585605ca43129213fc8a204b7be80588391`, outside the empty pre-run baseline.
- Fixture: `skill-exercise-runner --skill write-spec` exit 0, 14 pass / 0 fail / 0 skipped.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC6 | Self-provision without explicit queue | Pass | Live provisioning of #188 and delivery proof above |
| AC7 | Automatic gate answers | Pass | No operator input; smoke result `passed` |
| AC8 | GitHub completion evidence | Pass | Provisioning evidence records spec PR #189 MERGED |
| AC1–AC5 | Plan-mode Finished exit | Pass (contract tests) | The provisioner closes its pane on publication before any Finished selection, so live TUI proof of AC1–AC5 comes from the host-fixture tests |

### Notes

Print/RPC harnesses cannot drive interactive `/sdlc-write-spec` (`exercise-testing.md:48`). `exercise-omp.mjs --cwd <disposable> -- /sdlc-write-spec` produced no terminal state; the verifier stopped it after 600 s, removed the disposable project, and relied on the live Herdr TUI evidence instead.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Pass | `npm test -- --runInBand` exit 0; 834 passed, 2 skipped |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Pass | Provisioned #188 (spec PR #189 MERGED); delivered via PR #190 MERGED at `50e70585…8391`; #188 CLOSED |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` exit 0 — clean (90 items mapped) |
| OMP plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0 |
| Skill creator validation | Pass | No skill-bundled files edited during verification; changed bundles pass inventory, surface, and fixture checks |
| Skill exercise | Pass | `node scripts/skill-exercise-runner.mjs --skill write-spec` exit 0 (14/14) |
| Prompt quality | Pass | Finished branches: single interpretation, turn ends without `ask`/`xd://propose`, extension-owned exit, warning fallback documented |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 8/8 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | No fixes required | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **Location** | `steering/extensions/nmg-sdlc-smoke.mjs:783-790` |
| **Issue** | No dedicated regression covers the pane-split / agent-start `incomplete` branches of provisioning |
| **Impact** | A future change could reclassify Herdr launch failure without a failing test |
| **Reason Not Fixed** | Outside this verification's writable scope (report only); the branch is straightforward and matches AC9 |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Performance |
| **Location** | `steering/extensions/nmg-sdlc-smoke.mjs:593-604`, `:836`, `:855` |
| **Issue** | Each poll re-reads the full session JSONL and stats every session file in the directory |
| **Impact** | Linear per-poll cost in session size; bounded by one provisioning session |
| **Reason Not Fixed** | Acceptable for a verification-only provider; outside writable scope |

---

## Positive Observations

- Exit dispatch mirrors the host rule precisely (plan mode, text-only reply, not `error`/`aborted`) and clears the pending exit before dispatch, so it cannot fire twice.
- Provisioning completion depends on GitHub evidence, not on the session state, and the owned pane is closed in `finally`.
- Failure evidence includes created issue URLs, screen, agent status, session path, and the retained clone.

---

## Recommendations Summary

### Before PR (Must)
- None.

### Short Term (Should)
- [ ] Add a regression for provisioning pane-split/agent-start `incomplete`.

### Long Term (Could)
- [ ] Split provisioning TUI driving out of `nmg-sdlc-smoke.mjs`; tail-read the session JSONL incrementally.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `src/extension.ts` | 0 | Finished exit and continuation precedence |
| `src/sdlc-commands.mjs` | 0 | Finished classifier |
| `steering/extensions/nmg-sdlc-smoke.mjs` | 2 | Low: launch-branch test gap, per-poll full reads |
| `steering/manifest.json` | 0 | Provision config registered |
| `steering/snippets/project-tech.md`, `project-product.md` | 0 | Unattended provisioning documented |
| `workflows/write-spec/WORKFLOW.md`, `references/publish.md`, `references/interactive-gates.md` | 0 | Contracts aligned |
| `README.md`, `CHANGELOG.md` | 0 | Docs updated |
| `scripts/__tests__/*.test.mjs` (3) | 0 | SCN001–SCN010 covered |

---

## Recommendation

**Ready for PR**

Every acceptance criterion passes, both registered validations passed at the exact head with complete coverage, and the live smoke gate proved unattended provisioning plus exact-head delivery.
