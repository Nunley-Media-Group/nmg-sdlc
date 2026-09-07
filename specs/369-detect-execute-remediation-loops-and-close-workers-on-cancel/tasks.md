# Tasks: Detect execute remediation loops and close workers on cancel

**Issue**: #369
**Date**: 2026-09-06
**Status**: Approved
**Author**: NMG

## Implementation

### T001: Bound remediation by step progress
**File(s)**: scripts/sdlc-execute.mjs, scripts/__tests__/sdlc-execute.test.mjs
**Type**: Modify
**Acceptance**:
- [ ] AC1/AC2/AC4/AC5: one worker at a time; two completed unsuccessful remediations stop before a third; successful advancement resets the streak for the next stage.
- [ ] AC3: unchanged blocked/intervention and loop stops survive reinvocation, while validated repaired passed evidence advances.
- [ ] Foreign remediation workers are never adopted or closed; failed starts retain ownership until cleanup resolves.

### T002: Supervise real controller cancellation
**File(s)**: scripts/sdlc-execute.mjs, scripts/sdlc-execute-supervisor.mjs, scripts/__tests__/sdlc-execute-supervisor.test.mjs
**Type**: Create and Modify
**Acceptance**:
- [ ] AC6: SIGINT, SIGTERM, and invoking-job loss stop the owned blocking controller group and close all owned panes, including pending prompt panes.
- [ ] AC7: --retain-worker preserves panes without suppressing cancelled failure persistence.
- [ ] Preserve latest checkpoint updates and exact lease ownership; retain diagnostic state on cleanup failure.

### T003: Verify and document delivery
**File(s)**: README.md, CHANGELOG.md, VERSION, package.json, specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/verification-report.md
**Type**: Modify and Create
**Acceptance**:
- [ ] Document public progress-stop and cancellation semantics without adding a reason-code policy table or changing review prompts.
- [ ] Record exact focused/full validation commands and outcomes plus live cancellation and consumer delivery proof.
- [ ] Complete exact-head contribution delivery, synchronize release artifacts, and validate the installed candidate in a fresh session.

### T004: Reinforce operator guidance and smoke boundaries
**File(s)**: README.md, steering/snippets/project-tech.md, steering/snippets/project-product.md
**Type**: Modify
**Acceptance**:
- [ ] AC8: registered steering restricts smoke edits to named nmg-sdlc verification fixtures, requires causal classification before repair, and stops unchanged/no-progress or unrelated smoke failures.
- [ ] AC9: README provides a complete supported operating guide with concrete commands, safe recovery, explicit smoke setup, and truthful terminal delivery criteria.
- [ ] Execute native `/review` against literal `main`, fix all actionable findings, and reverify affected behavior.

### T005: Close confirmed supervision and recovery gaps
**File(s)**: src/process-supervision.mjs, src/sdlc-verification-runtime.mjs, scripts/exercise-omp.mjs, steering/extensions/nmg-sdlc-smoke.mjs, scripts/sdlc-execute-supervisor.mjs, scripts/sdlc-execute.mjs, scripts/__tests__/
**Type**: Modify
**Acceptance**:
- [ ] AC10: a dead leader never substitutes for proof its POSIX group is gone; clear owned descendants and descendant-held pipes before reporting terminal cleanup.
- [ ] Use the shared termination contract across supervisor, command verification, smoke command supervision, and OMP exercises; preserve platform selection and fail-closed cleanup errors.
- [ ] AC3/AC4: a validated passed delivery handoff escapes a stopped remediation checkpoint through the existing exact-head merge and issue-closure checks.
- [ ] Preserve execute usage exit status 2 and assert unexpected-controller-loss descendant death before fixture teardown.
- [ ] AC6: whole invoking-job process-tree cancellation cannot kill the reparented supervisor; no controller starts before bootstrap exit, and authenticated connection loss triggers owned cleanup.

### T006: Repair live scope evidence interoperability
**File(s)**: scripts/issue-spec-scope.mjs, scripts/verification-readiness.mjs, scripts/sdlc-finalize-verification.mjs, scripts/sdlc-deliver.mjs, scripts/__tests__/verification-readiness.test.mjs, scripts/__tests__/sdlc-finalize-verification.test.mjs, scripts/__tests__/sdlc-deliver.test.mjs, workflows/verify-code/WORKFLOW.md, commands/sdlc-verify-code.md
**Type**: Modify
**Acceptance**:
- [ ] AC11: canonical named scenarios in implicit single-issue scopes pass readiness; numbered scenario requirements for explicit manifests, exact scope matching, malformed-name rejection, and duplicate rejection remain enforced.
- [ ] A safe local unverifiable report can enter bounded verify remediation without waiving report validation, branch publication, or genuine external intervention.
- [ ] Preserve the first smoke failure evidence and prove the unchanged #93 report under the plugin fix before retrying that same unconsumed queue.
- [ ] Finalization and delivery compare against freshly resolved complete scope; stale same-issue markers cannot publish or enter delivery.
- [ ] Follow `skill-creator` for workflow synchronization and preserve the controller-owned handoff boundary.
- [ ] Regenerate the public verification command through the existing renderer so its loaded instructions match the updated workflow.

## Behavior evidence mapping

Behavior for scripts/sdlc-execute.mjs: failed remediation without ordered-step advancement stops and remains stopped; cancellation preserves ownership through cleanup.
Behavior for scripts/sdlc-execute-supervisor.mjs: cancellation remains observable while the controller is blocked and when its invoking job disappears.
Behavior for scripts/__tests__/: regressions defend progress, cancellation, retained panes, and isolation boundaries.
Behavior for src/process-supervision.mjs: terminate remaining owned POSIX descendants even when their group leader has exited, without touching unrelated groups.
Behavior for src/sdlc-verification-runtime.mjs: process loss ends verification waiting and cleans owned descendants without weakening result identity or failure classifications.
Behavior for scripts/exercise-omp.mjs: terminate owned exercise descendants when the agent leader disappears.
Behavior for steering/extensions/nmg-sdlc-smoke.mjs: apply shared process supervision to plugin-owned smoke commands while preserving bounded consumer delivery evidence.
Behavior for scripts/issue-spec-scope.mjs: expose one canonical scenario identity contract for numbered and implicit named scenarios.
Behavior for scripts/verification-readiness.mjs: accept resolver-produced implicit scenario identities while rejecting malformed, duplicate, and mismatched scope evidence.
Behavior for scripts/sdlc-finalize-verification.mjs: route safe local report evidence errors to bounded repair without producing a passed handoff or publishing unready evidence.
Behavior for scripts/sdlc-deliver.mjs: reject verification markers that disagree with current canonical issue scope before protected delivery mutation.
Behavior for workflows/verify-code/WORKFLOW.md: direct safe local report-evidence failures into bounded controller-owned remediation while retaining genuine intervention boundaries.
Behavior for commands/sdlc-verify-code.md: publish the same safe report-remediation contract as its owning verification workflow.
