# Verification Report: Fix compiled-host runtime and context failures

**Issue**: #269
**Date**: 2026-08-25
**Status**: Passed
**Head under test**: working tree based on `9a41931fb6b673664499c7856727b9900c9e0502`

## Acceptance Results

| Criterion | Result | Evidence |
|-----------|--------|----------|
| AC1 | Pass | `scripts/__tests__/sdlc-prompt-snippets.test.mjs` sets `process.execPath` to a non-Node compiled-host path; `/sdlc-draft-issue` still renders project guidance through explicit `node`. |
| AC2 | Pass | Focused registry coverage includes project product guidance; the actual OMP TUI opened Plan mode and rendered the draft workflow plus `$ARGUMENTS: repair runtime loading`. |
| AC3 | Pass | Existing invalid-steering regression still throws `project_runtime_invalid`; no plugin-only fallback was added. |
| AC4 | Pass | Actual OMP TUI loaded `src/extension.ts` against `/tmp/nmg-sdlc-269-yof5zw`, accepted `/sdlc-draft-issue repair runtime loading`, entered Plan mode, and displayed no extension error. |
| AC5 | Pass | Extension context coverage resolves shipped `sdlc-status.mjs`, preserves project-local commands, and leaves `node <plugin-root>/scripts/missing.mjs` unchanged; strict resolver coverage still throws `controller unresolved: missing.mjs`. |
| AC6 | Pass | `node scripts/sdlc-steering.mjs validate --project .` returned `ok: true`, steering hash `sha256:3e63228ed79656e8b1fb00cbe9d7aa3ad79fa8c08cd9853153c52b2efaed9d43`, and registration hash `sha256:c801043c822933ec9121f374b8db384cf620052d6f76a803810630b426942b56`. |
| AC7 | Pass | Required validation `repository.nmg-sdlc-smoke` was applicable and passed; `/sdlc-status --json` returned `nextAction.command: /sdlc-draft-issue` from the read-only public smoke clone. |

## Command Evidence

- `cd scripts && npm test -- --runInBand __tests__/sdlc-prompt-snippets.test.mjs __tests__/extension-commands.test.mjs __tests__/plugin-controller-path.test.mjs` — passed: 3 suites, 22 tests; 1 pre-existing skipped test.
- `cd scripts && npm test -- --runInBand` — passed: 46 suites, 633 tests; 1 suite and 2 tests skipped by existing contracts.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 40 genuine issue specs and the required archive/workflow mappings.
- `node scripts/sdlc-steering.mjs validate --project .` — passed with matching steering and registration hashes.
- `node scripts/sdlc-verify-steering.mjs --project . --issue 269 --spec specs/269-fix-project-runtime-loading-under-compiled-omp-host --base HEAD` — passed with no ceiling; both `repository.tests` and `repository.nmg-sdlc-smoke` passed.
- Actual TUI: `omp --no-session --no-extensions --no-skills --extension <checkout>/src/extension.ts --plugin-dir <checkout> --add-dir <checkout> --cwd /tmp/nmg-sdlc-269-yof5zw --auto-approve`, then `/sdlc-draft-issue repair runtime loading` — entered Plan mode and rendered the complete plugin and project prompt without either reported extension error.
- `node scripts/exercise-omp.mjs --cwd /tmp/nmg-sdlc-269-yof5zw -- /sdlc-draft-issue repair runtime loading` — exercised the documented headless guard (`Run /sdlc-draft-issue in the TUI.`); the runner timed out waiting for `agent_end` because interactive registered commands intentionally require the TUI. Actual interactive behavior is covered by the preceding TUI exercise.

## Changed-Path Coverage

- Behavior for `src/sdlc-prompt-snippets.mjs`: launches project fragment loading through Node under a compiled host.
- Behavior for `scripts/plugin-controller-path.mjs` and `src/sdlc-commands.mjs`: separates strict owned-prompt resolution from safe arbitrary-context materialization.
- Coverage for `scripts/__tests__/sdlc-prompt-snippets.test.mjs` and `scripts/__tests__/extension-commands.test.mjs`: compiled-host and unknown-context regressions.
- Behavior for `steering/extensions/nmg-sdlc-smoke.mjs`: read-only clone, source-checkout status exercise, deterministic result classification, and cleanup.
- Configuration for `steering/manifest.json` and `steering/snippets/`: synchronized bounds, current guidance, and required smoke registration.
- Evidence for `NMG_SDLC_STEERING_PLAN.md`: approved concurrent steering update and its exact validation contract.
- Release records for `VERSION`, `package.json`, and `CHANGELOG.md`: synchronized 3.17.0 minor release and Unreleased notes.
