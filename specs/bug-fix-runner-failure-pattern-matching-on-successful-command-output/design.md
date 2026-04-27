# Root Cause Analysis: Fix runner failure-pattern matching on successful command output

**Issue**: #136
**Date**: 2026-04-27
**Status**: Fixed
**Author**: Codex

---

## Root Cause

The runner evaluates child Codex output as one combined text stream even though current `codex exec --json` output is structured JSONL. In the reproduced failure, a successful `item.completed` event for a read-only search command contained historical failure strings in `item.aggregated_output`. The runner treated that successful command output as live failure evidence because `matchGithubAccessFailure()` and `matchErrorPattern()` scan broad text surfaces without first excluding context-only successful command output.

The issue is not that specific phrases like `error connecting to api.github.com` or `context_window_exceeded` need more exceptions. The evidence boundary is wrong: output from a successful command/search is context the child inspected, not evidence that the current child step failed. Failure matching must remove successful command output before evaluating any soft-failure, hard-escalation, or wait patterns.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-runner.mjs` | 662-677 | `parseJsonEvents()` already parses JSONL events and can support source-aware filtering. |
| `scripts/sdlc-runner.mjs` | 1390-1405 | `matchErrorPattern()` applies unrecoverable and rate-limit regexes to raw combined output. |
| `scripts/sdlc-runner.mjs` | 1487-1504 | `matchGithubAccessFailure()` scans event JSON and non-JSON lines for GitHub access text without excluding successful command events. |
| `scripts/sdlc-runner.mjs` | 1522-1559 | `detectSoftFailure()` routes any GitHub access match into the soft-failure path before state extraction. |
| `scripts/sdlc-runner.mjs` | 2598-2605 | `runStep()` sends soft failures to `handleFailure()` before validating the successful step postcondition. |
| `scripts/sdlc-runner.mjs` | 1686-1704 | `handleFailure()` sends hard matches to escalation or wait behavior. |
| `scripts/__tests__/sdlc-runner.test.mjs` | 301-455, 851-966 | Existing tests cover text soft-failure and hard-pattern behavior but not successful command JSONL output. |

### Triggering Conditions

- A child Codex step reads or searches Codex memory during an otherwise successful workflow.
- The JSONL command event includes successful `aggregated_output` with historical failure strings.
- The runner scans that successful command output as live failure evidence before validating the step postcondition.

---

## Fix Strategy

### Approach

Add evidence-boundary filtering for runner failure evaluation. A new helper such as `isSuccessfulCommandExecutionEvent(event)` should identify JSONL events whose output comes from completed `command_execution` events with `exit_code: 0` by inspecting event metadata, not by matching failure strings in the output.

Add a helper such as `failureEvidenceOutput(output)` that walks the JSONL transcript line by line, drops successful command events entirely, and preserves failed command JSONL, terminal failures, and non-JSON output. `matchErrorPattern()` and `matchGithubAccessFailure()` then evaluate the filtered evidence stream. This ignores historical search results from successful commands, regardless of which strings they contain, while leaving real command failures, terminal failures, and plain stderr behavior intact.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` | Add `isSuccessfulCommandExecutionEvent(event)` that detects `command_execution` JSONL events with `exit_code: 0`. | Classifies successful command/search output before evaluating text; avoids phrase-specific exception lists. |
| `scripts/sdlc-runner.mjs` | Keep memory-origin event detection as a supplemental guard for Codex memory metadata. | Handles the reproduced memory-search source even if future JSONL events omit an exit code. |
| `scripts/sdlc-runner.mjs` | Add `failureEvidenceOutput(output)` that removes successful command JSONL event lines before failure-pattern matching. | Ensures historical search output is ignored by soft and hard failure classifiers. |
| `scripts/sdlc-runner.mjs` | Update `matchGithubAccessFailure()` to evaluate only failure-relevant events and non-JSON lines. | Prevents successful command GitHub text from triggering `text_pattern: github_access`. |
| `scripts/sdlc-runner.mjs` | Update `matchErrorPattern()` to run immediate escalation and rate-limit checks against failure-relevant output, while preserving `error_max_turns` terminal-event precedence. | Prevents successful command context-window, signal, and rate-limit text from triggering escalation or wait behavior. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add false-positive tests for successful JSONL command events containing GitHub, context-window, signal, and rate-limit phrases. | Locks the reproduced failure and issue acceptance criteria. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add true-positive tests for failed command events and direct plain stderr with the same failure phrases. | Proves real failures still classify. |

### Blast Radius

The change is confined to runner failure classification. It does not change child Codex launch arguments, retry counts, step state extraction, branch postcondition validation, structured `turn.failed`, `error_max_turns`, or `permission_denials` handling.

- **Direct impact**: `detectSoftFailure()`, `matchGithubAccessFailure()`, `matchErrorPattern()`, transcript parsing helpers, and runner tests.
- **Indirect impact**: GitHub-dependent and long-running runner steps that can read memory before completing: `startIssue`, `writeSpecs`, `implement`, `verify`, `createPR`, `monitorCI`, and `merge`.
- **Risk level**: Medium, because the fix changes what text surfaces count as failure evidence.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A new Codex event shape carries successful command output without exit-code metadata | Medium | Keep unmatched events failure-relevant rather than guessing. |
| Real failed commands stop matching | Low | Filter only command events with explicit `exit_code: 0`; add true-positive tests for failed command and plain stderr failures. |
| Historical failure text copied into later generic assistant prose still matches | Medium | Document this as residual risk: once source metadata is lost, the runner cannot prove the text came from successful command output without a broader assistant-message policy. |
| Hard-pattern matching remains broad outside successful command output | Low | This is intentional; the defect is historical context being treated as live evidence. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Filter only successful command events | Ignore `command_execution` events with `exit_code: 0`. | Selected; this matches the current Codex JSONL boundary and keeps failed commands failure-relevant. |
| Add exceptions for known failure strings in successful output | Skip specific patterns such as GitHub, context-window, signal, or rate-limit text when the command succeeded. | Solves only today's strings and keeps memory content in the failure-evidence stream. |
| Ignore all assistant prose and command output | Evaluate only structured terminal failure events. | Too large a behavior change; existing soft-failure patterns intentionally catch some text-only failures. |
| Strip only memory-origin events before failure matching | Remove source-context memory output from the evidence stream, regardless of text content. | Too narrow; the issue ACs cover successful command/search output generally, including specs and logs. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #136 | 2026-04-27 | Initial defect design |
