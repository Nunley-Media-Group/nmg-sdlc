# Verification Report: Stop the /sdlc-execute controller busy-waiting while a stage worker waits on a background command

**Date**: 2026-11-13
**Issue**: #550
**Reviewer**: Claude Code
**Scope**: Implementation verification against spec, on the working tree of branch `551-parallel-delivery-and-550-controller-busy-wait` (based on 091ca5d)

---

## Executive Summary

### Implementation Status: Pass (local validation); registered smoke gate not run

All four acceptance criteria are implemented and covered by passing tests. The change was implemented directly, outside `/sdlc-execute`, so the registered `repository.nmg-sdlc-smoke` validation, which delivers a live smoke issue through GitHub, was not run.

## Validation Results

| Command | Result |
|---------|--------|
| `cd scripts && npm test` | passed: exit 0; Test Suites: 68 passed, 1 skipped (69); Tests: 1612 passed, 2 skipped (1614); 326 s |
| `node scripts/verify-plugin-surface.mjs --root . --label repository --claude-validate` | passed: exit 0 |
| `node scripts/verify-current-specs.mjs` | passed: exit 0, 127 genuine issue specs |
| `node scripts/skill-inventory-audit.mjs --check` | passed: exit 0, 90 items mapped |
| `repository.nmg-sdlc-smoke` | not run |

## Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC1: pass | Pass | `scripts/sdlc-execute.mjs` `awaitTurnEnd` waits with `until: 'started'`, the activity mark, `RESUME_POLL_MS` and a `changed` predicate. `scripts/__tests__/execute-host.test.mjs` describe "controller wait on a settled worker behind its waiting marker (#550)" drives the real file host with an injected clock and sleep and asserts a bounded poll count with a sleep after every poll |
| AC2: pass | Pass | Same describe: a new turn and a fresh handoff end the wait within one host poll; `scripts/__tests__/sdlc-execute.test.mjs` asserts the controller's wait call shape and the returned handoff |
| AC3: pass | Pass | The wait still goes through the sliced `waitFor` that issues check-ins; the existing check-in tests in `scripts/__tests__/sdlc-execute.test.mjs` pass unchanged |
| AC4: pass | Pass | `wait({ until: 'working' })` on a settled worker returns with zero sleeps (existing #538 test, unchanged); a removed marker ends the wait through `changed` and reaches the reminder handling |

## Task Completion

| Task | Status | Notes |
|------|--------|-------|
| T001 | Complete | `scripts/sdlc-execute-host.mjs` `wait` accepts `changed` |
| T002 | Complete | `scripts/sdlc-execute.mjs` `awaitTurnEnd` |
| T003 | Complete | `scripts/__tests__/execute-host.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs` |
| T004 | Complete | `CHANGELOG.md` `### Fixed` bullet ends `(#550)`, under `## [4.13.0]` |

## Steering Alignment

The change follows `steering/manifest.json` and the registered steering snippets: deterministic controller logic in `scripts/`, no new timing constant, tests in `scripts/__tests__/`.

## Remaining Issues

- The registered smoke validation was not run for this change.
- The spec package was written with the implementation, not through `/sdlc-write-spec`.

## Files Reviewed

- `scripts/sdlc-execute-host.mjs`
- `scripts/sdlc-execute.mjs`
- `scripts/__tests__/execute-host.test.mjs`
- `scripts/__tests__/sdlc-execute.test.mjs`
- `CHANGELOG.md`
- `VERSION`, `package.json`, `.claude-plugin/plugin.json` (4.13.0, shared with #551)
