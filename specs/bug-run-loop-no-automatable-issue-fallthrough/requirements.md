# Defect Report: Run-loop no-automatable issue fallthrough

**Issue**: #114
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: Medium
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Configure the runner against a milestone or repository with no open automatable issues.
2. Run the start-issue step.
3. Observe that the loop can continue instead of reporting completion.

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
| **Expected** | The runner reports that no automatable issues were found, removes unattended mode, and returns done without spawning Codex. |
| **Actual** | The start-issue path did not treat an empty queue as a terminal result. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** no automatable issues are available
**When** the runner executes start-issue
**Then** it logs a no-issues diagnostic and returns done

### AC2: No Regression in Related Behavior

**Given** no issue was selected
**When** start-issue completes
**Then** no child Codex session is spawned

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Treat no selected issue and no blocked issues as terminal completion. | Must |
| FR2 | Preserve blocked issue diagnostics when blocked issues exist. | Must |
| FR3 | Avoid spawning Codex when no issue was selected. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #114 | 2026-04-26 | Initial defect report |

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
