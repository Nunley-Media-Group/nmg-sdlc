# Requirements: Honor and resume selected issues from the empty /sdlc-execute picker

**Issue**: #231
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/223-apply-spec-created-after-specs-exist-and-gate-execute-selection/

---

## User Story

**As a** developer running nmg-sdlc in Oh My Pi / Herdr
**I want** empty `/sdlc-execute` selections and failed queues to retain their exact intent
**So that** the selected issues run in order and verification rework cannot strand or silently advance the queue

---

## Background

The 3.8.0 picker marks the first option recommended, authors at most three issue chips plus a Cancel chip, and treats an empty `ask` result as cancellation. In a live Herdr OMP session, selecting #195 and confirming produced `User did not select any options`, so no tokens reached `scripts/sdlc-execute.mjs`. Explicit `node scripts/sdlc-execute.mjs run '#195'` then started correctly. The workflow must use the built-in multi-select contract without a misleading recommended selection or Cancel option, must distinguish an empty Continue from cancellation, and must exercise the actual TUI boundary rather than infer success from controller parsing.

A second defect occurs when a valid failed/intervention handoff requests an earlier lifecycle step through `next`. The controller derives the step only from completed prefixes, so a failed verification worker remains pinned at verify and the selected queue cannot resume implementation rework.

The first branch smoke exposed a third boundary: the packaged `commands/sdlc-execute.md` contained only the compact entrypoint and told the model to read `references/selection.md`. In a consumer project that path does not exist, so OMP searched elsewhere and loaded the released GitHub copy instead of the branch's picker contract. The packaged file command must carry the picker section itself; working-directory or network lookup cannot determine execute behavior.

The live branch smoke exposed a fourth transport boundary in the explicit fallback. Herdr submitted `/sdlc-execute #902`, OMP 18.0.3 rendered the actual command input as `/sdlc-execute pr://902`, and the workflow invoked `node scripts/sdlc-execute.mjs run 'pr://902'`. The numeric intent survives, but the released parser rejects the URI as usage-invalid. Explicit fallback must normalize OMP's numeric `issue://N` and `pr://N` expansions without accepting unrelated URI schemes or weakening positive-safe-integer, deduplication, order, or maximum-count checks.

---

## Acceptance Criteria

### AC1: Continue runs the selected multi-select queue

**Given** one or more open GitHub issues have `spec-created`
**When** the user selects one or more issue chips and confirms Continue
**Then** the selected chips enter the queue in ascending displayed order
**And** valid Other tokens follow in typed order
**And** duplicate numbers are removed first-occurrence-first
**And** execution starts immediately without a second confirmation or a no-selection report

### AC2: Any single listed chip starts that issue

**Given** the empty picker shows multiple eligible issues
**When** the user selects only the first chip or only any other chip and confirms Continue
**Then** exactly that issue is passed to `run`
**And** no recommended visual state is mistaken for a submitted selection

### AC3: Empty Continue reopens the picker

**Given** the empty picker is visible
**When** Continue is confirmed with no selected issue chip and no valid Other token
**Then** the same picker reopens
**And** no worker starts
**And** the command does not stop with a fatal no-selection error

### AC4: Picker shape and fallback remain safe

**Given** empty `/sdlc-execute` has eligible issues
**When** the picker is authored
**Then** it uses one built-in `ask` with `multi: true`
**And** the four lowest-numbered issues are the issue chips when four or more are eligible
**And** there is no Cancel chip and no recommended option
**And** every eligible issue is listed in the question
**And** issues beyond the authored chips remain selectable through Other
**And** explicit issue arguments bypass the picker unchanged

### AC5: One eligible issue remains interactive

**Given** exactly one open issue has `spec-created`
**When** empty `/sdlc-execute` is invoked
**Then** the command presents a valid non-silent interaction
**And** selecting that issue and confirming starts it
**And** the command does not silently auto-start or require a Cancel chip

### AC6: Verification rework resumes at the requested gate

**Given** the current issue has a validated failed or intervention handoff whose `next` names the same or an earlier supported lifecycle step
**When** the same durable queue is resumed after intervention
**Then** the controller remains on the current issue
**And** removes completion only for the requested step and its downstream gates
**And** reruns those gates before delivery
**And** preserves later issues in their original order

### AC7: Invalid remediation remains fail-closed

**Given** a failed handoff has a missing, unknown, forward, mismatched, or otherwise ambiguous remediation target
**When** execution is resumed
**Then** no new worker starts
**And** the failed worker and durable queue remain available for intervention
**And** no delivery or later issue is claimed

### AC8: The packaged command is self-contained

**Given** nmg-sdlc is loaded as an OMP plugin in a consumer repository with no local `workflows/` tree
**When** `/sdlc-execute` expands its packaged file command
**Then** the prompt contains the complete `# Select specified issues` contract from the installed plugin version
**And** it does not ask the model to resolve a working-directory-relative picker reference
**And** branch, installed, offline, and consumer-project execution use the same picker instructions

### AC9: OMP-expanded explicit tokens retain their issue number

**Given** the user invokes `/sdlc-execute #N` and OMP expands the prompt action to `issue://N` or `pr://N`
**When** the packaged workflow passes the expanded argument to the controller
**Then** the controller treats it as issue number N
**And** the picker remains bypassed
**And** mixed bare, hash, issue-URI, and pull-request-URI tokens preserve order and first-occurrence deduplication
**And** unrelated URI schemes and nonnumeric URI values remain usage errors
**And** every existing numeric validity and queue-size guard remains enforced

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Empty `/sdlc-execute` uses one built-in multi-select picker and starts the ordered deduplicated union of selected issue chips and valid Other tokens | Must |
| FR2 | Author up to four lowest-numbered issue chips, list every eligible issue in the question, and use neither a Cancel chip nor a recommended option | Must |
| FR3 | Empty or invalid-only Continue reopens the same picker and starts no worker | Must |
| FR4 | Explicit-token parsing, spec-created eligibility, ordinary durable resume, and serial queue order remain unchanged | Must |
| FR5 | A validated failed/intervention handoff may rewind only its current issue to a supported same-or-earlier `next` step; downstream completion is invalidated | Must |
| FR6 | Invalid or ambiguous rewind state fails closed without closing recoverable work or advancing the queue | Must |
| FR7 | Verification includes controller tests, interaction-contract tests, and a real Herdr OMP TUI smoke test that observes the controller receiving the selected token | Must |
| FR8 | Generated `commands/sdlc-execute.md` embeds the execute selection reference and stays synchronized with both source files | Must |
| FR9 | `parseArgs` normalizes OMP-expanded `issue://N` and `pr://N` transport tokens to N while rejecting unrelated URIs and retaining all numeric safety and queue rules | Must |

---

## Out of Scope

- Changing explicit issue token semantics beyond normalizing OMP's numeric `issue://N` and `pr://N` prompt-action expansions; eligibility labels, dirty-tree checks, and Herdr preflight remain unchanged
- Silent auto-start of the only or first eligible issue
- Paging or more than four authored issue chips
- General pane lifecycle or handoff-schema redesign
- Treating controller-only parsing tests as proof that the TUI selection boundary works

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #231 | 2026-08-23 | Initial contract plus packaged-reference and explicit-token transport defects found by branch TUI smoke |