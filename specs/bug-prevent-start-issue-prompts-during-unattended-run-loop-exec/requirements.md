# Defect Report: Prevent start-issue prompts during unattended run-loop exec

**Issue**: #129
**Date**: 2026-04-27
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: `specs/feature-start-issue-skill/`

---

## Reproduction

### Steps to Reproduce

1. Run the SDLC runner in unattended loop mode so it creates `.codex/unattended-mode`.
2. Allow the runner to pre-select an `automatable` issue for Step 2 (`startIssue`).
3. Let the runner launch `start-issue` inside a `codex exec` child session.
4. Observe the child session reach a confirmation path that calls `request_user_input`.
5. The child fails before branch creation with `request_user_input is not supported in exec mode`.

### Environment

| Factor | Value |
|--------|-------|
| **Component** | `skills/start-issue/SKILL.md`, `skills/start-issue/references/*`, `scripts/sdlc-runner.mjs` |
| **Trigger** | Runner pre-selects an issue and launches `start-issue` in `codex exec` |
| **Runner Mode** | Unattended mode with `.codex/unattended-mode` present |
| **Observed Date** | 2026-04-27 during an AgentChrome run-loop |

### Frequency

Reproducible whenever the `start-issue` child reaches a prompt-capable branch inside `codex exec` instead of following the unattended branch creation path.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | In unattended/run-loop execution, `start-issue` never calls `request_user_input`; the runner-selected issue is enough to create or reconcile the linked feature branch, or to fail non-interactively before partial work. |
| **Actual** | The child session attempts `request_user_input`, which is unavailable in `codex exec`, so branch creation does not happen and Step 2 fails without satisfying its postcondition. |

### Error Output

```text
request_user_input is not supported in exec mode
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Unattended start-issue does not call request_user_input

**Given** the SDLC run-loop starts `start-issue` inside `codex exec`
**And** the runner has already selected an issue
**When** the child session executes Step 2
**Then** `start-issue` does not call `request_user_input`
**And** it does not emit text asking the user to reply.

### AC2: Unattended start-issue creates or reconciles the feature branch

**Given** issue metadata is valid
**And** the working tree satisfies the `start-issue` preconditions
**When** unattended `start-issue` runs for the selected issue
**Then** it creates or reconciles the linked feature branch
**And** it does not require manual confirmation.

### AC3: Branch creation failures are actionable and non-interactive

**Given** branch creation cannot proceed
**When** unattended `start-issue` runs
**Then** it exits non-zero with an actionable diagnostic
**And** it does not leave misleading runner state that implies Step 2 succeeded.

### AC4: Interactive behavior is unchanged

**Given** `.codex/unattended-mode` does not exist
**When** a normal user-driven `start-issue` session requires issue selection, confirmation, or stale-branch confirmation
**Then** the existing `request_user_input` gates remain available.

### AC5: Runner treats prompt-tool failures as Step 2 contract violations

**Given** a `start-issue` child session emits `request_user_input is not supported in exec mode`
**When** the runner evaluates Step 2 output
**Then** it treats the output as a Step 2 contract violation
**And** it routes through the existing failure path instead of treating the step as successful.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Guard every `request_user_input` path in `start-issue` behind interactive-only execution, including selection, confirmation, stale branch, ambiguous milestone, and project-board prompt paths. | Must |
| FR2 | Ensure runner-provided unattended issue selection is sufficient for `start-issue` to proceed without a second manual confirmation. | Must |
| FR3 | Preserve existing interactive `start-issue` behavior when `.codex/unattended-mode` is absent. | Must |
| FR4 | Preserve existing BDD and typed runner failure contracts; new failures must route through the runner's normal Step 2 failure handling. | Must |
| FR5 | Add regression coverage proving unattended `start-issue` under `codex exec` cannot reach `request_user_input`. | Must |
| FR6 | Detect the current Codex exec prompt-tool error text (`request_user_input is not supported in exec mode`) as a Step 2 failure signal. | Must |

---

## Out of Scope

- Removing `request_user_input` from interactive `start-issue`.
- Changing `$nmg-sdlc:draft-issue` or its required interactive interview workflow.
- Changing global Codex prompt feature flags.
- Redesigning the SDLC runner beyond Step 2 prompt and failure handling.

---

## Validation Checklist

- [x] Reproduction steps are repeatable and specific.
- [x] Expected vs actual behavior is clearly stated.
- [x] Severity is assessed.
- [x] Acceptance criteria use Given/When/Then format.
- [x] At least one regression scenario is included.
- [x] Fix scope is minimal; no feature work is mixed in.
- [x] Out of scope is defined.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #129 | 2026-04-27 | Initial defect report |
