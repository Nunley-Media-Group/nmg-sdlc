# Implementation Evidence: Bounded bare-execute recovery

**Issue**: #372
**Date**: 2026-09-08
**Stage**: implement
**Status**: Implementation checks passed; downstream verification pending

## Scope and provenance

This is the authorized fresh completion run `12e462aa-25ea-4ace-bc76-478853716583` on `372-complete-bounded-operator-authorized-recovery-of-stopped-delivery`, based on released 3.21.1 and approved spec PR #378. It is not a resume of the archived failed run. No historical runtime, recovery allowance, handoff, or protected branch was reset or adopted.

T001 and T003 retain the runtime and public bare-command implementation already delivered by #374. No production modules, workflows, public commands, README, version files, or installed-plugin files changed. No retry-stopped/reason-token interface was introduced.

T002 restores the actual subprocess `bare CLI recovery` regression from immutable commit `bda29350c915ed80a889a44af6a0febd4c2eb2af`, previously absent from the current supervisor test suite. The subprocess timeout is disabled for this local proof. The fixture invokes the current source's real `sdlc-execute.mjs run` without issue arguments, in a disposable Git repository with local GitHub/Herdr executable adapters. It does not use a consumer project or remote mutation.

## Observable proof

- A persisted legacy implementation remediation at attempt 13 receives exactly one repair-pane dispatch.
- The adapter refuses dispatch unless recovery consumption is already durable in the checkpoint.
- The original attempt number remains in recovery source evidence.
- The repair returns a failed `implementation_failed` handoff, rather than fabricated success.
- After a new Git commit, a second actual bare CLI invocation reports consumed recovery and the dispatch log still contains exactly one dispatch.
- The temporary repository is removed by fixture teardown. No PennyScan state or smoke issue was used.

This closes the missing real CLI proof for AC2/AC3 and AC6, exercising the matching-branch bare path in AC1/SCN001. Existing controller/status/public-command suites cover additional ownership, intervention, passed-handoff, bounded review recovery, and operator behavior. The new test is not evidence of real hosted delivery, a real plugin upgrade, or full AC1-AC6 acceptance by itself. The runtime defect was already fixed in the released base; this change closes a coverage gap, not a new before/after runtime repair.

## Commands and results

All commands below ran against this source checkout, with tool timeout disabled.

1. Initial `npm test -- --runInBand __tests__/sdlc-execute-supervisor.test.mjs -t 'bare CLI recovery'` from `scripts/`: failed before tests because local Jest dependencies were absent (`MODULE_NOT_FOUND`). Resolved with `npm ci --ignore-scripts --no-audit --no-fund`, exit 0, 267 packages installed from the existing lockfile; no dependency manifest changes.
2. Focused command above after dependency installation: exit 0; 1 passed, 19 intentionally excluded by the name filter. Both bare CLI subprocess invocations ran.
3. `npm test -- --runInBand __tests__/sdlc-execute.test.mjs __tests__/sdlc-status.test.mjs __tests__/sdlc-execute-supervisor.test.mjs __tests__/sdlc-commands.test.mjs __tests__/extension-commands.test.mjs __tests__/plugin-surface-verification.test.mjs` from `scripts/`: exit 0; 6 suites, 369 tests passed, no skips; 48.059 seconds reported by Jest. This includes the entire changed supervisor suite and both subprocess invocations.

## Simplification and applicability

Reviewed the restored regression before the six-suite verification. Retained the single existing-file fixture without abstractions, dependencies, source-text assertions, or production changes. No clear behavior-preserving simplification justified departing from the immutable proof. Only the subprocess deadline was disabled. No generated artifacts changed.

The skill-creator contract was read and the complete execute workflow bundle inspected. No bundled file changed; bundle validator, inventory regeneration, and new native workflow exercise are not applicable to this proof-only patch. Existing command and plugin-surface contract suites passed. No claim is made that adapter-backed subprocess proof is a native OMP/Herdr or published-install exercise.

## Publication and downstream ownership

The implementation worker must bind current allowed paths again, publish one scoped conventional commit, reconcile exact upstream HEAD through the owning publication helper, and validate its fresh implement handoff before reporting success. The handoff and publication helper output carry the post-commit result; this pre-commit report does not claim an unobserved pushed SHA.

T004's two managed reviews/fixes, full registered verification with fresh invocation-bound consumer smoke, and exact-head merge/issue closure remain obligations of their owning controller stages. Smoke issue #105 is reserved for final registered verification and was not consumed here. No PR creation, merge, issue closure, candidate cutover, or final verification is claimed by implement.
