# Defect Report: Runner spec validation accepts unrelated specs

**Issue**: #115
**Date**: 2026-04-26
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Create or keep a spec directory for issue A.
2. Run an issue-bound runner step for issue B with no matching spec directory or frontmatter.
3. Observe that the runner can select issue A's spec as a fallback.

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
| **Expected** | Issue-bound steps only accept specs matching the current feature name, branch slug, or issue frontmatter. |
| **Actual** | findFeatureDir() could fall back to the most recent spec directory. |

### Error Output

No single stack trace. The failure presents as incorrect runner control flow or child-step behavior.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Bug Is Fixed

**Given** no spec matches the current issue, feature name, or branch slug
**When** an issue-bound runner step resolves specs
**Then** the step fails preconditions instead of using another directory

### AC2: No Regression in Related Behavior

**Given** a spec directory name differs but its frontmatter references the issue
**When** the runner resolves specs for that issue
**Then** the frontmatter-matching spec is accepted

---

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | Use strict issue-aware spec lookup for issue-bound steps. | Must |
| FR2 | Preserve frontmatter fallback for matching issue numbers. | Must |
| FR3 | Reject unrelated specs instead of choosing a newest-directory fallback. | Must |

---

## Out of Scope

- Broad runner redesign
- Changes to Codex CLI behavior outside this plugin
- Refactoring unrelated SDLC steps

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #115 | 2026-04-26 | Initial defect report |

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
