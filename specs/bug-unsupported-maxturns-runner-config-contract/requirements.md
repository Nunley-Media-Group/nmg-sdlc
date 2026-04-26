# Defect Report: Unsupported maxTurns runner config contract

**Issue**: #117
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: Medium
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Read the runner config example or public runner docs.
2. Configure maxTurns for a step.
3. Run the runner and observe that the setting is not enforced.

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
| **Expected** | Docs and templates only advertise settings the runner actually supports. |
| **Actual** | The config example and docs referenced maxTurns or turn limits despite no enforcement in runner code. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** a user copies scripts/sdlc-config.example.json
**When** they inspect step configuration fields
**Then** unsupported maxTurns fields are absent

### AC2: No Regression in Related Behavior

**Given** a user reads runner documentation
**When** they look for step limit configuration
**Then** the docs describe only supported timeout/model/effort controls

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Remove unsupported maxTurns fields from the config example. | Must |
| FR2 | Remove unsupported turn-limit wording from README and upgrade guidance. | Must |
| FR3 | Add contract tests preventing reintroduction. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #117 | 2026-04-26 | Initial defect report |

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
