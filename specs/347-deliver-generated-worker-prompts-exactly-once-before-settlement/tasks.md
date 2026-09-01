# Tasks: Deliver generated worker prompts exactly once before settlement

**Issue**: #347
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Fix | 1 | [ ] |
| Testing | 1 | [ ] |
| **Total** | 2 | |

---

### T001: Prove live session and deliver generated prompt once before observation

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Fresh standard and remediation workers, including review1/review2, persist `promptDelivery: "pending"` before successful `agentStart` readiness
- [ ] `pending` sends the canonical prompt only through `paneSendText({ paneId, text })`, backed by separate Herdr program/argument-array invocation
- [ ] Successful insertion persists `promptDelivery: "text_inserted"` before `paneSendKeys({ paneId, keys: ["enter"] })`
- [ ] Enter failure retains `text_inserted` and the owned pane; next invocation sends only Enter and never retypes
- [ ] `promptDelivery: "delivered"` is persisted only after Enter succeeds
- [ ] No get/list/read/wait/handoff observation/settlement/close occurs between successful `agentStart` and completed pane delivery
- [ ] Proven pre-insertion process loss retries `agentStart` once in the same pane; unproven failure remains `prompt_pending`
- [ ] Retained delivered and legacy workers receive no pane text or Enter
- [ ] Review prompt content, evidence validation, close-on-stop after delivery, and `src/extension.ts` session provenance remain unchanged

**Notes**: Do not export the helper. Never persist or log prompt text. Do not send a second text insertion after `text_inserted`.

---

### T002: Add start-then-prompt delivery regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] All eight standard step types receive exactly one canonical pane text insertion and one Enter in queue order
- [ ] Fresh remediation, including review remediation, uses the same transport
- [ ] A 256 KiB prompt plus shell-like text remains one literal argument with no shell composition
- [ ] Text success plus Enter failure persists `text_inserted`; recovery sends only Enter and produces no duplicate text
- [ ] Standard and remediation recovery both prove exactly one text insertion
- [ ] No `agentGet` or `agent list` occurs between successful start and Enter
- [ ] Retained delivered and legacy workers remain unprompted
- [ ] Proven process loss restarts once and inserts only into the ready replacement
- [ ] Focused controller suite exits 0
- [ ] Bounded real Herdr harness proves an initially nonexistent advertised JSONL receives exactly one exact canonical user record through pane input

**Notes**: Reuse `makeControllerFixture` / injected `herdr`. Gherkin `@SCN001`–`@SCN004` are this package's scenarios; Jest and the bounded Herdr harness are executable evidence.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
| #347 | 2026-08-31 | Reconciled tasks with pane-input live evidence and crash-safe Enter recovery |
