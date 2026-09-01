# Verification Report: Deliver generated worker prompts exactly once before settlement

**Date**: 2026-08-31
**Issue**: #347
**Status**: Pass
**Scope**: Corrected implementation against the approved `agentPrompt` contract

## Result

The controller now delivers each fresh canonical worker prompt through Herdr `agentPrompt` only, after the started worker is proven present on its owned pane. It invokes `agentPrompt` once per live session, preserves the approved one-shot restart for proven pre-prompt process loss, and retains unproven delivery as `prompt_pending` without observing, settling, or closing the worker.

After successful prompt submission, the controller boundedly ignores initial stale `idle` or `done` observations. It proceeds only after the worker reaches `working` or `blocked`, writes a valid handoff, or is proven lost. Exhausting the bounded activation observations retains the worker as `prompt_pending`; it does not produce `missing_handoff` or close the pane.

Enter remains recovery-only. The controller sends Enter only after `agentPrompt` reports a stall and the exact prompt is positively visible in agent detection output. Successful `agentPrompt` delivery never triggers Enter, and no recovery path retypes the prompt.

The controller-owned review protocol remains intact and uses the same `agentPrompt` transport. Matching retained delivered workers remain unprompted.

## Deterministic Evidence

Command:

```text
cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs
```

Result: exit 0; 1 suite passed; 228/228 tests passed.

Regressions cover delayed `idle → working` activation for fresh standard, review, and remediation workers. Each case asserts exactly one prompt call, no Enter, valid completion, and no premature pane close. Additional cases assert one failed readiness dispatch, bounded `prompt_pending` retention, retained recovery, positive-visibility-only Enter recovery, and no duplicate prompt delivery.

## Bounded Real Herdr Harness

A disposable OMP worker was started in an owned sibling pane. `herdr agent start h347prompt --kind omp --pane w14:p6Z` returned `interactive_ready: true` and `agent_status: idle` with session JSONL:

```text
/Users/rnunley/.omp/agent/sessions/-tmp-tmp.o0nweUdgs3/2026-09-01T03-22-06-561Z_01a05afd-0561-7750-8aac-3267c4e92ae6.jsonl
```

The harness invoked `herdr agent prompt` exactly once with the canonical harness prompt and `--wait --timeout 30000`. The command exited 0. The JSONL contains exactly one exact `role: "user"` record for that prompt and one assistant response `NMG_SDLC_347_AGENTPROMPT_OK`.

A subsequent `herdr agent get h347prompt` proved the same worker and pane remained live and idle after delivery; the harness therefore observed no premature close. The owned disposable pane was then closed explicitly. No pane text injection or primary Enter delivery was used. The prompt prohibited tools, file changes, commands, and external actions.

## Scope Limits

Per direction, verification did not run the full controller suite, open a pull request, execute the mutable smoke-issue lifecycle, or alter `NMG_SDLC_SMOKE_ISSUES`.
