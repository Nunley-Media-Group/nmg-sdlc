# Root Cause Analysis: Prevent GitHub soft-failure matching from retrying on quoted historical text

**Issue**: #128
**Date**: 2026-04-27
**Status**: Approved
**Author**: Codex

---

## Root Cause

`detectSoftFailure()` currently applies `TEXT_FAILURE_PATTERNS` to broad text surfaces after structured JSON checks finish. The `github_access` pattern is a plain regex for `error connecting to api.github.com`, so any occurrence of that phrase is treated as a live GitHub access blocker. That was correct for plain stderr from a failed `gh` command, but it is too broad for Codex child transcripts because successful terminal result text can quote prior failures from memory, rollout summaries, specs, or logs.

The false positive happens because the detection path does not distinguish source context. `getEventMessage()` includes terminal `result` text, which can be assistant prose summarizing work completed successfully. `detectSoftFailure()` then calls `matchTextFailure(eventMessage)` and later falls back to scanning the whole combined stdout/stderr string for `github_access`. Both paths can see historical text even when the child step exited 0 and produced valid next-step output.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-runner.mjs` | 1289-1304 | Defines `TEXT_FAILURE_PATTERNS` and applies regex matches without source context. |
| `scripts/sdlc-runner.mjs` | 1322-1360 | `detectSoftFailure()` scans terminal event message and combined output for text patterns after structured checks. |
| `scripts/sdlc-runner.mjs` | 2371-2378 | `runStep()` routes any soft failure from combined child output into `handleFailure()`, causing retries/escalation. |
| `scripts/__tests__/sdlc-runner.test.mjs` | 294-328 | Existing GitHub access tests prove true-positive matching but currently encode a successful JSON-result false positive as expected behavior. |

### Triggering Conditions

- A child Codex step exits 0 and emits successful completion or next-step text.
- The combined child output contains `error connecting to api.github.com` as memory, rollout summary, spec, log, or quoted assistant context.
- `detectSoftFailure()` scans that quoted text with the same regex used for live CLI failure output.

---

## Fix Strategy

### Approach

Keep the existing soft-failure return shape and retry path, but move `github_access` out of the undifferentiated raw-text regex flow. GitHub access detection should be source-aware: match direct CLI stderr/plain output, failed terminal events, or explicit tool-originated output, but ignore the phrase when it appears only inside terminal success/result prose.

The minimal implementation can add a dedicated helper such as `matchGithubAccessFailure(output, context)` and a small raw-line helper such as `nonJsonLines(output)`. `detectSoftFailure()` should keep generic text matching for patterns where broad assistant prose is itself the failure signal (`plan approval`, `request_user_input in unattended-mode`), while using the GitHub-specific helper for `github_access`.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` | Replace the generic `github_access` regex path with source-aware GitHub access classification. | Prevents historical or quoted text from being treated as a current GitHub blocker. |
| `scripts/sdlc-runner.mjs` | Preserve matching for direct non-JSON lines containing the GitHub CLI failure phrase, including stderr combined with JSON stdout. | Real `gh` network/auth failures still enter the existing retry/escalation path. |
| `scripts/sdlc-runner.mjs` | Preserve matching for failed terminal events or explicit tool-originated events that carry the GitHub access phrase. | A child that actually fails GitHub access but exits through Codex JSON still remains detectable. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add false-positive tests for quoted memory/spec/log/assistant-result context and adjust the current successful JSON-result test. | Locks the reproduced bug and prevents future broad-regex regression. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Keep true-positive coverage for plain GitHub CLI output and stderr combined with JSON stdout. | Confirms FR2 while narrowing FR1. |

### Blast Radius

The change is confined to text soft-failure classification for `github_access`. It does not change `handleFailure()`, retry counts, step state extraction, child launch arguments, structured `error_max_turns`, `turn.failed`, or `permission_denials` handling.

- **Direct impact**: `detectSoftFailure()`, text failure helpers, and related runner unit tests.
- **Indirect impact**: Runner steps that depend on soft-failure detection before state extraction, especially GitHub-dependent `startIssue`, `writeSpecs`, `createPR`, `monitorCI`, and `merge`.
- **Risk level**: Medium, because over-narrowing `github_access` could hide a real GitHub access blocker while over-broad matching preserves the current false positive.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Real plain-text GitHub failures stop matching | Low | Keep direct non-JSON line matching for `error connecting to api.github.com` and the companion GitHub status hint. |
| Successful JSON terminal result text still false-positives | Medium | Add tests where a `subtype: "success"` / `result` message quotes the GitHub error and must return `isSoftFailure: false`. |
| Tool-originated GitHub failures are accidentally ignored | Medium | Match failed terminal events and any explicit tool-output event surface the existing stream parser can identify; cover with representative JSONL tests. |
| Generic text-pattern behavior regresses | Low | Leave non-GitHub text patterns in `TEXT_FAILURE_PATTERNS` and keep existing plan approval / unattended-mode tests. |

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Remove `github_access` from text detection entirely | Do not classify GitHub access text as soft failure. | Eliminates false positives. | Violates AC1/FR2 and regresses issue #122 behavior. | Rejected |
| Require structured JSON failure only | Match GitHub access only from `turn.failed` or structured error fields. | Very low false-positive risk. | Misses real plain stderr combined with JSON stdout, which existing tests cover. | Rejected |
| Source-aware GitHub access helper | Keep matching live CLI/tool failure surfaces while ignoring terminal success prose and JSON-encoded historical context. | Preserves intended true positives and fixes reproduced false positives. | Slightly more code than a single regex. | Selected |

---

## Validation

- Run `cd scripts && npm test` after implementation.
- Confirm `detectSoftFailure()` returns `text_pattern: github_access` for direct GitHub CLI failure output.
- Confirm `detectSoftFailure()` returns `{ isSoftFailure: false }` for successful Codex JSON result text that quotes `error connecting to api.github.com` as history.
- Confirm existing `plan approval`, `request_user_input in unattended-mode`, `error_max_turns`, `turn.failed`, and `permission_denials` tests still pass.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #128 | 2026-04-27 | Initial defect design |
