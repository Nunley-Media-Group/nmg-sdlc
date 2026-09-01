# Verification Report: Deliver generated worker prompts exactly once before settlement

**Date**: 2026-08-31
**Issue**: #347
**Status**: verification_not_ready
**Scope**: Implementation proof only; full mutable verification remains required

## Result

The reproduced failure was OMP's interactive large-paste menu, not Herdr command supervision. OMP 18.0.11 defaults `paste.largeMenuThreshold` to 100 lines. The generated issue #347 verify prompt is 671 lines and 34,473 UTF-8 bytes. Herdr 0.8.2 queues the bracketed paste, schedules Enter after 300 ms, and returns success before OMP has durably accepted a user message; the asynchronous large-paste menu can therefore consume the submission path while the worker remains idle and its advertised JSONL remains absent.

The controller now writes an OMP overlay at `.omp/sdlc/omp-controller.yml` with `paste.largeMenuThreshold: 0` and starts every newly owned OMP worker with native arguments `-- --config <overlay>`. This disables only the interactive choice menu for controller-owned workers; large prompts still use OMP's paste attachment path. Prompt delivery remains one nonblocking `herdr agent prompt <name> <exact-canonical-prompt>` invocation. No pane text or routine Enter delivery was added.

Canonical worker prompts are trimmed at their source boundary so OMP's submission normalization preserves the exact generated content in the user record. The controller still preserves the approved one-shot restart for proven pre-prompt process loss, boundedly ignores stale `idle` or `done` observations after successful submission, and retains unproven delivery as `prompt_pending` without observing, settling, or closing the worker.

Enter remains recovery-only. The controller sends Enter only after `agentPrompt` reports a stall and the exact prompt is positively visible in agent detection output. Successful `agentPrompt` delivery never triggers Enter, and no recovery path retypes the prompt. The controller-owned review protocol remains intact and uses the same transport; matching retained delivered workers remain unprompted.

## Deterministic Evidence

Command:

```text
cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs
```

Result: exit 0; 1 suite passed; 229/229 tests passed.

The realistic regression generates the repository's issue #347 verify prompt, proves it exceeds OMP's 100-line interactive-menu threshold, proves it has no trailing submission whitespace, and asserts that the adapter first starts OMP with the controller overlay before passing that exact prompt as one `agentPrompt` argument without `--wait`. Existing delayed `idle → working` activation cases cover fresh standard, review, and remediation workers; each asserts exactly one prompt call, no Enter, valid completion, and no premature pane close. Additional cases assert one failed readiness dispatch, bounded `prompt_pending` retention, retained recovery, positive-visibility-only Enter recovery, and no duplicate prompt delivery.

## Bounded Real Herdr Harness

A fresh OMP worker named `h347final` was started in owned pane `w14:p76` through the production `defaultHerdr` adapter with `NMG_SDLC_SMOKE_ISSUES=39,40`. The adapter's pane split exited 0, and its configured `agentStart` exited 0 at `interactive_ready: true`, `agent_status: idle`, revision 2, with session JSONL:

```text
/Users/rnunley/.omp/agent/sessions/--Volumes-Fast Brick-source-repos-nmg-sdlc-spec343--/2026-09-01T03-44-02-622Z_01a05b11-1a3e-7719-b597-594095caee08.jsonl
```

The harness generated the prompt with `node scripts/sdlc-execute.mjs worker-prompt --step verify --issue 347`, removed only the CLI's terminal record newline, and passed the resulting 34,473-byte, 671-line canonical string through `defaultHerdr.agentPrompt` exactly once. The full spawn result was status 0, signal null, error null, empty stderr, response `cli:agent:prompt`, and the expected initial stale idle revision 2. A concurrently started `herdr agent wait h347final --until working --timeout 30000` observer then recorded `working` at revision 7.

The exact workflow turn was aborted with Escape immediately after the required working transition so the bounded harness could not perform the full controller verification or queued smoke work. The worker returned to idle at revision 81. Its JSONL contains one user record and exactly one byte-for-byte match for the canonical 34,473-byte prompt. The owned pane was then closed. Prompt delivery used no pane text and no Enter recovery.

## Scope Limits

Per direction, verification did not run the full controller, open a pull request, execute or alter the queued smoke issues, or change `NMG_SDLC_SMOKE_ISSUES`. Issue #347 remains `verification_not_ready` until the full controller verify worker runs with `NMG_SDLC_SMOKE_ISSUES=39,40`.
