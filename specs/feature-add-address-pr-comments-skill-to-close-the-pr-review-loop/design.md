# Design: Add /address-pr-comments Skill

**Issues**: #86
**Date**: 2026-04-22
**Status**: Draft
**Author**: Rich Nunley

---

## Overview

`/address-pr-comments` is a new stack-agnostic Claude Code skill that closes the PR review loop locally. It ships as a progressive-disclosure skill bundle (thin `SKILL.md` skeleton plus per-skill references) at `skills/address-pr-comments/` and slots into the pipeline immediately after `/open-pr`. The skill fetches unresolved automated-reviewer threads via GitHub GraphQL, classifies each one as `clear-fix` / `ambiguous` / `disagreement`, then drives `/write-code` + `/verify-code` as in-session sub-skills to apply fixes, replies and resolves each successful thread, pushes (never force), polls for re-review, and loops until the PR is review-clean or a round cap is reached.

The architecturally interesting parts are (a) the sub-skill invocation contract — this is the first SDLC skill whose work unit is a review-thread instead of a task from `tasks.md`, so the existing `/write-code` skill's entry path through plan mode has to be bypassed cleanly; (b) the postcondition-verification gate between the sub-skill return and the thread-resolve action, which implements the retrospective learning that self-reported success is never sufficient to close a loop; and (c) the unattended-mode livelock guard that distinguishes "zero commits because nothing needed fixing" (AC3/AC4 — safe exit) from "zero commits because every thread was escalated" (AC15 — deliberate exit to prevent the runner from oscillating).

Authoring follows the project's architectural invariant: every file in the new skill bundle — `SKILL.md`, each per-skill reference, and any template — MUST be produced through `/skill-creator` during implementation. The spec and this design are the input; `/skill-creator` is the authoring tool.

---

## Architecture

### Component Diagram

Reference `steering/structure.md` for the plugin's layer architecture. The new skill adds one directory under `skills/` and touches cross-skill documentation:

```
skills/address-pr-comments/
├── SKILL.md                            ← Thin workflow skeleton (≤ 500 lines)
└── references/                         ← On-demand progressive disclosure
    ├── fetch-threads.md                ← GraphQL query shape + reviewer-identity filter
    ├── classification.md               ← clear-fix / ambiguous / disagreement rules
    ├── fix-loop.md                     ← Sub-skill invocation + postcondition gate + reply/resolve
    ├── escalation.md                   ← Interactive prompt + unattended sentinel
    └── polling.md                      ← Round cap, re-review wait, livelock guard, exit messages

Existing files touched (cross-cutting):
steering/tech.md                         ← Add reviewer allow-list config (FR10)
README.md                                ← Update pipeline diagram (AC16)
skills/*/SKILL.md                        ← Update pipeline diagram in every "Integration with SDLC Workflow" section that shows the chain (AC16)
CHANGELOG.md                             ← Add [Unreleased] entry
```

Runtime interaction between the new skill and existing infrastructure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  /address-pr-comments #N [--max-rounds=10]                              │
└─────────┬───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Legacy-layout gate + unattended-mode detect + preconditions    │
│  (AC1) — shared references/legacy-layout-gate.md, unattended-mode.md    │
└─────────┬───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Fetch threads (GraphQL)  ──── references/fetch-threads.md      │
│  ─ short-circuit AC3 (review-clean) / AC4 (no reviewer) exit here       │
└─────────┬───────────────────────────────────────────────────────────────┘
          │ (unresolved threads present)
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Round loop (round counter starts at 1, cap default 10)                 │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Step 3: Classify each thread  ─── references/classification.md   │   │
│  └───┬───────────────────────┬───────────────────────┬──────────────┘   │
│      │ clear-fix             │ ambiguous/disagree    │ (interactive)    │
│      ▼                       ▼                       ▼                  │
│  ┌─────────────┐         ┌──────────────┐       ┌──────────────┐        │
│  │ fix-loop.md │         │ escalation.md│       │ AskUserQn    │        │
│  │             │         │ (ESCALATION: │       │ Fix/Skip/    │        │
│  │ /write-code │         │  sentinel)   │       │ Reply-only   │        │
│  │ /verify-code│         └──────┬───────┘       └──────┬───────┘        │
│  │ postcond √  │                │                      │                │
│  │ reply+resolv│                ▼                      ▼                │
│  └──────┬──────┘            skipped-set          (route per choice)     │
│         │                                                               │
│         ▼                                                               │
│  Step 4: git push (no-force AC14) — AC11                                │
│         │                                                               │
│         ▼                                                               │
│  Step 5: Poll re-review — references/polling.md                         │
│    ─ livelock guard AC15 (unattended, 0 commits) exits here             │
│    ─ re-review timeout AC13 (30 min) exits here                         │
│    ─ round cap AC12 exits here                                          │
│    ─ review-clean → exit zero                                           │
│    ─ otherwise increment round counter, loop back to Step 3             │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. The skill receives `#N` (optional) and any flags; resolves PR number from the current branch if absent.
2. Legacy-layout gate and unattended-mode detection run once at the top (shared references).
3. Preconditions verify PR is open, branch matches PR head, working tree is clean; failures exit non-zero.
4. GraphQL fetch returns the unresolved reviewThreads. Author-identity filtering narrows to automated-reviewer threads.
5. For each unresolved thread: classify → route (fix / escalate / prompt) → record outcome.
6. Commits produced in the round are pushed with plain `git push` (no force variants, ever).
7. Polling loop waits for the automated reviewer to re-run (30 s interval × 60 polls = 30 min ceiling — same constants as `/open-pr` Step 7).
8. Re-fetch threads; threads in the in-process skipped-set are excluded (livelock prevention within the invocation — they remain unresolved on the PR).
9. Loop exits on: review-clean (zero), round cap reached (non-zero), re-review timeout (non-zero), livelock guard (zero), push rejection (non-zero), GraphQL/network failure (non-zero).

---

## API / Interface Changes

### New Slash Command

| Invocation | Purpose |
|-----------|---------|
| `/address-pr-comments` (no arg) | Resolve PR from current branch; run the loop with default round cap |
| `/address-pr-comments #N` | Target PR #N explicitly |
| `/address-pr-comments [#N] --max-rounds=K` | Override the default round cap (default 10) |

### SKILL.md Frontmatter (Anthropic Skill Schema)

The frontmatter is authored via `/skill-creator`; the values below are the design intent, not a literal file to write by hand.

| Field | Value | Rationale |
|-------|-------|-----------|
| `name` | `address-pr-comments` | Matches the slash command |
| `description` | Triggers on user phrases like "address PR comments", "fix PR review findings", "respond to reviewer", "close the review loop", "handle reviewer comments for #N". Explicitly excludes creating PRs, handling CI, and human-reviewer comments. Seventh step in the SDLC pipeline — follows `/open-pr`. | Matches existing skill description shape; mentions ordering |
| `argument-hint` | `[#issue-or-pr-number] [--max-rounds=N]` | Matches `/open-pr`, `/verify-code`, `/write-code` patterns |
| `allowed-tools` | `Read, Glob, Grep, Task, Write, Edit, AskUserQuestion, Bash(gh:*), Bash(git:*), Bash(sleep:*)` | Minimum set for GraphQL calls, git commits/pushes, sub-skill delegation, and interactive prompts |
| `model` | `opus` | Classification + rationale generation benefit from opus; per-step-effort table in `steering/tech.md` can override later |
| `effort` | `high` | Multi-round loop with sub-skill calls — budget matches `/verify-code` |

### GitHub API Surface

The skill uses the `gh` CLI exclusively (no new dependencies; aligns with `steering/tech.md`).

**GraphQL queries** (via `gh api graphql -f query=…`):

| Query | Fields | Purpose |
|-------|--------|---------|
| `reviewThreadsQuery` | `repository(owner,name).pullRequest(number).reviewThreads(first:100){ nodes { id, isResolved, comments(first:50){ nodes { body, author{login,__typename}, path, line, diffHunk, databaseId } } } }` | Fetch all review threads with enough context to classify and reply |
| `resolveThreadMutation` | `resolveReviewThread(input:{threadId:"..."}) { thread { isResolved } }` | Mark a thread resolved after a successful fix |

**REST calls** (via `gh api`):

| Endpoint | Purpose |
|----------|---------|
| `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies` | Post a reply to a thread (body names the fix commit SHA) |

**gh CLI wrappers** (existing behaviour):

| Command | Purpose |
|---------|---------|
| `gh pr view [#N] --json number,state,headRefName,headRepositoryOwner` | Resolve PR, check state, confirm branch match |
| `gh pr reviews [#N] --json state,author` | Entry short-circuit (AC3/AC4) and loop re-evaluation (AC12) |

All `gh api` invocations pass variables via `-F` / `-f` flags so review bodies are never concatenated into shell strings (security constraint from NFR and `steering/tech.md`).

### Sub-Skill Invocation Contract

The skill invokes `/write-code` and `/verify-code` through Claude Code's in-session slash-command mechanism (the same pathway `/run-loop` uses, where the current Claude session sees the command in its own output and actions it). The chosen surface is:

1. **`/write-code` — per `clear-fix` thread**. Because `/write-code` normally reads `specs/{feature-name}/tasks.md`, the address-pr-comments skill MUST pass a synthetic task description in the invocation context (thread body, file path, line range, diff hunk) so `/write-code`'s Step 5 delegation to `spec-implementer` targets the right change. The fallback `/write-code` path (inline implementation) handles this naturally — the skill invokes with an inline context block rather than a spec reference.
2. **`/verify-code` — per `clear-fix` thread**. Targets the just-made commit; `/verify-code` runs exercise testing if `skills/**/SKILL.md` is touched (which IS the case for this project's dogfooding cycle).
3. **Error handling**. If a sub-skill escalates (e.g., `/write-code` emits its own `ESCALATION:` line because specs are missing for its internal precondition), the address-pr-comments skill treats that outcome as "postcondition failed for this thread" per AC7 — the thread joins the skipped-set, the skill continues to the next thread, and the whole invocation does NOT hard-exit (per Open Question 2 from requirements.md, now resolved this way).

### Configuration Surface

`steering/tech.md` gains a new row under the **External Services** section (or a dedicated "Automated Review" subsection) listing the reviewer-identity allow-list:

```markdown
| GitHub Automated Reviewer | PR review threads authored by this reviewer login or by any `Bot` typename are treated as addressable by `/address-pr-comments`. Default: `{ bots: true, logins: ["claude[bot]"] }`. Override by editing the JSON-like value below. |
```

The `/address-pr-comments` skill reads this section (following the existing pattern used by `/open-pr` for the version-bump matrix) so adding a new reviewer login is a data change, not a skill edit (per the retrospective "Stack-agnostic" contract).

---

## Database / Storage Changes

None. The skill holds only in-memory state per invocation (round counter, skipped-set of thread IDs). The skipped-set is intentionally NOT persisted — a second invocation on the same PR MUST re-evaluate previously-skipped threads because the user may have manually addressed them, or may explicitly want the prompt again.

---

## State Management

### In-Memory State Per Invocation

```
AddressPRCommentsState {
  prNumber: int
  branch: string
  roundCounter: int                       // starts at 1
  maxRounds: int                          // default 10
  skippedThreadIds: Set<string>           // GraphQL node IDs; cleared on re-invocation
  reviewerAllowList: {
    bots: bool
    logins: string[]
  }
  unattendedMode: bool                    // cached from initial sentinel check
  lastCommitShaBeforeRound: string
  commitsThisRound: int
  escalationsThisRound: int
}
```

### State Transitions

```
INIT
  → Preconditions pass → FETCH_INITIAL
  → Preconditions fail → EXIT_NON_ZERO(precondition_diagnostic)

FETCH_INITIAL
  → no unresolved automated-reviewer threads
      → reviewer ran but nothing unresolved → EXIT_ZERO(review_clean)   (AC3)
      → reviewer never ran                  → EXIT_ZERO(no_reviewer)    (AC4)
  → threads present → ROUND_START

ROUND_START
  → classify → PROCESS_THREADS

PROCESS_THREADS
  → for each thread: clear-fix / ambiguous / disagreement
  → all processed → PUSH

PUSH
  → commitsThisRound == 0 AND unattendedMode AND escalationsThisRound > 0
      → EXIT_ZERO(livelock_summary)     (AC15)
  → commitsThisRound == 0 (no commits, no escalations) → POLL_REVIEW
  → git push succeeds → POLL_REVIEW
  → git push rejected non-fast-forward → EXIT_NON_ZERO(push_rejection)  (AC11)

POLL_REVIEW
  → CHANGES_REQUESTED cleared AND no unresolved (minus skipped) → EXIT_ZERO(clean_after_n_rounds)
  → roundCounter >= maxRounds                                  → EXIT_NON_ZERO(round_cap)   (AC12)
  → 30 min elapsed without reviewer change                     → EXIT_NON_ZERO(re_review_timeout)   (AC13)
  → otherwise: increment roundCounter → ROUND_START
```

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Monolithic single-file skill** | Put all logic inline in `SKILL.md` | Simpler to read in one pass | Violates the 500-line guideline; hides rarely-fired paths behind high token cost on every run | Rejected |
| **B: Progressive-disclosure skill bundle** | Thin `SKILL.md` + `references/` loaded on demand | Matches every other SDLC skill's shape; audited by `skill-inventory-audit`; keeps the happy path cheap | None material | **Selected** |
| **C: Shell out to `claude -p` for sub-skills** | Invoke `/write-code` / `/verify-code` in a subprocess | Isolates state | Loses session context (conversation, cached reads); doubles latency; the skill loses the ability to observe sub-skill escalations inline | Rejected |
| **D: In-session sub-skill invocation** | Emit `/write-code` and `/verify-code` in the running session | Preserves context, catches sub-skill escalations inline, matches `/run-loop`'s pattern | Requires the skill to pass thread context through the sub-skill's synthetic-task entrypoint | **Selected** |
| **E: Trust sub-skill exit signal alone (no postcondition gate)** | Reply and resolve whenever `/write-code` + `/verify-code` return "success" | Simpler | Retrospective learning: delegates can self-report success despite soft failures; false-positive thread resolutions would erode reviewer trust | Rejected |
| **F: Postcondition verification before reply** | After sub-skills return, check commit SHA changed, file referenced was touched, and `/verify-code` reported no regressions | Catches silent no-ops and regressions | Slight latency cost per thread | **Selected** |
| **G: Persist skipped-set across invocations** | Write skipped thread IDs to `.claude/address-pr-comments-state.json` | Avoids re-prompting on skipped threads | Prevents the user from re-prompting intentionally; adds transient state file to clean up (retrospective learning on transient-state cleanup) | Rejected |
| **H: Ephemeral skipped-set (per-invocation only)** | Clear on each new invocation | Matches user intent; no cleanup needed | None | **Selected** |
| **I: Allow `--force-with-lease` when remote has diverged** | Let the skill recover from rebased branches | Handles rebase-after-review workflows | Directly contradicts FR12 / AC14 and introduces the class of risk those requirements exist to prevent | Rejected |
| **J: Plain `git push` only, exit on non-fast-forward** | Never force-push; surface rejection to the user | Safe by construction | User must manually reconcile diverged branches | **Selected** |

---

## Security Considerations

- **No shell injection from review bodies.** Review comment text is passed to `gh api` via `-f body=<value>` (argument value form), never concatenated into `bash -c '…'`. All `gh api graphql` variable substitutions use `-F` / `-f`. The skill MUST NOT build any shell command by string interpolation of reviewer-supplied content.
- **Authentication inherits from `gh`.** No new secrets, no new environment variables. Uses the existing `GITHUB_TOKEN` / gh CLI auth surface documented in `steering/tech.md`.
- **Cross-PR safety.** The precondition check (AC1) confirms the current branch matches the PR's `headRefName`. The skill refuses to run if they diverge — preventing accidental writes against a PR the user isn't on.
- **Force-push forbidden.** Reinforced structurally: the skill's `allowed-tools` exposes `Bash(git:*)` because git commands are needed, but the skill's workflow text (in `polling.md` and `fix-loop.md`) contains zero `--force` / `--force-with-lease` / `--force-if-includes` references. `/verify-code` MUST grep the delivered skill for those tokens and fail the verification gate if present.
- **No secrets in reply bodies.** The reply text is built from Claude's rationale + the commit SHA; the skill MUST NOT include environment values, file paths outside the repo root, or any content from `.env*` files.

---

## Performance Considerations

- **GraphQL pagination.** `reviewThreads(first: 100)` with `comments(first: 50)` covers realistic PR sizes. If a PR ever has > 100 threads the skill emits a diagnostic and processes the first page only — larger PRs indicate a review process that should not be automated end-to-end anyway.
- **Polling mirrors `/open-pr` Step 7.** Same 30 s / 30 min constants centralized in `references/polling.md` so changes propagate via a single edit.
- **Round cap.** Default 10 rounds × 30 min per poll = 5-hour upper bound. Configurable per invocation.
- **Sub-skill cost.** `/write-code` + `/verify-code` are opus skills with high effort. The address-pr-comments skill pays that cost once per `clear-fix` thread. The classification step is authored to produce short one-sentence rationales to bound token use.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Skill prompt | Prompt Quality Review gate | Unambiguous instructions, complete workflow paths, correct tool references (per `steering/tech.md` → Prompt Quality Criteria) |
| Skill behaviour | Exercise testing | Load plugin via `claude --plugin-dir ./` and invoke `/address-pr-comments` against a test PR on a disposable test repo (or dry-run evaluation of the GraphQL + REST commands that WOULD fire) |
| Sub-skill integration | Exercise testing (extended) | Confirm `/write-code` + `/verify-code` are invoked with the thread context; verify the commit message prefix and reply body format |
| Polling behaviour | Contract review (no live run) | `references/polling.md` mirrors `/open-pr` Step 7 constants exactly; a verification grep confirms the values match |
| Behavioural contracts | `/verify-code` | Preconditions, postconditions, invariants, and boundaries per `steering/tech.md` |
| BDD scenarios | Exercise testing + contract review | `feature.gherkin` (produced in Phase 3) maps 1:1 to ACs |

**AskUserQuestion testing** follows the project's existing pattern: the Agent SDK `canUseTool` callback (per `steering/tech.md` → Automated Exercise Testing) supplies deterministic answers for the interactive AC9 path. For fast iteration, the simpler `claude -p --disallowedTools AskUserQuestion` smoke test exercises only the unattended branch.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM classification misjudges a comment as `clear-fix` when it's actually ambiguous; a bad fix gets shipped | Medium | High | AC7 postcondition gate catches commits that don't touch the referenced file; reply body includes the commit SHA so a human reviewer can revert via `git revert` in one step; default interactive mode surfaces rationale to the user before any fix |
| Reviewer never re-reviews (disabled, misconfigured, or rate-limited) | Medium | Medium | AC13 re-review timeout (30 min) with distinct exit message; runner log surfaces "timeout" vs. "round cap" so operators can disambiguate |
| Pathological review cycle where each fix triggers a new thread | Low | Medium | Round cap (default 10 per AC12); livelock guard (AC15) catches the unattended-mode variant; interactive mode requires user confirmation each round for any `ambiguous` threads |
| `/write-code` introduces a regression while addressing a clear-fix comment | Low | High | `/verify-code` is mandatory before reply; postcondition gate rejects and escalates the thread if `/verify-code` reports regressions |
| Non-fast-forward push on the feature branch (someone else rebased it) | Low | Medium | AC11 / FR12 / AC14 — exit non-zero with a diagnostic; never force-push; surface the rejection so the user reconciles manually |
| Reviewer identity drifts (e.g., GitHub renames the Claude Code bot) | Medium | Low | FR10 — reviewer allow-list is configuration in `steering/tech.md`, not hard-coded; updating is a data change |
| `gh` CLI version lacks GraphQL or JSON flag coverage | Low | Medium | Skill requires the same `gh >= 2.62.0` already established by `steering/tech.md` (for `--json parent`); GraphQL was GA well before that version |

---

## Open Questions

- [ ] None. The three requirements-level open questions were resolved during this phase:
  - Reviewer allow-list lives in `steering/tech.md` (FR10 / this Design § Configuration Surface), not hard-coded.
  - Sub-skill escalations map to per-thread escalation, never a hard exit (this Design § Sub-Skill Invocation Contract and AC7).
  - No global summary comment; thread-level replies only (requirements.md Out of Scope, confirmed).

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #86 | 2026-04-22 | Initial feature spec |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Architecture follows existing project patterns (progressive disclosure, shared references, skill-creator authoring)
- [x] All API/interface changes documented (GraphQL + REST endpoints, slash-command surface, frontmatter schema)
- [x] No database/storage changes (intentional — skipped-set is ephemeral per Alternatives G/H)
- [x] In-memory state shape and transitions are clear
- [x] Sub-skill invocation contract defined (in-session, synthetic task context, escalation handling)
- [x] Security considerations addressed (no shell injection, cross-PR safety, no-force-push, no secrets in replies)
- [x] Performance impact analyzed (GraphQL pagination, polling constants, round cap)
- [x] Testing strategy defined (prompt quality, exercise testing, BDD, behavioural contracts)
- [x] Alternatives were considered and documented (10 options across 5 decisions)
- [x] Risks identified with mitigations
