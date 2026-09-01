# Verification Report: Deliver generated worker prompts exactly once before settlement

**Date**: 2026-09-01
**Issue**: #347
**Status**: verification_not_ready
**Scope**: Current implementation proof only; full mutable verification remains required

## Result

The controller delivers each fresh canonical worker prompt through one nonblocking Herdr `agentPrompt` invocation after proving the worker is present on its owned pane. Controller-owned OMP workers start with `.omp/sdlc/omp-controller.yml`, which sets `paste.largeMenuThreshold: 0`; this bypasses OMP's asynchronous large-paste choice menu while preserving the native paste attachment path. No pane text delivery or routine Enter submission was added.

After one accepted standard, review, or remediation prompt, the controller persists versioned `promptDelivery: "activating"` before bounded activation. Only working, blocked, or a valid expected handoff advances the worker to `delivered`. Activation exhaustion keeps `activating`; stop reports `prompt_pending` and retains the pane. A resumed `activating` worker re-enters bounded observation without invoking `agentPrompt` again.

The same invariant covers live review-remediation workers. Their initial protocol submission receives the activation callback, while a review-remediation worker whose activation resumed earlier in the invocation bypasses `submitReviewProtocol` and proceeds directly to evidence observation. This prevents a second protocol prompt and avoids the prior missing-callback `TypeError`.

Unversioned legacy `delivered` migrates to versioned `activating` because the old checkpoint cannot prove activation completed. Unsupported delivery states fail checkpoint validation. Positive-visibility-only Enter recovery, exact canonical prompt bytes, the one-shot pre-prompt process-loss restart, and matching delivered-worker no-reprompt behavior remain unchanged.

## Deterministic Evidence

Command:

```text
cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs
```

Result: exit 0; 1 suite passed; 233/233 tests passed.

Coverage includes:

- standard, review, and remediation delayed `idle → working` with persisted `activating`, exactly one prompt, no Enter, valid completion, and no premature close;
- controller failure immediately after accepted submission, followed by activation-only resume without another prompt;
- bounded activation exhaustion across invocations, retaining versioned `activating` and issuing zero additional prompt calls;
- live review-remediation activation crash/resume, one protocol prompt total, valid review evidence, and owned-pane completion;
- unversioned delivery-state migration and unsupported-state rejection;
- the realistic 671-line canonical verify prompt and controller OMP large-paste overlay.

Current-spec verification:

```text
node scripts/verify-current-specs.mjs
```

Result: exit 0; 66 genuine issue specs, 16 required archive entries, 16 rewrite capabilities, 16 active workflow mappings, and 1 deprecated stub.

The approved contract files `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` are byte-equivalent to commit `2a3c500`; implementation refinements did not rewrite them outside the specification workflow.

## Bounded Real Herdr Harness

A fresh OMP worker named `h347final` was started in owned pane `w14:p76` through the production `defaultHerdr` adapter with `NMG_SDLC_SMOKE_ISSUES=39,40`. Start exited 0 at `interactive_ready: true`, `agent_status: idle`, revision 2. The harness generated the issue #347 verify prompt with `node scripts/sdlc-execute.mjs worker-prompt --step verify --issue 347` and submitted the resulting 34,473-byte, 671-line canonical string through `defaultHerdr.agentPrompt` exactly once.

Prompt submission returned status 0, signal null, error null, empty stderr, and the expected initial stale idle revision 2. A concurrent bounded observer recorded working at revision 7. The JSONL contained one user record and one byte-for-byte canonical prompt match. The turn was aborted immediately after working so the harness could not execute the full verification workflow or queued smoke work; the worker returned idle and the owned pane was closed.

## Scope Limits

No full controller run, mutable smoke run, pull-request operation, or smoke issue mutation was performed for the activation refinements. Prior stale claims about deterministic smoke execution at head `b432fb1` are not evidence for the post-fix implementation and are intentionally excluded.

Issue #347 remains `verification_not_ready`. The retained failed handoff requires a future full controller verify worker with `NMG_SDLC_SMOKE_ISSUES=39,40` before delivery can proceed.
