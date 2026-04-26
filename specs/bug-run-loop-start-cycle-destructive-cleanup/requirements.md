# Defect Report: Run-loop start-cycle destructive cleanup

**Issue**: #116
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Modify a tracked file without committing it.
2. Run $nmg-sdlc:run-loop from Step 1.
3. Observe that checkout, pull, or cleanup behavior can be attempted before a clean-tree gate.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS/Linux/Windows CLI |
| **Version / Commit** | current branch / current commit |
| **Browser / Runtime** | Node.js runner / Codex CLI |
| **Configuration** | Default runner configuration unless noted |

### Frequency

Always when the triggering conditions are present.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The runner validates the worktree before any repository mutation and routes dirty state through the failure loop. |
| **Actual** | The Step 1 precondition ran too late and the prompt allowed cleanup/reset behavior. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** the working tree has uncommitted changes
**When** the runner executes Step 1
**Then** it halts through the failure loop before checkout, pull, or cleanup actions

### AC2: No Regression in Related Behavior

**Given** Step 1 is allowed to run
**When** the runner builds the Codex prompt
**Then** the prompt requests safe checkout/pull behavior without cleanup or reset instructions

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Validate clean worktree before Step 1 repository mutations. | Must |
| FR2 | Route dirty Step 1 state through the failure-loop contract. | Must |
| FR3 | Remove cleanup/reset wording from the Step 1 prompt. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #116 | 2026-04-26 | Initial defect report |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal -- no feature work mixed in
- [x] Out of scope is defined
