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
- [ ] Unexported `deliverGeneratedPromptOnce({ herdr, agentName, paneId, prompt, start })` exists next to `waitForWorkerSettlement`
- [ ] Gone means `!workerStillPresent`; idle/done on that pane is live
- [ ] Worker gone before first prompt: `waitForAgentStartRetry` then `start()` once; start command fail → `agent_start_failed`; still gone → `process_lost`; never `missing_handoff`
- [ ] Live session receives `herdr.agentPrompt({ name, prompt })` exactly once before `observeExpectedHandoff`
- [ ] Main `s<N>-<step>` and rem `r<N>-<step>` fresh non-review launches both use the helper
- [ ] Existing `!commandSucceeded(started)` one-shot start retry before ownership persist is unchanged
- [ ] Live rem resume no longer calls `agentPrompt`; paste/working recovery only, matching retained `s<N>-<step>`
- [ ] `submitReviewProtocol` and review resume are unchanged
- [ ] After `delivered: true`, missing handoff still `missing_handoff`; `stopResult` still closes owned panes unless `--retain-worker`
- [ ] `src/extension.ts` `session_start` `appendEntry("com.nmg-sdlc.run", run)` is unchanged

**Notes**: Do not export the helper. Do not send a second generated prompt to a session that already received this invocation's prompt. `retryPromptSubmission` is Enter recovery, not a generated prompt.

---

### T002: Add start-then-prompt delivery regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Fresh `s42-verify` (or `s42-start`): first `agentStart` succeeds, worker absent before prompt, second `agentStart` same name/pane succeeds, then exactly one `agentPrompt`; result is not `missing_handoff` solely from the pre-prompt absence
- [ ] Fresh worker still listed idle after start and before prompt: exactly one `agentPrompt` occurs before any `missing_handoff` stop
- [ ] After that one prompt is recorded in `fixture.prompts`, missing handoff + idle/done still ends `failed.reasonCode: missing_handoff` and closes the owned pane
- [ ] Same post-delivery missing handoff with `--retain-worker` keeps the pane open
- [ ] Matching retained live `s42-start` with detection already containing the generated prompt: `fixture.prompts` does not gain another generated prompt
- [ ] Live rem worker already idle without handoff: no new generated `agentPrompt` row for `r42-verify`
- [ ] Existing review-protocol tests still send the review prompt and do not gain `/review` key bursts
- [ ] Existing `retries one transient agent startup failure in the same pane` and `fails closed after two agent startup failures` still pass
- [ ] `cd scripts && npm test -- --runInBand __tests__/sdlc-execute.test.mjs` exits 0

**Notes**: Reuse `makeControllerFixture` / injected `herdr`. Gherkin `@SCN001`–`@SCN002` are this package's scenarios; Jest is the executable evidence.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #347 | 2026-08-31 | Initial defect report |
