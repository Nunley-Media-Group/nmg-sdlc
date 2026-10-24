# Defect Report: Write-spec stops silently after a spec merge that outlasts the Bash timeout

**Issue**: #489
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

## Reproduction

1. In an interactive Claude Code TUI session with the nmg-sdlc hooks module loaded, in a repository whose spec PR checks take longer than 120 s, run `/sdlc-write-spec` with no argument and choose an issue from the picker.
2. Approve that issue's spec plan in the `ExitPlanMode` dialog.
3. Let publication run: the `publish-approved-spec.mjs merge` `Bash` call reaches the 120 s default timeout and is moved to the background (empty `stdout`, `backgroundTaskId`, `timedOutAfterMs: 120000`), then completes with `merged: true`; the model reads the background output with a separate tool call and ends its turn.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Once the publishing turn ends with an empty prompt box, the hooks module runs `/plan` and submits the post-publication continuation prompt; the Continue picker lists the next candidates plus `Finished — stop writing specs`, and this repeats after every publication until Finished. An unsubmittable continuation stays pending with a toast naming the published issue(s). |
| **Actual** | The backgrounded merge is never recognized as a publication, `published[]` stays empty, the continuation is never scheduled, plan mode stays off, no picker appears, and no toast is shown. |

## Acceptance Criteria

### AC1: Merged publication is recognized from the helper result

**Given** a write-spec session in which a `Bash` call runs `publish-approved-spec.mjs merge` and its output contains a sole JSON object with `merged: true`, a positive `pr`, a positive `issue`, and a `dir` of the form `specs/{issue}-{slug}`
**When** the `Bash` tool call completes
**Then** the hooks module records `{ issue, slug }` in `published[]` exactly once and marks the continuation pending, whatever the quoting, plugin-root spelling, or trailing slash of the command text

### AC2: The merge helper reports the published issue and directory

**Given** `publish-approved-spec.mjs merge --issue N --dir specs/N-slug` merges the spec PR
**When** it prints its JSON result, including the post-merge `default_checkout_failed` and `spec_created_label_failed` results that carry `merged: true`
**Then** that JSON includes `issue: N` and `dir: "specs/N-slug"` alongside the existing fields

### AC3: The session returns to the picker in plan mode

**Given** a recognized merged publication and a publishing turn that ends with an empty prompt box
**When** the main-session turn completes
**Then** the hooks module runs `/plan` and submits the post-publication continuation prompt listing every `published[]` issue

### AC4: An unsubmitted continuation stays pending and is retried

**Given** a recognized merged publication
**When** the continuation cannot be submitted because the prompt box is not empty, rendering fails, or `/plan` fails
**Then** a toast names the published issue number(s) and says the Continue picker opens after the next turn that ends with an empty prompt box, the continuation stays pending, and it is submitted into plan mode when such a turn ends

### AC5: Non-publication Bash calls are not treated as publications

**Given** a `Bash` call that does not invoke `publish-approved-spec.mjs merge` while no backgrounded merge is outstanding, or whose output lacks `merged: true`, has several JSON objects, or has an `issue` that disagrees with the leading number of `dir` or with the command's `--issue`
**When** the `Bash` tool call completes
**Then** nothing is recorded in `published[]` and no continuation is scheduled

### AC6: Existing Finished and explicit-number behavior is preserved

**Given** a write-spec session
**When** the person selects `Finished — stop writing specs` or `Finished — stop without writing a spec`, or runs `/sdlc-write-spec #N`
**Then** Finished still exits plan mode through the auto-approved `ExitPlanMode`, and an explicit-number run still publishes and continues

### AC7: The loop continues until Finished

**Given** a write-spec session that has published one or more specs through the Continue picker
**When** each further selected issue's publication merges and its turn ends with an empty prompt box
**Then** a new continuation prompt listing every published issue is submitted into plan mode each time, and no continuation follows a Finished selection

### AC8: A background merge is recognized when it completes

**Given** a write-spec `publish-approved-spec.mjs merge` `Bash` call that runs in the background — started with `run_in_background: true` or moved there by the `Bash` timeout — so its result carries a `backgroundTaskId` and no merged JSON result
**When** a later `Bash` or `Read` tool call in the session returns that merge's sole JSON result with `merged: true` and a matching `issue` and `dir`, and the publishing turn ends with an empty prompt box
**Then** the issue is recorded in `published[]` exactly once and the continuation prompt is submitted into native plan mode

### AC9: The workflow waits for CI success or failure without a timeout

**Given** the write-spec Approval Behavior merge step
**When** the model runs `publish-approved-spec.mjs merge`
**Then** the workflow directs it to run the command with `run_in_background: true`, wait for the task's completion notification rather than a timeout or stall rule, read the complete output, and act on the helper's success or failure result as today

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `publish-approved-spec.mjs merge` includes `issue` and `dir` in every JSON result that reports `merged: true`. | Must |
| FR2 | Publication recognition in `src/host-events.mjs` identifies a merged publication from the helper's sole JSON result (`merged: true`, positive `pr`, positive `issue`, and a `dir` whose leading number equals `issue`) for any `Bash` command that invokes `publish-approved-spec.mjs merge` with a matching `--issue`, without depending on exact command text. | Must |
| FR3 | The hooks module remembers a write-spec merge whose `Bash` result carries a `backgroundTaskId` (deliberately backgrounded or moved by the timeout), and records its publication when a later `Bash` or `Read` result in the session carries that merge's sole merged JSON result with the same issue. | Must |
| FR4 | A continuation that cannot be submitted (non-empty prompt box, headless, render failure, `/plan` failure, or a host-call failure) stays pending, shows a toast naming the published issue number(s), and is retried when a later main-session turn ends with an empty prompt box. | Must |
| FR5 | After each merged publication the write-spec session returns to the Continue picker in native plan mode until the person selects Finished. | Must |
| FR6 | The write-spec workflow runs the merge `Bash` call with `run_in_background: true`, waits for its completion notification (no timeout or stall rule; CI always reports success or failure and the helper exits on each), reads its complete output, and acts on the result. | Must |
| FR7 | Automated tests cover recognition of command variants, rejection of non-publication results, backgrounded-merge recognition, and the continuation and toast paths. | Must |

## Out of Scope

- Changing the Continue picker's options, ordering, or candidate filtering.
- Changing the Finished exit behavior or autopilot answer selection.
- Changing the merge helper's readiness polling interval, merge strategy, or adding a readiness deadline or stall exit.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #489 | 2026-10-24 | Initial defect report |
