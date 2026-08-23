# Design: Harden execute against transient Herdr lifecycle races

**Issue**: #219
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG

---

## Decision

Keep orchestration synchronous and fail closed. Add bounded recovery only at observed Herdr lifecycle boundaries; do not add a generic retry framework.

## Worker prompt settlement

After `agentPrompt`, read the worker state and handoff. When the handoff is absent and the prompt stalled or the worker settled idle/done early, inspect detection text before pressing Enter. Accept either the full deterministic `workerPrompt` or all three leading prompt-line previews (`You are the`, `Execute the`, and `Write the h`). The matching agent name already binds issue and step. Unrelated text must not trigger input.

After submission, wait for `working` and then a settled state. If the worker is already `working` with no handoff, wait once for settlement before validation. A matching passed non-intervention handoff plus idle/done remains authoritative regardless of prompt command status.

## Interactive review

Treat the UI as three transitions:

1. Observe for Review Mode. Only when it is absent and `/review` remains visibly pasted, press Enter.
2. Observe Review Mode and select PR-style review.
3. Observe the base-branch menu and select literal `main`.

Every observation and key submission remains fail closed.

## Agent startup

If the first `agentStart` call fails, synchronously wait 1,000 milliseconds with `Atomics.wait` and retry once in the same pane. Herdr validates that the pane is still an available shell, so retrying the same target cannot create a second worker. A second failure preserves the existing `agent_start_failed` stop path and leaves the controller-created pane open for inspection.

## Verification

Extend `scripts/__tests__/sdlc-execute.test.mjs` with realistic stdout/stderr command envelopes, early-idle prompt state, unrelated detection text, retained prompts, staged review menus, transient startup recovery, and double-start failure. Run the focused execute/start controller suites. Exercise a disposable remote smoke repository with a PATH-injected wrapper that fails exactly the first `herdr agent start` invocation and delegates every later call to real Herdr.
