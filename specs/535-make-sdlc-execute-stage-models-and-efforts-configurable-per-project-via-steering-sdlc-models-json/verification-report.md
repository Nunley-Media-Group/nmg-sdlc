# Verification Report: Make /sdlc-execute stage models and efforts configurable per project via steering/sdlc-models.json

**Date**: 2026-11-07
**Issue**: #535
**Reviewer**: Claude Code (architecture-reviewer, verify worker)
**Scope**: Implementation verification against spec
**Verification head**: f237d5acbd1258c428f23b79f07984e0a92c6a8f

---

## Executive Summary

All nine acceptance criteria, eight functional requirements, and eight tasks are implemented and covered by tests. Both manifest-registered required validations passed at the verification head: `repository.tests` (Jest, 1258 passed, 2 skipped, 0 failed) and `repository.nmg-sdlc-smoke` (smoke issue #290 delivered through PR #292, MERGED at `0b07269b8390328b81189b5b5f7912337ffcd069`, issue CLOSED). The live smoke run also showed the AC6 missing-file warning exactly once in the controller output. No fixes were needed.

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
**Total Issues**: 1 (low, informational)

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

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact

`steering/manifest.json` loaded and validated (4 modules, 3 snippets, 1 extension). `.nmg-sdlc/verification/535.json`: ceiling `null`, coverage `declared: 2, recorded: 2, complete: true`, no missing, duplicate, or unknown results. Identity: head `f237d5acbd1258c428f23b79f07984e0a92c6a8f`, tree clean, controller run `695ca875-e601-4748-9fa1-70515c6dc233`.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Onboard creates the file with defaults | Pass | `workflows/onboard-project/WORKFLOW.md`, `references/greenfield.md`, `references/brownfield.md` run `sdlc-models.mjs ensure --root .`; `onboard-sdlc-models-contract.test.mjs`; exercise: `ensure` on an empty project → `status: created`, all five entries plus `version: 1` |
| AC2 | Defaults match today except verify effort | Pass | `scripts/sdlc-models.mjs` `STAGE_MODEL_DEFAULTS` (verify `opus`/`high`, others unchanged); `sdlc-models.test.mjs`, `sdlc-execute.test.mjs` default argv |
| AC3 | Upgrade creates/completes without changing values | Pass | `scripts/sdlc-upgrade.mjs` `detectSdlcModels`/`applySdlcModels` (order 10.8); `completeStageModels` merges only missing keys; exercise: partial file kept `verify: sonnet/max`, gained only missing keys, re-run → `already-current`; invalid file yields no item |
| AC4 | Stage workers use project values | Pass | `scripts/sdlc-execute.mjs` `stageModel`/`stageEffort` take `stageModels.config`; `default` effort → `undefined` (no flag); `sdlc-execute.test.mjs` |
| AC5 | Repair re-dispatch uses repair entry | Pass | `stageEntry` returns `config.repair` when `repairDispatch`; exercise: `stageModel('verify', {reasonCode:'x'})` → repair model; `sdlc-execute.test.mjs` |
| AC6 | Missing file falls back with one warning | Pass | `runExecute` `warned()` prefixes `stageModelsWarning` once per result; live smoke controller output began with exactly one `Warning: steering/sdlc-models.json is missing …` line |
| AC7 | nmg-router ids pass through verbatim | Pass | `PROVIDER_MODEL_ID`; exercise: `opencode-go/kimi-k3.1-pro` → model verbatim, effort `xhigh`; `sdlc-models.test.mjs` |
| AC8 | Invalid configuration fails closed | Pass | `loadStageModels` runs after `parseArgs` and before `integrationStatus`; `runCli` validates before `goal`/`list-specified`/`run`/`supervise`; exercise: `run '#1'` with `-p/m` → exit 2, `steering/sdlc-models.json: implement.model = "-p/m": …` |
| AC9 | Supervisor model check unaffected | Pass | `hooks/register.ts` and `src/host-events.mjs` contain no `sdlc-models` reference (grep exit 1); `executeModelRefusal` unchanged |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Stage-model configuration module | Complete | `scripts/sdlc-models.mjs`, all exports and `ensure` CLI |
| T002 | Execute resolves from project file | Complete | Stage maps removed from `src/host-events.mjs` and `.d.mts` |
| T003 | `sdlc-models` upgrade item | Complete | Detector, apply, order 10.8, three upgrade references |
| T004 | Onboarding creates the file | Complete | Three onboard workflow files |
| T005 | Documentation | Complete | README Models/Per-project section, managed list, steering table, troubleshooting; execute WORKFLOW; tech snippet; CHANGELOG bullet ends `(#535)` |
| T006 | Module and dispatch tests | Complete | `sdlc-models.test.mjs`, `sdlc-execute.test.mjs`, `sdlc-commands.test.mjs`, `steering-contract.test.mjs` |
| T007 | Upgrade and onboard tests | Complete | `sdlc-upgrade.test.mjs`, `onboard-sdlc-models-contract.test.mjs` |
| T008 | README contract test | Complete | `readme-sdlc-models-contract.test.mjs` |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | One module owns schema, validation, load, and completion; execute and upgrade only consume it |
| Open/Closed | 5 | Stage names and efforts are frozen tables; new stages extend data, not branching logic |
| Liskov Substitution | 5 | `stageModel`/`stageEffort` keep their signatures with a defaults parameter |
| Interface Segregation | 5 | Narrow exports; upgrade uses only `completeStageModels`/`validateStageModels` |
| Dependency Inversion | 5 | Hooks module stays Node-free and does not depend on the new module |

### Layer Separation

Runtime config lives in `scripts/`. The hooks module is untouched and `src/host-events.mjs` only lost the stage maps. Workflows invoke the helper through the packaged `scripts/sdlc-models.mjs` path.

### Dependency Flow

`sdlc-execute.mjs` and `sdlc-upgrade.mjs` → `sdlc-models.mjs` → Node built-ins only. No cycles.

---

## Security Assessment

- [x] Input validation: strict top-level and entry key sets; model regexes reject whitespace, leading `-` providers, and empty parts
- [x] Injection prevention: model/effort reach Herdr as argv elements, never shell source
- [x] Path safety: `lstat` rejects symlinked or non-regular targets; creation uses `wx`
- [x] Data protection: no secrets read or written
- [x] Authorization: no new remote writes

---

## Performance Assessment

- [x] One bounded synchronous read at CLI startup (permitted by steering)
- [x] No repeated hot-path I/O; config loaded once per invocation
- [x] Resource management: no handles left open

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Tests | Passes |
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

### Coverage Summary

- Feature file: 9 scenarios, 9/9 ACs covered
- Jest: 58 suites passed, 1 skipped; 1258 tests passed, 2 skipped, 0 failed (`npm test -- --runInBand`, 509.7 s)

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Exercised** | `scripts/sdlc-models.mjs ensure`, `scripts/sdlc-execute.mjs run`, `stageModel`/`stageEffort` |
| **Test Project** | disposable temp projects under the session scratchpad |
| **Interactive gate handling** | N/A (automated worker; onboarding/upgrade are interactive commands, so their helper was exercised directly) |

### AC Evaluation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 | Pass | `ensure` → `created`, defaults written; second run → `already-current` |
| AC3 | Pass | partial file → `completed`, `verify` kept `sonnet`/`max`, `deliver.effort` added as `xhigh` |
| AC6 | Pass | live smoke controller output: one warning line |
| AC7 | Pass | `opencode-go/kimi-k3.1-pro` → `--model` value verbatim, effort `xhigh` |
| AC8 | Pass | invalid `-p/m` → exit 2 with file, key, and value before any Herdr/Git/GitHub call |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (registered, required) | Pass | `npm test -- --runInBand` exited 0; 1258 passed, 2 skipped |
| `repository.nmg-sdlc-smoke` (registered, required) | Pass | Provisioned smoke #290; baseline had no closing PR; `sdlc-execute run #290` start/implement/verify/deliver passed; PR #292 MERGED at `0b07269b8390328b81189b5b5f7912337ffcd069`; issue CLOSED |
| Skill inventory | Pass | `skill-inventory-audit.mjs --check`: clean (90 items mapped) |
| Claude Code plugin surface | Pass | `verify-plugin-surface.mjs --root . --label repository` passed |
| Skill creator validation | Pass | No skill-bundled files edited during verification |
| Prompt quality | Pass | Onboard/upgrade/execute workflow additions are unambiguous, cover create/complete/invalid/already-current branches, and name exact paths |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |

**Gate Summary**: 7/7 gates passed, 0 failed, 0 incomplete

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None needed | — | — |

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `scripts/sdlc-models.mjs` `completeStageModels` |
| **Issue** | The `completed` path writes with `writeFileSync` (not atomic) after a parse/validate; a concurrent edit between read and write would be overwritten |
| **Impact** | Negligible: upgrade apply runs once from an approved plan in a single session |
| **Reason Not Fixed** | Outside the verify publication scope (report-only) and not required by any AC |

This repository itself has no `steering/sdlc-models.json`, so its own `/sdlc-execute` runs print the missing-file warning until `/sdlc-upgrade-project` is applied. That is the specified AC6 behavior, not a defect.

---

## Positive Observations

- Clean single-owner module with frozen defaults and precise, key-and-value diagnostics.
- Validation runs before every external call in both `runExecute` and `runCli`.
- Upgrade preserves key order and project values and never rewrites an invalid file.
- The live smoke run exercised the missing-file fallback end to end.

---

## Recommendations Summary

### Before PR (Must)
- [x] None

### Long Term (Could)
- [ ] Consider an atomic write (temp file + rename) for `completeStageModels` completion

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-models.mjs` | 1 (low) | |
| `scripts/sdlc-execute.mjs` | 0 | |
| `scripts/sdlc-upgrade.mjs` | 0 | |
| `src/host-events.mjs`, `src/host-events.d.mts` | 0 | |
| `README.md`, `CHANGELOG.md`, `steering/snippets/project-tech.md` | 0 | |
| `workflows/execute/`, `workflows/onboard-project/`, `workflows/upgrade-project/references/` | 0 | |
| `scripts/__tests__/*` (7 files) | 0 | |

---

## Recommendation

**Ready for PR**

Every acceptance criterion passes with code, test, and exercise evidence, coverage of registered validations is complete, and both required validations passed at the verification head.
