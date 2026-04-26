# Defect Report: Run-loop Blocks dependency ordering

**Issue**: #119
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Create issue #10 with body Blocks: #20.
2. Leave both issues open and automatable in the same milestone.
3. Run issue selection and observe that #20 can be treated as unblocked.

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
| **Expected** | Issue #10 is selected before #20 because #20 is blocked by #10. |
| **Actual** | Blocks: #N was interpreted in the same direction as Depends on: #N. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** issue A says Blocks: #B
**When** the runner builds dependency state
**Then** issue B is treated as blocked by issue A

### AC2: No Regression in Related Behavior

**Given** issue A says Depends on: #B
**When** the runner builds dependency state
**Then** issue A is treated as blocked by issue B

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Interpret Blocks: #N as #N depending on the current issue. | Must |
| FR2 | Preserve Depends on: #N as the current issue depending on #N. | Must |
| FR3 | Cover both relationship forms with tests. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #119 | 2026-04-26 | Initial defect report |

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
