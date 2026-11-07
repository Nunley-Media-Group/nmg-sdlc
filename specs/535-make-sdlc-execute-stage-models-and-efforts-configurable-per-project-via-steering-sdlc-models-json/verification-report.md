# Verification Report: Make /sdlc-execute stage models and efforts configurable per project via steering/sdlc-models.json

**Date**: 2026-11-07
**Issue**: #535
**Reviewer**: Claude Code (nmg-sdlc verify worker, architecture-reviewer)
**Scope**: Implementation verification against spec
**Verification head**: 47070f5e07d83c7e5ed98339294387e44d239561

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 4 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 4 |
| Error Handling | 5 |
| **Overall** | 4.5 |

### Implementation Status: Fail
**Total Issues**: 2

The new `steering/sdlc-models.json` behavior is implemented and covered by its own tests. The registered gate still fails: an existing supervisor contract test (`scripts/__tests__/sdlc-execute-supervisor.test.mjs:513`) did not account for the new missing-file warning on controller stdout. The required live smoke validation was therefore deferred (`incomplete`). The report is Fail because a required registered validation failed.

---

## Issue Scope

- Active issue: #535
- Spec: `specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1–AC9]; FR [FR1–FR8]; tasks [T001–T008]; scenarios [SCN001–SCN009]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":535,"specPath":"specs/535-make-sdlc-execute-stage-models-and-efforts-configurable-per-project-via-steering-sdlc-models-json","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7","AC8","AC9"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007","SCN008","SCN009"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Not complete (required `repository.tests` failed)
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Runner: `sdlc-verify-steering.mjs --project . --issue 535 --spec specs/535-… --base main --controller-run-id 695ca875-e601-4748-9fa1-70515c6dc233`
- Artifact: `.nmg-sdlc/verification/535.json`; runner `ok: false`, ceiling `Incomplete`
- Coverage: declared 2, recorded 2, complete `true`, no missing/duplicate/unknown
- Identity: head `47070f5e07d83c7e5ed98339294387e44d239561`, tree clean, spec hash `sha256:d16e378c…`, steering hash `sha256:f4b70c97…`

| Validation | Required | Result | Summary |
|------------|----------|--------|---------|
| `repository.tests` (`builtin.command`: `npm test -- --runInBand`, cwd `scripts`) | yes | **failed** | Exit 1. Test Suites: 1 failed, 1 skipped, 57 passed. Tests: 1 failed, 2 skipped, 1257 passed |
| `repository.nmg-sdlc-smoke` | yes | **incomplete** | deferred until required local validations pass |

A required failed result caps the status at **Fail**.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Onboard creates the file with defaults | Pass | `workflows/onboard-project/WORKFLOW.md`, `references/greenfield.md`, `references/brownfield.md` run `sdlc-models.mjs ensure --root .`; `completeStageModels` creates defaults (`scripts/sdlc-models.mjs`); `onboard-sdlc-models-contract.test.mjs` and `sdlc-models.test.mjs` pass |
| AC2 | Defaults: verify effort `high`, others unchanged | Pass | `STAGE_MODEL_DEFAULTS` in `scripts/sdlc-models.mjs`; `stageEffort` maps `default` to no flag (`scripts/sdlc-execute.mjs`) |
| AC3 | Upgrade creates/completes without changing project values | Pass | `detectSdlcModels`/`applySdlcModels` in `scripts/sdlc-upgrade.mjs` (order 10.8); `mergeMissing` keeps values and key order; invalid or complete file → no item; upgrade references updated |
| AC4 | Stage workers use project values | Pass | `agentStart` passes `stageModel/stageEffort(step, failure, stageModels.config)`; `sdlc-execute.test.mjs` asserts `--model sonnet --effort max` |
| AC5 | Repair re-dispatch uses the repair entry | Pass | `stageEntry` returns `config.repair` when `repairDispatch`; covered in `sdlc-execute.test.mjs` |
| AC6 | Missing file → defaults + exactly one warning | Pass (behavior) | `loadStageModels` returns defaults plus `stageModelsWarning`; `warned()` prefixes one line on every return path. A pre-existing supervisor test still asserts empty stdout (see Remaining Issues) |
| AC7 | `provider/model` ids accepted verbatim | Pass | `PROVIDER_MODEL_ID` regex; probe: `opencode-go/kimi-k3.1-pro` valid; argv test passes |
| AC8 | Invalid config fails closed with exit 2 before Herdr/Git/GitHub | Pass | `runExecute` validates after `parseArgs`, before `integrationStatus`; `runCli` validates before `goal`/`list-specified`/`run`/`supervise`. Probe: `gpt 5`, `/x`, `x/`, `-p/m` rejected; diagnostics `steering/sdlc-models.json: verify.effort = "ultra": …` and `foo = 1: unknown top-level key` |
| AC9 | Supervisor model check unaffected | Pass | `grep sdlc-models hooks/register.ts src/host-events.mjs` → no matches; `executeModelRefusal` unchanged |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Stage-model configuration module | Complete | `scripts/sdlc-models.mjs` with required exports and `ensure` CLI |
| T002 | Resolve execute worker models/efforts | Complete | Stage maps removed from `src/host-events.mjs` and `.d.mts` |
| T003 | `sdlc-models` upgrade item | Complete | Detector, apply, order 10.8, three reference docs |
| T004 | Create the file during onboarding | Complete | Three onboard files |
| T005 | Documentation | Complete with defect | README updated, but has a duplicated `### Autopilot for hands-off drivers` heading at `README.md:129`/`README.md:131` |
| T006 | Test module and execute dispatch | Incomplete | `cd scripts && npm test` does not exit 0: `sdlc-execute-supervisor.test.mjs` fails |
| T007 | Test upgrade and onboard creation | Complete | Tests pass; skill inventory and plugin surface exit 0 |
| T008 | README contract test | Complete | `readme-sdlc-models-contract.test.mjs` passes |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | One module owns schema, defaults, validation, load, and completion. The validation is cohesive |
| Open/Closed | 4 | Stage list and allowed efforts are data tables |
| Liskov Substitution | 5 | N/A, no inheritance besides `StageModelsError extends Error` |
| Interface Segregation | 4 | Small exported surface. `stageModel`/`stageEffort` default `config` to plugin defaults |
| Dependency Inversion | 4 | Execute and upgrade depend on `sdlc-models.mjs`. The hooks module stays isolated |

### Layer Separation

Runtime config lives in `scripts/`, and `src/host-events.mjs` no longer holds stage maps. The hooks module reads no project file.

### Dependency Flow

`sdlc-execute.mjs` and `sdlc-upgrade.mjs` import `sdlc-models.mjs`. There are no cycles.

---

## Security Assessment

- [x] Input validation: strict schema with unknown-key rejection, an allowlisted effort enum, and a model regex rejecting whitespace and leading `-` (prevents argv flag injection)
- [x] Injection prevention: values pass as argv elements to `herdr agent start`; no shell composition
- [x] Path safety: `lstat` rejects symlinked or non-regular targets; create uses `wx`
- [x] Data protection: no secrets involved

## Performance Assessment

- [x] One bounded synchronous read at CLI startup, which the steering allows
- [x] No hot-path I/O added

## Error Handling

- [x] Stable exit 2 with a diagnostic naming the file, key, and value
- [x] Unreadable or invalid files never rewritten. `ensure` exits 1 on `invalid`

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1–AC9 | Yes (SCN001–SCN009, 9 scenarios) | Jest contract tests | New tests pass; full suite fails on 1 existing test |

### Coverage Summary

- Feature file: 9 scenarios
- Jest: 1260 tests; 1257 passed, 1 failed, 2 skipped

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Contract tests (`repository.tests`) | Fail | `sdlc-execute-supervisor.test.mjs:513` expected `stdout: ''`, received the missing-file warning line |
| Live smoke project (`repository.nmg-sdlc-smoke`) | Incomplete | Deferred until required local validations pass |
| Skill inventory | Pass | `node scripts/skill-inventory-audit.mjs --check` exit 0 |
| Claude Code plugin surface | Pass | `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0 |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |
| Skill exercise | Not run | No live exercise is meaningful until the contract gate passes |

**Gate Summary**: 3/6 passed, 1 failed, 1 incomplete, 1 not run

---

## Fixes Applied

None. The bound publication scope allows only `verification-report.md`, so this worker made no source or test edits.

## Remaining Issues

### Critical Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| High | test-coverage | `scripts/__tests__/sdlc-execute-supervisor.test.mjs:513` | "supervised execute sessions (#491) › yields stage reports across invocations with one live lease, then halts with cleanup" expects the halt `decide` result `{ code: 1, stdout: '', stderr: 'supervisor_halt: …' }`. With no `steering/sdlc-models.json` in the fixture, the controller now prefixes `Warning: steering/sdlc-models.json is missing; …` to stdout (AC6). Fix: add a defaults `steering/sdlc-models.json` to that fixture, or expect the single warning line | Outside the verify publication scope; routes to implementation |

### Low Priority

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| Low | docs | `README.md:129`, `README.md:131` | `### Autopilot for hands-off drivers` is duplicated. The first copy is an empty section left by the new "Per-project stage models" insertion. Delete one heading | Outside the verify publication scope |

### Recommendation

Needs fixes. Repair the supervisor test fixture and the duplicated README heading, then rerun the full registered gate, including the live smoke.
