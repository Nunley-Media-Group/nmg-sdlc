# Defect Report: Prevent GitHub soft-failure matching from retrying on quoted historical text

**Issue**: #128
**Date**: 2026-04-27
**Status**: Approved
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Run `$nmg-sdlc:run-loop` on a repository where a child Codex session reads memory, rollout summaries, specs, or logs that contain the historical phrase `error connecting to api.github.com`.
2. Let the child step complete successfully with exit code 0 and emit valid next-step output, such as `Next step: $nmg-sdlc:write-code #278.`
3. Ensure the GitHub error phrase appears only as quoted or historical context, not as the output of a current failed `gh` command.
4. Observe `detectSoftFailure()` classify the combined child output as `text_pattern: github_access`.
5. Observe the runner retry the successful step until the retry budget is exhausted and the loop escalates.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS / Codex CLI; applies cross-platform to runner output parsing |
| **Version / Commit** | nmg-sdlc at `cf00998` before the issue #128 fix |
| **Browser / Runtime** | Node.js `scripts/sdlc-runner.mjs`, `codex exec --json`, GitHub CLI |
| **Configuration** | SDLC runner unattended mode with child Codex sessions that may read historical context |

### Frequency

Intermittent, triggered whenever otherwise-successful child output includes the GitHub access phrase as historical or quoted context.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The runner classifies real current GitHub access failures as `github_access`, but ignores the same phrase when it appears only in quoted, historical, or contextual text from memory, prior rollout summaries, specs, logs, or assistant prose. |
| **Actual** | Any raw occurrence of `error connecting to api.github.com` in combined child output can trigger `text_pattern: github_access`, even when the child step succeeded and the phrase was only quoted from old context. |

### Error Output

```text
Soft failure detected: text_pattern: github_access
```

The detected phrase may come from historical context rather than a current failed GitHub command:

```text
error connecting to api.github.com
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Live GitHub Access Failures Still Classify

**Given** child step output contains a current GitHub command failure such as `error connecting to api.github.com`
**When** `detectSoftFailure()` evaluates the output
**Then** it returns a soft failure
**And** the reason is `text_pattern: github_access`.

### AC2: Quoted Historical GitHub Errors Do Not Classify

**Given** child step output contains `error connecting to api.github.com` only inside memory excerpts, prior rollout summaries, specs, logs, or other quoted or historical context
**When** `detectSoftFailure()` evaluates the output
**Then** it does not return `github_access`
**And** the runner does not retry the step for that quoted phrase.

### AC3: Successful Child Steps Advance Despite Quoted GitHub Error Context

**Given** a child step exits 0 and emits successful completion text
**And** its transcript includes a quoted historical `api.github.com` failure
**When** the runner processes the step result
**Then** the step is marked complete
**And** the runner advances to the next step instead of burning retries.

### AC4: Regression Tests Cover True And False Positives

**Given** the runner test suite includes `detectSoftFailure()` coverage
**When** tests run
**Then** they cover a real GitHub access failure that still matches
**And** they cover quoted or historical context that must not match.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `github_access` text soft-failure detection must distinguish live command/tool failure output from quoted or historical context. | Must |
| FR2 | Real GitHub auth or network failures must continue to route through the existing soft-failure retry/escalation path. | Must |
| FR3 | Memory excerpts, prior rollout summaries, specs, logs, and child assistant prose that merely quote `error connecting to api.github.com` must not trigger retries by themselves. | Must |
| FR4 | Unit tests must lock both the real-failure and quoted-context paths. | Must |

---

## Out of Scope

- Removing `github_access` detection entirely.
- Changing child Codex launch permissions.
- Reworking unrelated permission-denial handling.
- Redesigning the full runner retry model.

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
| #128 | 2026-04-27 | Initial defect report |
