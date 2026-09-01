# Verification Report: Deliver generated worker prompts exactly once before settlement

**Date**: 2026-08-31
**Issue**: #347
**Status**: verification_not_ready
**Scope**: Implementation proof only; full mutable verification remains required

## Result

The controller now delivers each fresh canonical worker prompt through one nonblocking Herdr `agentPrompt` invocation, after the started worker is proven present on its owned pane. The adapter omits `--wait`, so command supervision cannot terminate a blocking prompt wait before submission becomes durable. The controller preserves the approved one-shot restart for proven pre-prompt process loss and retains unproven delivery as `prompt_pending` without observing, settling, or closing the worker.

After successful prompt submission, the controller boundedly ignores initial stale `idle` or `done` observations. It proceeds only after the worker reaches `working` or `blocked`, writes a valid handoff, or is proven lost. Exhausting the bounded activation observations retains the worker as `prompt_pending`; it does not produce `missing_handoff` or close the pane.

Enter remains recovery-only. The controller sends Enter only after `agentPrompt` reports a stall and the exact prompt is positively visible in agent detection output. Successful `agentPrompt` delivery never triggers Enter, and no recovery path retypes the prompt.

The controller-owned review protocol remains intact and uses the same `agentPrompt` transport. Matching retained delivered workers remain unprompted.

## Deterministic Evidence

Command:

```text
cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs
```

Result: exit 0; 1 suite passed; 229/229 tests passed.

Regressions assert that the production adapter invokes `herdr agent prompt <name> <prompt>` without `--wait`. Existing delayed `idle → working` activation cases cover fresh standard, review, and remediation workers; each asserts exactly one prompt call, no Enter, valid completion, and no premature pane close. Additional cases assert one failed readiness dispatch, bounded `prompt_pending` retention, retained recovery, positive-visibility-only Enter recovery, and no duplicate prompt delivery.

## Bounded Real Herdr Harness

A disposable OMP worker was started in an owned sibling pane. `herdr agent start h347nowait2 --kind omp --pane w14:p72` returned `interactive_ready: true`, `agent_status: idle`, and revision 2 with session JSONL:

```text
/Users/rnunley/.omp/agent/sessions/-tmp-tmp.DM8jIgfB5t/2026-09-01T03-29-21-267Z_01a05b03-a773-70c6-821c-fb5a39920b40.jsonl
```

The harness started a bounded `herdr agent wait h347nowait2 --until working --timeout 30000` observer, then invoked `herdr agent prompt h347nowait2 <canonical-prompt>` exactly once without `--wait`. Prompt submission exited 0 in 0.03 seconds and returned the initial stale idle revision 2. The observer then recorded `working` at revision 6, and `herdr agent wait h347nowait2 --timeout 30000` recorded settled `idle` at revision 218.

The JSONL contains exactly one `role: "user"` record containing `NMG_SDLC_347_NONBLOCKING_CANONICAL_HARNESS`. The owned disposable pane was closed only after idle settlement. No pane text injection or Enter delivery was used. The prompt prohibited tools and external actions.

## Scope Limits

Per direction, verification did not run the full controller, open a pull request, execute or alter the queued smoke issues, or change `NMG_SDLC_SMOKE_ISSUES`. Issue #347 remains `verification_not_ready` until the full controller verify worker runs with `NMG_SDLC_SMOKE_ISSUES=39,40`.
