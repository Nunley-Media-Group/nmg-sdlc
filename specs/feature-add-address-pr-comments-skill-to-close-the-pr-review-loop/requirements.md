# Requirements: Add /address-pr-comments Skill

**Issues**: #86
**Date**: 2026-04-22
**Status**: Draft
**Author**: Rich Nunley

---

## User Story

**As a** developer using Codex or an automated SDLC runner
**I want** a local slash-command skill that reads the automated reviewer's unresolved threads on a PR, applies fixes via `/write-code` + `/verify-code`, and loops until the PR is review-clean
**So that** PR review findings are addressed without manually switching tools or copying comments into a new session

---

## Background

The SDLC pipeline currently ends at `/open-pr`. Step 7 of `/open-pr` optionally monitors CI and auto-merges, but it explicitly stops before any reviewer comments are posted — see `skills/open-pr/references/ci-monitoring.md`. The GitHub Codex app posts an automated review on every PR with actionable findings (e.g., `reply:` suggestions, bug reports, nit comments). Today those are addressed manually: read the review, open the changed files, apply each fix, push, wait for the re-review, repeat.

This skill closes the loop locally. It reads unresolved review threads from the automated reviewer via the GitHub GraphQL API, classifies each one, composes fixes through the existing `/write-code` and `/verify-code` sub-skills, replies to the thread, resolves the thread, and re-polls until the PR shows no `CHANGES_REQUESTED` reviews and no unresolved threads. It sits one position after `/open-pr` in the pipeline.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Entry Preconditions Validated

**Given** the skill is invoked with (or without) a PR number argument
**When** the workflow starts
**Then** the skill resolves the target PR (from the argument, else from the current branch via `gh pr view --json number`), verifies the PR is open, verifies the current branch matches the PR's head ref, and verifies the working tree is clean (no staged or unstaged changes)
**And** if any precondition fails, the skill prints a single-line diagnostic naming the failed predicate and exits non-zero without modifying any files

### AC2: Fetch Unresolved Review Threads via GraphQL

**Given** preconditions passed
**When** the skill polls for review threads
**Then** it runs a GraphQL query against `repository(owner, name).pullRequest(number).reviewThreads(first: 100)` selecting `isResolved`, `id`, and `comments(first: 50)` with `{ body, author { login, __typename }, path, line, diffHunk }`
**And** filters to threads where `isResolved == false` AND at least one comment's `author.__typename == "Bot"` OR `author.login` matches the configured automated-reviewer login (see FR10)
**And** on GraphQL or network failure, prints the error and exits non-zero without retry — the SDLC runner owns retry semantics

### AC3: Short-Circuit on Review-Clean Entry

**Given** no unresolved automated-reviewer threads exist AND `gh pr reviews` returns no `CHANGES_REQUESTED` state
**When** the skill finishes the initial fetch
**Then** the skill prints `PR #N is review-clean — no action taken.` and exits zero without invoking any sub-skill, without committing, and without pushing

### AC4: No Automated Reviewer on the PR

**Given** the PR exists but no review has been posted by the automated reviewer (every fetched thread's `author.login` fails the reviewer-identity filter, OR `gh pr reviews` returns an empty array)
**When** the skill finishes the initial fetch
**Then** the skill prints `No automated-reviewer threads found on PR #N — nothing to address.` and exits zero
**And** this path is distinguished from AC3 in the exit message so the SDLC runner can log the difference between "reviewer ran and found nothing" and "reviewer never ran"

### AC5: Classify Each Unresolved Thread

**Given** one or more unresolved reviewer threads
**When** each thread is evaluated
**Then** each is classified as exactly one of:
- `clear-fix` — the comment text names a specific file/line, the requested change is unambiguous, and Codex can execute it without further clarification
- `ambiguous` — the intent is unclear, multiple valid approaches exist, or the comment requests a decision the spec has not made
- `disagreement` — after reading the current code, Codex assesses the comment as incorrect (false positive, based on a misreading, or already addressed)

**And** the classification rationale (one sentence) is retained in memory so it can be surfaced in the reply body (AC8) and in the escalation sentinel (AC10)

### AC6: Fix Clear-Fix Threads via /write-code + /verify-code

**Given** a thread classified as `clear-fix`
**When** the skill addresses it
**Then** `/write-code` is invoked as a sub-skill with the thread text, file path, line number, and diff hunk passed as context
**And** `/verify-code` is invoked after `/write-code` completes
**And** the fix is committed with a Conventional-Commit `fix:` prefix (e.g., `fix: address review finding on {file}:{line}`) on the current branch

### AC7: Postcondition Verification Before Reply

**Given** `/write-code` and `/verify-code` have both completed for a `clear-fix` thread
**When** the skill decides whether to reply and resolve
**Then** it verifies the postcondition: the commit SHA changed, the fix commit touches the file referenced in the thread (when the thread names a file), and `/verify-code` reported no regressions against existing ACs
**And** if any postcondition fails, the skill does NOT post a reply, does NOT resolve the thread, escalates per AC10 (treating it as an `ambiguous` outcome for this round), and continues to the next thread

### AC8: Reply and Resolve Successful Fixes

**Given** `/write-code` + `/verify-code` + postcondition verification all succeeded for a `clear-fix` thread
**When** the skill responds
**Then** it posts a reply to the thread via `gh api` REST (`POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`) with a one-to-three-sentence body describing the change and naming the fix commit SHA
**And** marks the thread resolved via GraphQL `resolveReviewThread` mutation with the thread node ID

### AC9: Ambiguous or Disagreement in Interactive Mode

**Given** a thread classified as `ambiguous` or `disagreement`
**And** `.codex/unattended-mode` does NOT exist
**When** the skill processes the thread
**Then** `interactive prompt` is called with the thread text, the classification, Codex's rationale, and three options: `Fix it anyway` / `Skip — leave unresolved` / `Reply without fixing`
**And** the user's selection drives the outcome: `Fix it anyway` re-runs the clear-fix flow (AC6–AC8), `Skip` leaves the thread unresolved and records it in the skipped-set (see AC12), `Reply without fixing` posts a reply explaining why no change is being made and leaves the thread unresolved (the human reviewer decides whether to resolve)

### AC10: Ambiguous or Disagreement in Unattended Mode

**Given** a thread classified as `ambiguous` or `disagreement`
**And** `.codex/unattended-mode` exists
**When** the skill processes the thread
**Then** the skill prints an escalation sentinel line matching `^ESCALATION: address-pr-comments — ` followed by the PR number, thread node ID, classification, and one-sentence rationale
**And** `interactive prompt` is NOT called
**And** the thread is added to the skipped-set (AC12) and left unresolved; the loop continues to the next thread

### AC11: Push After Each Round

**Given** one or more commits were produced in the current round
**When** the round ends
**Then** the skill runs `git push` (no `--force`, no `--force-with-lease`, no `--force-if-includes` — AC14)
**And** if the push fails with a non-fast-forward rejection (e.g., remote has diverged), the skill prints the rejection, does NOT attempt any force variant, and exits non-zero so the user can reconcile manually

### AC12: Loop Until Review-Clean or Round Cap

**Given** a round has finished processing all fetched threads and pushing
**When** the loop re-evaluates
**Then** the skill waits for the reviewer to re-run (poll interval: 30 seconds; poll timeout: 30 minutes — mirroring `/open-pr` Step 7's `ci-monitoring.md` constants)
**And** re-fetches unresolved threads; threads in the skipped-set from prior rounds are excluded from re-processing **within the same skill invocation** (they remain unresolved on the PR but the skill will not re-evaluate them to avoid livelock)
**And** the loop exits successfully when `gh pr reviews` shows no `CHANGES_REQUESTED` state AND the unresolved-minus-skipped set is empty
**And** the loop exits with a non-zero code and a diagnostic when the round counter reaches the configured round cap (default 10 — see FR8) without reaching review-clean

### AC13: Re-Review Timeout

**Given** the skill has pushed fix commits and is polling for the reviewer to re-run
**When** 30 minutes elapse without any new review thread appearing and without `gh pr reviews` flipping out of `CHANGES_REQUESTED` state
**Then** the skill prints `Re-review polling timeout reached after 30 min on round {N} — exiting so you can investigate.` and exits non-zero
**And** the exit does NOT resolve any remaining threads and does NOT amend or revert any commits

### AC14: No Force-Push Under Any Circumstance

**Given** any push invocation inside the skill (per-round push, retry, or final push)
**When** the push command is built
**Then** only `git push` is used — `--force`, `--force-with-lease`, and `--force-if-includes` are never passed, regardless of interactive vs unattended mode, regardless of push-rejection reason, and regardless of any user selection in `interactive prompt`

### AC15: Unattended-Mode Livelock Guard

**Given** unattended mode is active
**And** a round produces zero commits because every thread in that round was classified `ambiguous` or `disagreement` (all escalated per AC10)
**When** the loop considers starting another round
**Then** the skill exits zero with a summary line `Round {N}: {M} threads escalated, 0 fixes applied — exiting unattended loop.` — re-fetching would yield the same set and livelock the runner

### AC16: SDLC Pipeline Diagram Updated

**Given** the README and each downstream skill's "Integration with SDLC Workflow" section show the pipeline diagram
**When** this skill ships
**Then** the pipeline diagram includes `/address-pr-comments #N` as a distinct step after `/open-pr #N` in README.md and in every SDLC skill's `## Integration with SDLC Workflow` section that shows the full chain

---

### Generated Gherkin Preview

```gherkin
Feature: /address-pr-comments skill
  As a developer or SDLC runner
  I want automated reviewer threads addressed locally in a loop
  So that the PR review loop closes without manual intervention

  Scenario: Entry preconditions validated
    Given the skill is invoked on an open PR with a matching branch and clean working tree
    When the workflow starts
    Then preconditions pass and the workflow proceeds to fetching threads

  Scenario: Short-circuit on review-clean entry
    Given no unresolved automated-reviewer threads exist
    When the skill finishes the initial fetch
    Then the skill prints a review-clean message and exits zero

  Scenario: Fix a clear-fix thread end-to-end
    Given an unresolved clear-fix thread with a specific file and line
    When the skill addresses it
    Then /write-code and /verify-code run, the fix is committed, the thread reply is posted, and the thread is resolved

  Scenario: Ambiguous thread in interactive mode prompts user
    Given an ambiguous thread and no unattended sentinel
    When the skill processes it
    Then interactive prompt is called with Fix / Skip / Reply-without-fixing options

  Scenario: Disagreement thread in unattended mode escalates
    Given a disagreement thread and the unattended sentinel present
    When the skill processes it
    Then an ESCALATION line is printed and the thread is left unresolved

  Scenario: Loop caps at configured round limit
    Given the round counter reaches the configured maximum without reaching review-clean
    When the loop re-evaluates
    Then the skill exits non-zero with a round-cap diagnostic

  Scenario: Unattended livelock guard
    Given a round where every thread was escalated in unattended mode
    When the loop considers another round
    Then the skill exits zero with a livelock summary

  Scenario: Force-push never used
    Given any push inside the loop
    When the push command is built
    Then only `git push` without any force variant is used

  # ... additional ACs become scenarios per full list above
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Fetch unresolved review threads via GitHub GraphQL `pullRequest.reviewThreads` | Must | `first: 100` on threads; `first: 50` on nested comments |
| FR2 | Filter to automated-reviewer threads via `author.__typename == "Bot"` OR configured login match | Must | Human threads are explicitly out of scope |
| FR3 | Classify each thread as `clear-fix` / `ambiguous` / `disagreement` with a one-sentence rationale | Must | Rationale surfaces in reply bodies and escalation sentinels |
| FR4 | Invoke `/write-code` and `/verify-code` as in-session sub-skills for each `clear-fix` thread | Must | Passed thread context: text, file, line, diff hunk |
| FR5 | Verify postconditions after `/write-code` + `/verify-code` (commit SHA changed, correct file touched, no regressions) before replying | Must | Prevents self-reported-success false positives (per retrospective learning on delegation verification) |
| FR6 | Post a reply to each successfully addressed thread via `gh api` REST and resolve it via GraphQL `resolveReviewThread` | Must | Reply body names the fix commit SHA |
| FR7 | Loop: fetch → classify → fix → commit → push → poll → re-fetch → repeat until review-clean | Must | Mirrors `/open-pr` Step 7 polling constants: 30s interval, 30min timeout |
| FR8 | Cap the loop at a configurable maximum round count (default: 10) to prevent pathological infinite review cycles | Should | Configurable via skill argument `--max-rounds=N` |
| FR9 | Integrate into the SDLC pipeline diagram after `/open-pr` in README and every SDLC skill's Integration section | Should | Keeps dogfooding documentation consistent |
| FR10 | Automated-reviewer identity is configurable (default: matches `Bot` typename, plus an allow-list of known reviewer logins) | Should | Accommodates future reviewer identities without a skill edit |
| FR11 | Emit an escalation sentinel matching `^ESCALATION: address-pr-comments — ` for each escalated thread in unattended mode | Must | SDLC runner parses this pattern |
| FR12 | Never force-push under any circumstance | Must | Plain `git push` only; reject with non-zero on non-fast-forward |
| FR13 | Short-circuit exits (AC3, AC4, AC15) are distinguishable in stdout so the SDLC runner can log the reason | Should | Different message per exit branch |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Per-round budget: 30s poll interval × 60 polls = 30 min cap (matches `/open-pr` Step 7); round cap default 10 = 5-hour absolute upper bound |
| **Security** | Uses `gh` CLI's existing `GITHUB_TOKEN` auth; no new secrets; no shell-injected review text into commands (review bodies must be passed as argument values, not concatenated into `-c '...'` strings) |
| **Reliability** | Every termination path (short-circuit, round-cap, re-review timeout, livelock, push rejection, GraphQL error) produces a distinct exit message; working tree left clean on exit |
| **Platforms** | macOS, Windows, Linux per `steering/tech.md` — POSIX shell syntax only, `gh` CLI as the only external tool |

---

## Dependencies

### Internal Dependencies

- [ ] `/write-code` sub-skill (invoked per `clear-fix` thread)
- [ ] `/verify-code` sub-skill (invoked per `clear-fix` thread)
- [ ] `references/unattended-mode.md` (shared sentinel semantics)
- [ ] `references/legacy-layout-gate.md` (layout precondition)

### External Dependencies

- [ ] `gh` CLI with GraphQL support (`gh api graphql`) — already a project dependency (see `steering/tech.md`)
- [ ] GitHub `reviewThreads` GraphQL connection (GA feature, no flag required)

### Blocked By

- [ ] None

---

## Out of Scope

- **Human-reviewer comments** — different social dynamics (nits vs. blockers, style vs. correctness, maintainer preferences); covered separately if ever needed
- **CI failure handling** — already owned by `/open-pr` Step 7
- **PR creation or description edits** — owned by `/open-pr`
- **Force-push, `--force-with-lease`, or `--force-if-includes`** — never permitted regardless of situation (AC14, FR12)
- **Cloud-based or remote execution** — this is a local skill only; a separate cloud-review skill (`/ultrareview`) exists and is not part of this work
- **Modifying CI configuration or branch protection** — the skill operates on PR review state only
- **Rewriting history in the loop** — no `git commit --amend`, no interactive rebase; each round produces forward commits only

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Review-clean PRs after one round | ≥ 60% of automated-reviewer PRs with clear-fix-only findings | Runner log: ratio of `Round 1: review-clean` exits to total skill invocations |
| Livelock rate in unattended mode | 0% across a 2-week runner window | Runner log: count of `livelock summary` exits vs. total runs |
| Force-push incidents | 0 | `git reflog` audit on any PR that ran this skill |

---

## Open Questions

- [ ] Which automated-reviewer logins should be in the default allow-list (FR10)? The issue mentions the GitHub Codex app — does it post as `codex[bot]`, `github-actions[bot]`, or a custom login? The skill must be authored to read this from a per-project config (e.g., a value in `steering/tech.md`), not hardcode it.
- [ ] When `/write-code` or `/verify-code` themselves escalate (e.g., unattended-mode spec-missing escalation), does this skill treat that as "postcondition failed → escalate this thread" (AC7 path) or a hard exit? Current draft treats it as per-thread escalation, not a hard exit, because the PR may have other threads that remain fixable.
- [ ] Should the skill leave a final summary comment on the PR (outside any thread) enumerating resolved vs. skipped threads, or is thread-level replies sufficient? Current draft: thread-level only.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #86 | 2026-04-22 | Initial feature spec |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements (design decisions deferred to Phase 2)
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases and error states are specified (AC1, AC3, AC4, AC7, AC11, AC13, AC15)
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented
