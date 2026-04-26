# Defect Report: Runner merge progression on pending CI

**Issue**: #118
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Run the runner against a branch whose GitHub checks are pending, queued, waiting, or in progress.
2. Reach validate-ci or merge preconditions.
3. Observe that pending check output can be treated as non-failing.

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
| **Expected** | Pending checks block validate-ci and merge until checks reach a terminal pass state. |
| **Actual** | Pending states were not classified as blockers. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** GitHub checks are pending, queued, waiting, or in progress
**When** validate-ci evaluates checks
**Then** the precondition fails with a pending-checks reason

### AC2: No Regression in Related Behavior

**Given** merge preconditions inspect pending checks
**When** checks have not reached a terminal pass state
**Then** merge does not proceed

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Detect pending, queued, waiting, and in-progress check states. | Must |
| FR2 | Block validate-ci on pending checks. | Must |
| FR3 | Block merge preconditions on pending checks. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #118 | 2026-04-26 | Initial defect report |

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
