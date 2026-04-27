# Defect Report: Fix run-loop continuing after issue escalation

**Issue**: #131
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Run `$nmg-sdlc:run-loop` in continuous mode with at least two open `automatable` issues.
2. Let the runner process one issue until a mid-cycle step escalates, such as Step 4 matching `context_window_exceeded`.
3. Observe the runner after it saves partial work and logs the escalation.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS / Codex CLI |
| **Version / Commit** | nmg-sdlc 1.67.1; observed from branch `124-fix-stale-pluginroot-config-blocking-sdlc-loop` at `4d7ff79` |
| **Browser / Runtime** | Node.js runner / Codex CLI |
| **Configuration** | `$nmg-sdlc:run-loop`, `scripts/sdlc-runner.mjs`, continuous mode |

### Frequency

Always when a continuous-mode issue escalates while another eligible automatable issue remains.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The runner stops after the current issue escalates, leaves the failed issue branch/state visible enough for interactive completion, removes unattended mode as appropriate, and does not select another automatable issue. |
| **Actual** | The runner logs an escalation, saves partial work, checks out `main`, resets state for the next cycle, and continues selecting another automatable issue. |

### Error Output

No single stack trace. The failure presents as runner control flow continuing after an `ESCALATION:` diagnostic for the active issue.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Continuous Mode Hard-Stops On Issue Escalation

**Given** the SDLC runner is processing an issue in continuous mode
**When** any step for that issue returns `escalated`
**Then** the runner stops instead of selecting another issue
**And** no subsequent `startIssue` step runs in the same invocation

### AC2: Failed Issue Remains The Manual Recovery Target

**Given** a step escalation saved partial work for the current issue
**When** the runner stops
**Then** logs and runner state identify the failed issue and branch
**And** the repository remains on the failed issue branch
**And** the operator can resume or complete that issue interactively without first undoing work on a later issue

### AC3: Successful Continuous Looping Is Preserved

**Given** an issue completes successfully through the merge step
**When** continuous mode reaches the end of that successful cycle
**Then** the runner may still select the next eligible automatable issue

### AC4: Terminal Escalation Exits Non-Zero

**Given** a continuous-mode step escalates and requires manual intervention
**When** the runner stops for that escalation
**Then** the process exits non-zero
**And** the run-loop skill reports the invocation as a failure instead of success

### AC5: Regression Coverage Proves The Real Terminal Path

**Given** runner tests simulate a continuous-mode issue escalation
**When** the main loop handles the `escalated` result
**Then** the test proves the runner sets a stop condition and non-zero exit status
**And** the test proves the failed branch is not checked out to `main`
**And** the test proves next-issue selection is not invoked after the escalation

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Change continuous-mode escalation handling so `result === 'escalated'` sets a runner stop condition and exits the outer loop. | Must |
| FR2 | Preserve or report the failed issue number and branch as the manual recovery target instead of resetting directly into next-cycle selection. | Must |
| FR3 | Keep successful continuous-mode completion behavior unchanged: after a clean merge, the runner can continue to the next automatable issue. | Must |
| FR4 | Do not check out `main` after a terminal escalation; leave the repository on the failed branch named by runner state. | Must |
| FR5 | Return a non-zero process status when continuous-mode escalation stops the runner. | Must |
| FR6 | Add regression coverage for continuous-mode escalation from a mid-cycle step, failed-branch preservation, non-zero exit status, and successful-cycle continuation. | Must |

---

## Out of Scope

- Removing continuous mode.
- Preventing the runner from selecting another issue after a successful issue merge.
- Changing unrelated skill prompt gates or draft/start/spec behavior.
- Fixing the separate GitHub-access false-positive classifier or stale pluginRoot recovery behavior.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #131 | 2026-04-27 | Initial defect report |
| #131 | 2026-04-27 | Added review findings for non-zero exit, failed-branch preservation, and stronger regression coverage |

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
