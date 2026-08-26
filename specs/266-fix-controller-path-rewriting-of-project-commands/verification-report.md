# Verification Report: Fix controller path rewriting of project commands

**Issue**: #266
**Date**: 2026-08-25
**Status**: Pass
**Head**: pending delivery commit

## Executive Summary

Issue #266 passes. Runtime materialization now resolves only explicit `<plugin-root>` controller references. Project-local commands such as `node scripts/check-gate.mjs` remain unchanged, while explicit missing packaged controllers still fail closed. The companion nmg-pi bootstrap plan uses OMP's `--force` replacement path for repeated pinned Git installs.

## Deterministic Steering Gate

`node scripts/sdlc-verify-steering.mjs --project . --issue 266 --spec specs/266-fix-controller-path-rewriting-of-project-commands --base main` — passed (`ok: true`, `ceiling: null`). Artifact: `.omp/sdlc/verification/266.json`.

## Acceptance Criteria

| AC | Result | Evidence |
|----|--------|----------|
| AC1 | Pass | `scripts/plugin-controller-path.mjs` has no unqualified project-command rewrite; `scripts/__tests__/plugin-controller-path.test.mjs` preserves `node scripts/check-gate.mjs`. |
| AC2 | Pass | Explicit shell and quoted-argv `<plugin-root>` forms resolve to JSON-quoted absolute package paths in focused tests. |
| AC3 | Pass | Existing missing explicit controller test still requires `controller unresolved: missing.mjs`; installed delivery-controller preflight coverage remains green. |
| AC4 | Pass | `scripts/__tests__/extension-commands.test.mjs` passes project-local evidence through `materializeRuntimeMessages`; live OMP source-extension smoke completed without an extension error. |
| AC5 | Pass | nmg-pi `src/bootstrap-plan.ts` adds `--force` only to `planOmpSdlcEnsure`; exact plan and full portable checks pass. |

## Test and Smoke Evidence

- `cd scripts && npm test -- --runInBand __tests__/plugin-controller-path.test.mjs __tests__/extension-commands.test.mjs` — passed (2 suites, 13 passed, 1 platform-skipped).
- `cd scripts && npm test -- --runInBand` — passed (46 suites, 632 passed, 2 skipped).
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed (39 genuine issue specs, 16 required archive, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub).
- From a disposable consumer project, `omp --print --no-session --no-extensions --extension "/Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts" --cwd /tmp/nmg-sdlc-266.ce6UqE --model openai-codex/gpt-5.6-luna "Repeat exactly: node scripts/check-gate.mjs"` — passed; output was exactly `node scripts/check-gate.mjs`, with no `controller unresolved` extension error.
- In nmg-pi, `npm test -- --run test/bootstrap-plan.test.ts` — passed (18 tests).
- In nmg-pi, `npm run check:portable` — passed (typecheck, 154 tests, RPC question smoke, RPC skill discovery, installed package metadata smoke).

## Architecture Review

| Area | Score | Finding |
|------|-------|---------|
| SOLID | 5/5 | One resolver retains one explicit plugin-ownership boundary; no new abstraction. |
| Security | 5/5 | Explicit plugin paths still validate package identity and file presence; project cwd fallback remains forbidden. |
| Performance | 5/5 | Removes an unnecessary regex pass and avoids filesystem lookups for project commands. |
| Testability | 5/5 | Direct helper, extension-context, exact command-plan, and full repository coverage. |
| Error handling | 5/5 | Explicit missing plugin controllers keep stable `controller_unresolved` failure semantics. |

**Average**: 5.0/5.0

## Remaining Issues

None.

## Overall Status

Pass.
