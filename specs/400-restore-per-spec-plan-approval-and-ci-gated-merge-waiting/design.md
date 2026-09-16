# Root Cause Analysis: Restore per-spec plan approval and CI-gated merge waiting

**Issue**: #400
**Date**: 2026-09-15
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/197-move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan/

---

## Root Cause

Write-spec enters native plan mode only when `src/extension.ts` rewrites the initial interactive command through `rewriteInteractiveInput`. The workflow then explicitly limits `xd://propose` to the first issue and performs Continue/Finished plus later publication inside the approved execution turn. No host-side event returns the same TUI session to builtin `/plan`, so a continuation issue inherits authority from the first proposal.

Terminal delivery already has an unbounded 30-second loop for classifier results whose status is `pending`, and it already refreshes exact-head evidence before merge. The defect is earlier: snapshot normalization treats a declared check whose resolver says `pending` as invalid, empty configured checks become `required_checks_missing`, and a CI-derived BLOCKED state can fall through to `merge_blocked_by_external_policy`. `runDeliverUnlocked` then converts that non-pending result to `merge_failed`; only after `merge_ready` does its existing fresh recheck protect merge issuance.

### Affected Code

| File | Lines / Symbol | Role |
|------|----------------|------|
| `src/sdlc-commands.mjs` | `rewriteInteractiveInput`; new `writeSpecPlanReentry` | Build initial and post-publication native-plan prompts |
| `src/extension.ts` | extension event registration | Dispatch the validated plan follow-up after publication |
| `workflows/write-spec/WORKFLOW.md` | Plan File, Approval Behavior, Continue loop, Finish | Define per-issue proposal and publication sequencing |
| `workflows/write-spec/references/publish.md` | helper and Continue contracts | Mirror publication and plan re-entry behavior |
| `workflows/write-spec/references/review-gates.md` | removed-gates contract | Remove the obsolete first-spec-only approval statement |
| `references/interactive-gates.md` | Plan-mode entry | State that every publication returns to native plan before continuation |
| `scripts/pr-delivery-state.mjs` | `normalizeSnapshot`, `classifyPrDeliveryState` | Distinguish registering CI from terminal mismatch and blockers |
| `scripts/sdlc-deliver.mjs` | `fetchSnapshot`, `runDeliverUnlocked` | Collect exact-head evidence and consume pending classification |

### Triggering Conditions

- A first spec has left plan mode for approved execution and publishes successfully or returns `merged: true` with a recoverable checkout/label failure.
- The operator selects a second issue while the workflow remains in that execution context.
- A delivery snapshot contains an expected declared check that has not appeared, a recognized pending check state, or BLOCKED while that expected CI evidence is incomplete.
- Existing tests assert the obsolete first-proposal-only prose and omit empty/registering plus CI-attributable BLOCKED terminal-delivery cases.

---

## Fix Strategy

### Approach

Add a narrow host bridge at the authoritative publication result. `writeSpecPlanReentry(event, root = packageRoot)` validates the exact materialized merge command and the helper's single JSON result. Only `merged: true` with a positive PR number produces a static `/plan` follow-up. `src/extension.ts` deduplicates the tool call and sends that prompt with `deliverAs: "followUp"`, so the current turn can record publication and perform any allowed remediation before OMP re-enters native plan. The workflow stops before candidates/ask; the follow-up plan turn owns Continue/Finished and requires a full plan plus `xd://propose` for any selected issue.

Keep delivery policy in `classifyPrDeliveryState`. Reuse `resolveDeclaredCheck` as designed: write every `pending` identity into normalized `pendingDeclaredPrOnlyChecks`, while `mismatch` remains invalid terminal evidence. After existing review and explicit-failure precedence, `checks_pending` covers any recognized pending check, any non-empty `pendingDeclaredPrOnlyChecks`, and configured required checks with an empty check set. A BLOCKED state is therefore pending only while that missing/pending evidence attributes it to incomplete CI; BLOCKED after terminal-successful checks remains an external policy blocker. The existing controller loop and fresh exact-head recheck then provide the required wait and merge behavior without a second policy implementation.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `src/sdlc-commands.mjs` | Add strict publication-result parsing and a static continuation `/plan` prompt | Reuse the extension's existing native-plan dispatch boundary without trusting arbitrary tool output |
| `src/extension.ts` | Listen for qualifying `tool_result`, deduplicate `toolCallId`, and send one follow-up | Restore native plan only after authoritative publication |
| `workflows/write-spec/WORKFLOW.md` | Make every issue plan/propose; stop execution before Continue; remove pre-approval branch mutation | Give every continuation issue independent user authority |
| `workflows/write-spec/references/publish.md` | Document re-entry ordering, merged-result behavior, and per-issue proposal | Keep helper consumers aligned |
| `workflows/write-spec/references/review-gates.md` | Replace first-only language with per-spec native-plan approval | Remove a directly conflicting contract |
| `references/interactive-gates.md` | Document post-publication native-plan re-entry | Keep the shared interactive boundary accurate |
| `scripts/pr-delivery-state.mjs` | Preserve pending declared checks and narrowly classify CI-attributable BLOCKED as pending | Prevent non-terminal CI from becoming merge failure |
| `scripts/__tests__/sdlc-commands.test.mjs` | Exercise exact merge-result recognition, rejection, and prompt shape | Prove the host bridge's pure boundary |
| `scripts/__tests__/pr-delivery-state.test.mjs` | Cover registering, pending, BLOCKED attribution, failure precedence, and CLEAN success | Pin classifier state transitions |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Drive ordered snapshots through poll, fresh recheck, one merge, and proof | Prove observable terminal delivery behavior |

### Blast Radius

- **Direct impact**: interactive write-spec continuation and terminal PR readiness classification.
- **Indirect impact**: shared interactive contract tests, extension command tests, publication references, and delivery regression fixtures.
- **Risk level**: Medium. The bridge crosses an OMP mode boundary, and overbroad BLOCKED handling could either bypass approval or wait forever. Exact command/result validation, follow-up delivery, explicit CI attribution, and existing failure precedence bound those risks.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| An unrelated bash result enters plan mode | Low | Match the materialized helper path, exact merge argv, matching issue directory, sole JSON object, `merged: true`, and positive PR |
| Post-merge remediation is skipped by early re-entry | Low | Queue with `deliverAs: "followUp"` and make the current workflow turn finish remediation before settling |
| A continuation mutates before approval | Low | Run only discovery/interview in plan mode; move all branch/file/GitHub mutation behind M's proposal |
| A non-CI policy block waits forever | Medium | Require missing or pending required/declared check evidence before attributing BLOCKED to CI |
| A transient CLEAN snapshot merges early | Low | Missing declared checks remain pending and the controller performs a second exact-head CLEAN classification before merge intent |
| Exact-head or post-merge proof weakens | Low | Leave controller CAS, merge argv, recovery, three-read proof, linkage, closure, and cleanup code unchanged |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Continue inside approved execution and call `xd://propose` again | Reuse the current loop without native-plan re-entry | Does not restore OMP's read-only planning boundary and can expose mutation tools before approval |
| Ask the operator to type `/plan` after each publication | Make re-entry manual | Violates the extension-owned interactive boundary and makes continuation correctness depend on prose |
| Treat every BLOCKED state as pending | Poll all GitHub policy blocks indefinitely | Hides proven non-CI blockers and can create an unbounded wait unrelated to CI |
| Add a delivery timeout or GitHub auto-merge | Delegate or bound CI waiting | Explicitly outside issue scope and weakens direct exact-head observation |

---

## Validation Checklist

- [ ] Root cause is identified with specific code references
- [ ] Fix is minimal — no unrelated refactoring
- [ ] Blast radius is assessed
- [ ] Regression risks are documented with mitigations
- [ ] Fix follows existing project patterns
