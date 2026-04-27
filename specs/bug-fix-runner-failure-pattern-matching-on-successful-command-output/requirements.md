# Defect Report: Fix runner failure-pattern matching on successful command output

**Issue**: #136
**Date**: 2026-04-27
**Status**: Fixed
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Run `$nmg-sdlc:run-loop` in a repository where a child Codex step performs a successful read-only search, such as `rg`, over memory, specs, logs, or other historical context.
2. Ensure the successful command output contains historical failure strings such as `error connecting to api.github.com`, `context_window_exceeded`, `signal: 9`, `signal: SIGKILL`, or `rate_limit`.
3. Let the child step complete successfully and emit a valid next-step handoff, such as the `startIssue` issue-ready block.
4. Observe the parent runner report a soft failure such as `text_pattern: github_access`.
5. Observe the parent runner enter `handleFailure()` and hard-stop or wait on a failure pattern that appeared only in successful command output.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS / Codex CLI; applies cross-platform to runner JSONL parsing |
| **Version / Commit** | nmg-sdlc `1.67.4`, observed while processing issue #135 |
| **Browser / Runtime** | Node.js `scripts/sdlc-runner.mjs`, `codex exec --json`, GitHub CLI |
| **Configuration** | `$nmg-sdlc:run-loop` continuous mode, runner-spawned child Codex sessions |

### Frequency

Intermittent, triggered when a successful child step reads memory containing historical failure text.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Successful command/search output is treated as context when it merely quotes historical failures. The runner classifies only failed command, terminal, direct stderr, and structured failure evidence. |
| **Actual** | The runner scans successful command output as ordinary failure evidence, so historical strings inside search results can produce `github_access`, `context_window_exceeded`, signal, or rate-limit handling even when the child command exited `0`. |

### Error Output

```text
Soft failure detected: text_pattern: github_access
Matched unrecoverable pattern: context_window_exceeded
```

The triggering text can come from a successful memory command event:

```json
{
  "type": "item.completed",
  "item": {
    "type": "command_execution",
    "command": "/bin/zsh -lc 'rg -n \"...\" /Users/rnunley/.codex/memories/MEMORY.md'",
    "aggregated_output": "historical `error connecting to api.github.com` text",
    "exit_code": 0,
    "status": "completed"
  }
}
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Successful Command Output Does Not Trigger GitHub Soft Failure Detection

**Given** a child Codex JSONL transcript contains an `item.completed` event for `command_execution`
**And** the command has `exit_code: 0`
**And** `aggregated_output` contains historical `error connecting to api.github.com` text
**When** `detectSoftFailure()` evaluates the transcript
**Then** it does not return `text_pattern: github_access`.

### AC2: Successful Command Output Does Not Trigger Hard Failure Or Wait Patterns

**Given** a child Codex JSONL transcript contains an `item.completed` event for `command_execution`
**And** the command has `exit_code: 0`
**And** `aggregated_output` contains historical `context_window_exceeded`, `signal: 9`, `signal: SIGKILL`, or `rate_limit` text
**When** `matchErrorPattern()` evaluates the transcript
**Then** it does not return an escalation or wait action for those historical search results.

### AC3: Real Failed Commands Still Classify Correctly

**Given** a child command, terminal event, or stderr output actually fails with GitHub access, rate-limit, context-window, or signal failure evidence
**When** the runner evaluates the transcript
**Then** the appropriate existing soft-failure, wait, or hard-escalation classification is preserved.

### AC4: Completed Start-Issue Handoffs Advance

**Given** `startIssue` exits successfully
**And** the repository is checked out on the issue branch
**And** failure strings appear only inside successful command output
**When** the parent runner evaluates Step 2
**Then** it records Step 2 complete
**And** it advances to `writeSpecs` instead of retrying or hard-stopping.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Failure-pattern matching must distinguish successful command/search output from live failed command or terminal output. | Must |
| FR2 | `github_access` detection must ignore historical phrases in successful `item.completed` / `command_execution` events with `exit_code: 0`. | Must |
| FR3 | Immediate escalation and wait pattern matching must ignore historical failure phrases in successful command output. | Must |
| FR4 | Real GitHub access, rate-limit, context-window, and signal failures must remain detectable in failed command, terminal, and direct stderr output. | Must |
| FR5 | Regression tests must cover current Codex JSONL `item.completed` / `command_execution` events for both false positives and true positives. | Must |

---

## Out of Scope

- Cleaning or editing memory entries as the fix
- Removing failure detection entirely
- Removing successful command output from logs, state extraction, or user-visible diagnostics
- Changing child Codex launch permissions
- Redesigning the full retry or bounce model
- Changing issue #135 feature implementation scope

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

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #136 | 2026-04-27 | Initial defect report |
