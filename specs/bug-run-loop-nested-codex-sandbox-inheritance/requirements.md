# Defect Report: Run-loop nested Codex sandbox inheritance

**Issue**: #113
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Start Codex from a sandboxed host session with sandbox environment variables present.
2. Run $nmg-sdlc:run-loop so scripts/sdlc-runner.mjs spawns a child Codex step.
3. Observe child-session filesystem or network failures caused by inherited sandbox state.

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
| **Expected** | Child Codex sessions omit host sandbox control variables while retaining normal authentication, PATH, and repository environment. |
| **Actual** | The runner forwards process.env unchanged and passes sandbox controls into the child process. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** the runner process contains Codex sandbox environment variables
**When** runCodex() starts a child Codex session
**Then** the child environment omits those sandbox variables

### AC2: No Regression in Related Behavior

**Given** the runner process contains normal authentication or path variables
**When** the child environment is built
**Then** unrelated variables remain available to the child process

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Strip inherited Codex sandbox environment variables before spawning codex exec. | Must |
| FR2 | Preserve non-sandbox environment variables. | Must |
| FR3 | Cover the environment contract with tests. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #113 | 2026-04-26 | Initial defect report |

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
