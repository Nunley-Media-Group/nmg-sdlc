# Tasks: Fix runner failure-pattern matching on successful command output

**Issue**: #136
**Date**: 2026-04-27
**Status**: Fixed
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add successful-command transcript detection | [x] |
| T002 | Route failure classifiers through filtered evidence | [x] |
| T003 | Add regression tests for successful-command filtering and true failures | [x] |
| T004 | Verify runner behavior and spec alignment | [x] |

---

### T001: Add Successful-Command Transcript Detection

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] A helper such as `isSuccessfulCommandExecutionEvent(event)` detects `item.completed` / `command_execution` JSONL events with `exit_code: 0` before inspecting failure text.
- [x] The helper handles both top-level and `item`-nested command-execution metadata.
- [x] Successful command events are excluded from failure-pattern matching regardless of whether the command read memory, specs, logs, or another context source.
- [x] Failed command events and events without explicit successful command metadata remain failure-relevant.
- [x] Supplemental memory-origin detection remains available for Codex memory metadata that proves context-only output.

**Notes**: Do not make the predicate depend on known failure strings. The successful-command evidence boundary is the contract.

### T002: Route Failure Classifiers Through Filtered Evidence

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] A helper such as `failureEvidenceOutput(output)` removes successful command JSONL event lines while preserving failed command JSONL, terminal failures, and non-JSON output.
- [x] `matchGithubAccessFailure()` evaluates failure-relevant events and non-JSON lines only.
- [x] `matchErrorPattern()` applies `IMMEDIATE_ESCALATION_PATTERNS` and `RATE_LIMIT_PATTERN` to failure-relevant output, not raw transcript output.
- [x] Existing `error_max_turns`, `turn.failed`, `permission_denials`, failed command output, direct stderr, and Step 2 branch postcondition behavior are preserved.
- [x] The implementation preserves successful command output for logs and state extraction; only failure-pattern matching uses the filtered evidence stream.

### T003: Add Regression Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [x] `detectSoftFailure()` returns `{ isSoftFailure: false }` when a successful command event contains historical `error connecting to api.github.com`.
- [x] `matchErrorPattern()` returns `null` when a successful command event contains historical `context_window_exceeded`, `signal: 9`, `signal: SIGKILL`, or `rate_limit`.
- [x] Failed command events containing real GitHub access failure text still classify as `text_pattern: github_access`.
- [x] Failed command or direct stderr output containing real context-window, signal, or rate-limit evidence still routes to the existing escalation or wait action.
- [x] Tests use representative current Codex JSONL `item.completed` / `command_execution` events.

### T004: Verify Runner Behavior And Spec Alignment

**File(s)**: `scripts/sdlc-runner.mjs`, `scripts/__tests__/sdlc-runner.test.mjs`, `specs/bug-fix-runner-failure-pattern-matching-on-successful-command-output/feature.gherkin`
**Type**: Verify (no file changes)
**Depends**: T003
**Acceptance**:
- [x] `node --check scripts/sdlc-runner.mjs` passes.
- [x] `npm --prefix scripts test -- --runInBand` passes.
- [x] `git diff --check -- scripts/sdlc-runner.mjs scripts/__tests__/sdlc-runner.test.mjs specs/bug-fix-runner-failure-pattern-matching-on-successful-command-output` passes.
- [x] Each acceptance criterion in `requirements.md` maps to one `@regression` scenario in `feature.gherkin`.
- [x] The verification notes call out the residual risk for historical failure text copied into later assistant prose after source metadata is lost.

**Notes**: Residual risk remains when historical failure text is copied into later assistant prose or another unstructured surface after source metadata is lost; that text cannot be proven to be successful-command context by the runner.

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix -- no feature work
- [x] Regression test is included
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #136 | 2026-04-27 | Initial defect task plan |
