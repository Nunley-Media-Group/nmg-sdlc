# Verification Report: Deliver generated worker prompts exactly once before settlement

**Date**: 2026-08-31
**Issue**: #347
**Reviewer**: Codex
**Scope**: Implementation verification against the approved defect specification

---

## Executive Summary

The implementation satisfies the source-level acceptance criteria and task contract. Fresh non-review workers persist pending prompt ownership before startup, dispatch the generated prompt before handoff observation, retry one confirmed pre-prompt process loss in the same pane, avoid duplicate generated prompts for retained delivered workers, preserve review-worker behavior, and preserve post-delivery `missing_handoff` handling.

The focused controller suite passed 225/225 tests, and the deterministic full repository test validation passed. The mandatory real smoke validation failed during issue #39's `implement` step with `prompt_pending`; the owned worker remained open because prompt delivery could not be proven, and no exact-head merged-PR and closed-issue lifecycle proof was produced. That required failed result sets the deterministic ceiling and overall status to **Fail**. Local success cannot substitute for the failed smoke lifecycle gate.

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 5 |
| **Overall** | **4.7** |

### Implementation Status: Fail

**Total Issues**: 1 verification blocker; 0 source-code defects found.

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.omp/sdlc/verification/347.json`
- Identity head: `c0f73eb911d10df470fb5b502738aafd06b9fcb8`
- Coverage: declared 2, recorded 2, complete `true`, missing 0, duplicate 0, unknown 0
- Ceiling: **Fail**
- Constraint: `Pass` and `PR Evidence Pending` are forbidden because required validation `repository.nmg-sdlc-smoke` failed.

---

## Issue Scope

- Active issue: #347
- Spec: `specs/347-deliver-generated-worker-prompts-exactly-once-before-settlement`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1]; FR [FR1, FR2]; tasks [T001, T002]; scenarios [SCN001]
- Regression: AC [AC2]; FR [FR3, FR4]; scenarios [SCN002]

<!-- nmg-sdlc-issue-scope: {"issueNumber":347,"specPath":"specs/347-deliver-generated-worker-prompts-exactly-once-before-settlement","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1"],"functionalRequirements":["FR1","FR2"],"tasks":["T001","T002"],"scenarios":["SCN001"]},"regression":{"acceptanceCriteria":["AC2"],"functionalRequirements":["FR3","FR4"],"scenarios":["SCN002"]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required
- Required live smoke: Fail — issue #39 stopped at `implement` with `prompt_pending`; issue #40 was not reached.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Fresh non-review workers receive their generated prompt before settlement observation, with at most one same-pane restart for confirmed pre-prompt process loss. | Pass | `scripts/sdlc-execute.mjs:1046-1215`, `scripts/sdlc-execute.mjs:2078-2162`, and `scripts/sdlc-execute.mjs:2727-2843`; ordered regression cases at `scripts/__tests__/sdlc-execute.test.mjs:3938-4242`; focused suite passed 225/225. |
| AC2 | Retained delivered workers are not prompted again; post-delivery missing handoff and review protocols retain existing behavior. | Pass | Pending/delivered ownership recovery at `scripts/sdlc-execute.mjs:1831-1953`; live remediation recovery at `scripts/sdlc-execute.mjs:2165-2216`; post-delivery close/retain assertions at `scripts/__tests__/sdlc-execute.test.mjs:4212-4242`; review protocol remains routed through `submitReviewProtocol`. |

## Regression Obligations

- [x] AC2 / FR3 / SCN002: Matching retained workers with established delivery are observed without another generated prompt.
- [x] AC2 / FR4 / SCN002: A missing handoff after delivery remains `missing_handoff`; default handling closes the owned pane and `--retain-worker` leaves it open.
- [x] AC2 / SCN002: Review workers continue through `submitReviewProtocol`; the generated non-review prompt path does not replace their interactive protocol.
- [x] Existing startup retry: one transient start failure retries in the same pane; two failed starts remain `agent_start_failed`.
- [x] `src/extension.ts:95` retains `appendEntry("com.nmg-sdlc.run", run)`.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Prove live session and deliver generated prompt once before observation. | Complete | `workerPresence` distinguishes present, absent, and unknown; `deliverGeneratedPromptOnce` handles bounded readiness, same-pane process-loss retry, proof, and conservative `prompt_pending` retention. Both fresh main and remediation paths use it. |
| T002 | Add start-then-prompt delivery regressions. | Complete | Tests cover delayed readiness, pre-dispatch and post-dispatch loss, pending recovery, stall proof, post-delivery missing-handoff close/retain behavior, retained remediation, review protocol, and startup retry. Focused suite passed 225/225. |

---

## Architecture Assessment

### Scores and Findings

| Area | Score (1-5) | Findings |
|------|-------------|----------|
| SOLID Principles | 4 | Prompt readiness, presence, delivery, settlement, and recovery use focused helpers and injected Herdr operations. `runExecute` remains large, but the change reuses one delivery path rather than adding a second orchestration convention. |
| Security | 5 | No new shell interpolation, credential handling, remote mutation, or unvalidated user-controlled command construction. Worker identity remains bound to project/run/issue/step/pane ownership. Unknown presence fails closed as `prompt_pending`. |
| Performance | 4 | Readiness retries are bounded to 10; process-loss restart is one-shot; settlement remains state-based without an arbitrary wall-clock deadline. Additional Herdr observations occur only during dispatch or pending recovery. |
| Testability | 5 | Herdr operations and pauses are injected. Deterministic fixtures assert start, prompt, observation, restart, retention, and close ordering across success and failure paths. |
| Error Handling | 5 | Present/absent/unknown prevents transient observation errors from being mislabeled as process loss. Stable reason codes distinguish `agent_start_failed`, `process_lost`, `prompt_pending`, `missing_handoff`, and `worker_failed`; unproven delivery retains the pane for intervention. |

**Architecture average**: 4.6/5

### SOLID Detail

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | Prompt readiness, presence, dispatch proof, settlement, and recovery are separated into named helpers, though `runExecute` remains a large orchestration function. |
| Open/Closed | 4 | Main and remediation worker paths reuse one delivery helper; no parallel prompting implementation was introduced. |
| Liskov Substitution | 5 | Injected Herdr fixtures remain substitutable for the live adapter and cover structured and thrown outcomes. |
| Interface Segregation | 4 | Helpers consume the existing Herdr adapter without adding a broad public interface. |
| Dependency Inversion | 5 | Controller behavior depends on injected `herdr` and `run` adapters rather than constructing process clients inside delivery logic. |

### Layer Separation and Dependency Flow

The fix remains in the delivery controller and its tests. It does not move lifecycle decisions into the extension factory, workflow Markdown, steering provider, or worker agents. Prompt state is persisted in the existing run checkpoint and recovered before normal step progression.

---

## Security Assessment

- Authentication and authorization: Not applicable; no authentication surface changed.
- Input validation: Pass; existing normalized issue, run, worker, and pane identities remain enforced.
- Injection prevention: Pass; no new shell-source interpolation or external command construction.
- Data protection: Pass; no secrets or sensitive payload logging added.
- Fail-closed behavior: Pass; unreadable presence retains an owned worker as pending rather than closing it or duplicating its prompt.

---

## Performance Assessment

- Async/state waiting: Pass for the controller contract; worker settlement remains state-based without arbitrary wall-clock termination.
- Retry bounds: Pass; prompt readiness is capped at 10 retries and process-loss restart remains one-shot.
- Resource management: Pass; post-delivery failure preserves the existing close policy, while unproven prompt delivery intentionally retains the pane for recovery.
- Memory and scan bounds: Pass; no unbounded collection or repository scan was added by the prompt-delivery path.

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Executable Coverage | Passes |
|---------------------|-------------|-------------------------|--------|
| AC1 | Yes, SCN001 | Yes, Jest controller regressions | Yes |
| AC2 | Yes, SCN002 | Yes, Jest controller regressions | Yes |

### Coverage Summary

- Feature scenarios: 2/2 mapped to executable Jest evidence.
- Focused controller tests: 225/225 passed; 1/1 suite passed; exit 0.
- Full repository tests: exit 0 under deterministic validation `repository.tests`.
- Exercise test: Not applicable. The scoped diff changes no `workflows/` or `agents/` file, so the plugin workflow exercise condition was not triggered.
- Real smoke lifecycle: Failed. The retained smoke clone recorded issue #39 `implement` as `prompt_pending`; no workflow-recorded exact-head merge and closed-issue proof was produced.

---

## Real Smoke Lifecycle Evidence

| Item | Result |
|------|--------|
| Clone | Pass — full single-branch clone retained at `/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/nmg-sdlc-smoke-Nq9nB3`. |
| Explicit queue | `#39`, then `#40`. |
| Closing-PR baselines | Pass — both issues were open with no linked closing PRs before execution. |
| Controller execution | Fail — `sdlc-execute run #39 #40` exited 1 and stopped on #39 `implement`. |
| Recorded failure | Retained clone `.omp/sdlc/run.json`: `failed.reasonCode` = `prompt_pending`, `intervention` = `true`, and worker `s39-implement.promptDelivery` = `pending`. |
| Exact-head merged PR and issue closure | Missing for both configured issues. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` | Pass | `.omp/sdlc/verification/347.json`: `npm test -- --runInBand` exited 0. |
| `repository.nmg-sdlc-smoke` | Fail | `.omp/sdlc/verification/347.json`: smoke execution exited 1; retained run state records issue #39 `implement` failure `prompt_pending`. |

**Gate Summary**: 1/2 passed, 1 failed, 0 incomplete. Coverage is complete (2 declared, 2 recorded), and the aggregate ceiling is **Fail**.

---

## Fixes Applied

No verification-time fixes were applied. The source review found no safe local issue-#347 defect. The remaining failure belongs to the mandatory real lifecycle validation and cannot be converted to a pass from local evidence.

---

## Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| High | Testing | `.omp/sdlc/verification/347.json` and retained smoke clone `.omp/sdlc/run.json` | Required `repository.nmg-sdlc-smoke` failed on issue #39 `implement` with `prompt_pending`; no exact-head merged-PR and closed-issue lifecycle evidence exists for this verification invocation. | The real worker's prompt delivery could not be proven, so the controller correctly retained the pane for intervention. No issue-#347 source defect was isolated that could be safely changed during verification, and weakening or bypassing the required provider would violate the steering gate. |

---

## Positive Observations

- Prompt ownership is persisted before worker startup, so controller interruption cannot silently erase pending delivery state.
- Presence uncertainty is distinct from confirmed process loss, preventing destructive cleanup on transient Herdr observation failures.
- Ordered event assertions verify prompt dispatch before agent observation and cover same-pane replacement after confirmed loss.
- Review-worker protocol and post-delivery missing-handoff policy remain independently covered.

---

## Recommendations Summary

### Before PR (Must)

- [ ] Resolve or recover the retained smoke worker's pending prompt through the owning workflow, provision a genuinely fresh approved smoke queue if the current issues become terminal, and rerun deterministic steering verification until `repository.nmg-sdlc-smoke` records exact-head merge plus issue closure evidence for every configured issue.

### Short Term (Should)

- [x] Keep the focused controller regression suite passing; current result is 225/225.

### Long Term (Could)

- [ ] Continue extracting cohesive controller concerns only when a concrete change requires it; avoid a broad refactor during this defect fix.

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `scripts/sdlc-execute.mjs` | 0 | Prompt delivery, persistence, recovery, settlement, and stop behavior reviewed. |
| `scripts/__tests__/sdlc-execute.test.mjs` | 0 | Relevant fresh, retained, remediation, review, and error-path regressions reviewed. |
| `src/extension.ts` | 0 | Session-start run provenance remains present and unchanged by the scoped diff. |
| `specs/347-deliver-generated-worker-prompts-exactly-once-before-settlement/{requirements.md,design.md,tasks.md,feature.gherkin}` | 0 | All four artifacts identify issue #347 and status Approved. |
| `steering/manifest.json` and registered runtime files | 0 | Deterministic runner loaded two declared validations with complete coverage. |
| `.omp/sdlc/verification/347.json` | 1 | Required smoke provider failed during issue #39 start. |

---

## Recommendation

**Needs verification rerun before PR**

The implementation and local regression evidence satisfy the approved defect contract, but the mandatory real smoke gate failed because prompt delivery to the issue #39 implement worker was not proven. Overall verification remains **Fail** until a fresh smoke lifecycle produces the required exact-head merged-PR and closed-issue evidence.

---

## Post-Verification Remediation Evidence

The retained smoke failure isolated a real transport defect: `agentStart` reported `interactive_ready=true`, but the advertised session JSONL did not exist, so `agentPrompt` could not create a user record. The controller now uses explicit pane text plus Enter with checkpointed `pending → text_inserted → delivered` substates.

- Focused controller suite: **206/206 passed**, one suite, exit 0.
- Bounded real Herdr harness: `agentStart` succeeded for a disposable controller-owned pane; its advertised JSONL was absent before input; `pane send-text` and `pane send-keys enter` both exited 0; the JSONL then existed with exactly one exact canonical user record among nine records.
- The disposable harness pane closed successfully.
- The full controller and mutable smoke lifecycle were not rerun, as directed. The earlier steering ceiling therefore remains **Fail** pending a future owning-workflow verification run.