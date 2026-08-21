# Defect-Fix Verification Path

**Consumed by**: `verify-code` Step 2 (when the spec under verification uses the defect variant).

A defect spec has a different shape from a feature spec — reproduction steps instead of user-story ACs, a root-cause hypothesis instead of an architecture plan, a flat fix/test/verify task list instead of a phased breakdown. Verification follows the same skeleton as for features (load specs, check ACs, review architecture, run tests) but narrows each step to the fix's minimal blast radius. Running the full feature-verification script against a 10-line bug fix produces a lot of noise and rarely surfaces real risks.

## When this path applies

Treat the spec as a defect when any of these hold (any single signal is sufficient):

- `requirements.md` begins with `# Defect Report:` (not `# Requirements:`).
- The frontmatter uses the singular `**Issue**` field with `**Status**: Investigating | Fixed | Closed`.
- `requirements.md` frontmatter contains a `**Related Spec**` pointer.

See `../../references/spec-frontmatter.md` for the full defect-spec schema.

## Narrowed verification checklist

### Reproduction check

Re-execute the reproduction steps from `requirements.md` against the fixed code. The bug must no longer reproduce. Capture the before/after observation in the Fixes Applied table so reviewers can confirm the fix actually addresses the reported failure — not merely a plausible-looking code change.

### Regression scenarios

Every Gherkin scenario tagged `@regression` in `feature.gherkin` must pass. These are the scenarios the fix owner added to lock the bug's non-recurrence; a regression-test that passes before the fix and still passes after is almost always mis-scoped and should be flagged.

### Regression test presence is mandatory

A defect fix without a `@regression`-tagged scenario is a finding. Flag it as High-severity even when the reproduction check passes — future refactors have nothing to detect recurrence against.

### Architecture review — blast radius only

Focus the architecture review on blast radius rather than the full SOLID/security/performance/testability/error-handling suite. For small, targeted fixes (≲ 20 lines) the full checklist produces noise; skip it and instead ask:

- What other callers share the changed code path?
- Does the fix alter a public contract (function signature, return type, exception behaviour)?
- Could the fix introduce silent data changes (e.g., dropping or reinterpreting existing values)?

Record answers in the report even when negative — "no public contract change" is evidence for reviewers.

### Minimal-change check

Review `git diff main...HEAD` for modifications outside the fix scope. Unrelated refactors, formatting-only churn, and drive-by cleanups slipped into a defect PR hide behind the bug context and are a common source of regressions downstream. Flag any such change as a finding so the author either justifies it in the report or removes it before merge.

### Tests must run

Run the project's test suite per `steering/tech.md`. A fix that passes manually but leaves the suite red is not Done.

## Reporting differences

In the verification report:

- Label the Implementation Status row explicitly as **defect fix**.
- The Acceptance Criteria section uses the defect's reproduction scenario and any added `@regression` scenarios as the pass/fail evidence (there are no feature-style user-story ACs to iterate through).
- The Architecture Review section carries the blast-radius answers instead of the full SOLID table.

Everything else in the report template — Fixes Applied, Remaining Issues, Recommendation — uses the same structure as feature verification.
