# Root Cause Analysis: Deliver generated worker prompts exactly once before settlement

**Issue**: #347
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/
---

## Root Cause

`agentStart` success proves that the OMP terminal is interactively ready, but `agentPrompt` depends on the advertised session JSONL. Live evidence showed `interactive_ready=true` while that JSONL path did not exist, so ten readiness retries could not materialize a user record and ended in `prompt_pending`.

Direct `herdr pane send-text <pane> <canonical-prompt>` followed by `herdr pane send-keys <pane> enter` bypasses that missing-session-file dependency and repeatedly creates exactly one canonical user record. The transport must nevertheless survive an Enter failure without retyping the already inserted text.

All fresh controller-owned prompts use this path: start, implement, review1, fix1, review2, fix2, verify, deliver, and remediation workers. Retained workers with delivered or legacy unknown state remain observation-only.

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-execute.mjs` | Starts ready workers, checkpoints pane-input delivery substates, recovers pending delivery, and observes only after Enter succeeds |
| `scripts/__tests__/sdlc-execute.test.mjs` | Deterministic standard, review, remediation, large-argument, crash-recovery, ordering, and retained-worker coverage |
| `src/extension.ts` | Keeps `session_start` `appendEntry("com.nmg-sdlc.run", run)` unchanged |

### Triggering Conditions

- Fresh controller-owned worker for any standard, review, or remediation step
- `agentStart` reports interactive readiness
- Session-backed prompt dispatch cannot create the advertised JSONL user record
- The checkpoint records `promptDelivery: "pending"` or `"text_inserted"` and no valid handoff exists yet

---

## Fix Strategy

### Approach

Keep `session_start` unchanged. Replace controller-owned `agentPrompt` dispatch with explicit pane operations represented as program plus argument arrays:

1. Persist a new worker with `promptDelivery: "pending"` before `agentStart`.
2. Require successful `agentStart`; success is Herdr's interactive-readiness proof.
3. For `pending`, invoke `herdr pane send-text <paneId> <prompt>`. Pass the entire prompt as one argument, regardless of size or shell-like content.
4. After successful insertion, persist `promptDelivery: "text_inserted"` before sending Enter.
5. For `text_inserted`, invoke `herdr pane send-keys <paneId> enter`. A failure retains the pane and substate as `prompt_pending`; recovery sends only Enter.
6. After Enter succeeds, persist `promptDelivery: "delivered"`. Only then may the controller call `agentGet`, `agentRead`, `agentWait`, `agent list`, handoff observation, settlement, or pane close.
7. If text insertion proves `process_lost` or `agent_not_found`, retry `agentStart` once in the same pane and retry insertion. Generic or unproven failures remain pending.

Use the same helper for fresh standard and remediation workers, including review1 and review2. Review prompt contents and artifact validation remain unchanged; only their transport changes. Pending recovery regenerates the canonical prompt from checkpoint identity. Retained workers whose state is `delivered` or absent are never sent text or Enter.

### Crash-safety invariant

`pending → text_inserted → delivered` is monotonic. Text is inserted only from `pending`; Enter is sent only from `text_inserted`; observation begins only from `delivered`. Thus an Enter failure cannot duplicate the canonical prompt text or user record.

### Herdr adapter

`defaultHerdr` maps pane input without shell composition:

```javascript
paneSendText: ({ paneId, text }) =>
  invoke(['pane', 'send-text', paneId, text])
paneSendKeys: ({ paneId, keys }) =>
  invoke(['pane', 'send-keys', paneId, ...keys])
```

No prompt text is logged, persisted, or composed as shell source.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Remove `com.nmg-sdlc.run` append** | Stop empty-session settlement by deleting the session_start entry | Smaller execute change | Drops run provenance; issue forbids this | Rejected |
| **B: Treat pre-prompt idle as success** | Skip missing_handoff when no prompt was sent | Avoids false fail | Abandons the step with no work | Rejected |
| **C: Ready agent + pane text/Enter + checkpointed substate** | Bypass session-file prompt dispatch and recover Enter independently | Exact canonical user record; no duplicate text | Requires one additional checkpoint write | **Selected** |

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Execute controller | Jest with injected `herdr` | All standard steps, remediation, review protocol, huge prompt arguments, process-loss restart, insertion/Enter failure substates, retained workers, and no observation before delivery |
| Real Herdr harness | Bounded disposable pane | Successful `agentStart` advertises an initially nonexistent JSONL; pane text plus Enter creates exactly one exact canonical user record |
| Feature | Gherkin @SCN001–@SCN004 @regression | this package; Jest and the bounded harness are executable evidence |

---

## Open Questions

- None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
| #347 | 2026-08-31 | Reconciled design with pane-input live evidence and crash-safe delivery substates |
