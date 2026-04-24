---
name: address-pr-comments
description: "Close the PR review loop locally: read the automated reviewer's unresolved threads on an open PR, classify each as clear-fix / ambiguous / disagreement, apply fixes via /write-code + /verify-code, reply and resolve each successful thread, push with plain git push, and loop until the PR is review-clean. Use when the user says 'address PR comments', 'address review findings', 'respond to the reviewer', 'close the review loop', 'handle reviewer comments on #N', 'fix PR review findings', 'resolve review threads', 'clean up the PR review', or 'run the review loop'. Do NOT use for creating PRs, handling CI failures, or human-reviewer comments — those are owned by /open-pr (creation, CI) and are intentionally out of scope for this skill (human comments). Eighth step in the SDLC pipeline — follows /open-pr."
---

# Address PR Comments

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read the automated reviewer's unresolved threads on the current branch's pull request, fix each `clear-fix` thread via `/write-code` + `/verify-code` (with a postcondition gate before replying and resolving), push without force, poll for the reviewer to re-run, and loop until the PR is review-clean or a configured round cap is reached.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if legacy `.codex/steering/` or `.codex/specs/` trees are still present. Running this skill against a mixed layout would drive `/write-code` and `/verify-code` against the wrong paths.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel turns the Step 4 per-thread gate for `ambiguous` / `disagreement` threads from an interactive user prompt prompt into an `ESCALATION:` sentinel + skip (deterministic default) and activates the livelock guard in Step 5.

Read `../../references/feature-naming.md` when you need the spec directory for the issue and no `{feature-name}` is in hand — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain.

## Prerequisites

1. An open GitHub PR exists for the current feature branch (created by `/open-pr`).
2. The automated reviewer (per `steering/tech.md` → Automated Review) has posted — or will post — review threads on the PR.
3. `/write-code` and `/verify-code` skills are available in the current session.
4. Working tree is clean (no staged or unstaged changes).

---

## Workflow

### Step 1: Resolve PR and Validate Preconditions

Determine the target PR and confirm the workspace is ready. Failing any predicate here means the rest of the workflow cannot run safely, so exit non-zero with a single-line diagnostic naming the failed predicate — do not attempt recovery.

1. **Resolve the PR number.**
   - If `#N` is passed as an argument, treat it as the PR number.
   - Otherwise, run `gh pr view --json number,state,headRefName,headRepositoryOwner` to derive the PR from the current branch. If no PR is associated with the branch, exit non-zero: `No pull request associated with the current branch — run /open-pr first.`
2. **Parse `--max-rounds=N`** from the arguments (default `10`). Reject values `< 1`.
3. **Confirm PR is open.** If `state != "OPEN"` exit non-zero: `PR #{N} is not open (state: {state}) — cannot address review comments on a closed PR.`
4. **Confirm the current branch matches the PR head ref.** If `git branch --show-current` differs from the PR's `headRefName`, exit non-zero: `Current branch does not match PR #N's head ref ({headRefName}) — check out the PR branch and re-run.` This check is a cross-PR safety guard — it prevents this skill from ever writing against a PR the user is not on.
5. **Confirm the working tree is clean.** Run `git status --porcelain`; any non-empty output means unstaged or staged changes are present. Exit non-zero: `Working tree is not clean — commit or stash local changes before running /address-pr-comments.`
6. **Cache `unattended_mode`** by checking `.codex/unattended-mode` once and reusing the value for the rest of the run.

### Step 2: Fetch Unresolved Review Threads

Read `references/fetch-threads.md` when preconditions pass — the reference covers the full `gh api graphql` query shape for `reviewThreads(first:100)` with `comments(first:50)`, the automated-reviewer identity filter driven by `steering/tech.md` → Automated Review, the distinct short-circuit exits for "reviewer ran but nothing unresolved" vs "reviewer never ran", the > 100 threads fallback, and the security rule that review bodies are passed to subsequent commands via `-f body=<value>` only (never string-interpolated).

If any of the short-circuit conditions in `fetch-threads.md` fire, this skill exits from Step 2 directly. Otherwise, proceed to Step 3 with the filtered unresolved-thread set.

### Step 3: Classify Each Thread

Read `references/classification.md` when Step 2 has returned one or more unresolved threads — the reference covers the three classifications (`clear-fix`, `ambiguous`, `disagreement`), the per-class criteria, the one-sentence rationale format that carries through to reply bodies and escalation sentinels, and worked examples for each class.

Each thread carries its classification and rationale into Step 4.

### Step 4: Route Each Thread — Fix or Escalate

For each unresolved thread in the current round, route based on classification:

- **`clear-fix`** → Read `references/fix-loop.md` when a thread is classified as `clear-fix` — the reference covers the in-session invocation of `/write-code` + `/verify-code` with synthetic task context (thread body, file, line, diff hunk), the postcondition gate (commit SHA changed, fix commit touches the referenced file, `/verify-code` reports no regressions), the reply-and-resolve path via `gh api` REST + GraphQL `resolveReviewThread` mutation, the commit-message convention (`fix: address review finding on {file}:{line}`), and the mapping from sub-skill `ESCALATION:` output to per-thread escalation (never a hard exit).
- **`ambiguous`** or **`disagreement`** → Read `references/escalation.md` when a thread is classified as `ambiguous` or `disagreement` — the reference covers the interactive interactive user prompt menu (`Fix it anyway` / `Skip — leave unresolved` / `Reply without fixing`) and the unattended-mode `ESCALATION: address-pr-comments — pr=#{N} thread={node_id} classification={class} rationale={one-sentence}` sentinel. Both paths add the thread to the in-process skipped-set so the round loop in Step 5 will not re-evaluate it.

Track `commits_this_round` and `escalations_this_round` as Step 4 iterates — Step 5 needs both to decide between normal re-polling and the livelock guard exit.

### Step 5: Push, Poll, and Loop

Read `references/polling.md` when Step 4 has finished processing every thread in the current round — the reference covers the no-force `git push` (and the non-fast-forward rejection exit), the polling constants mirrored from `skills/open-pr/references/ci-monitoring.md` (30 s interval, 30 min timeout, 60 polls max), the round-cap and re-review-timeout exits, the unattended-mode livelock guard (zero commits + any escalations), and the distinct exit messages for each termination path so the SDLC runner can disambiguate them from stdout alone.

When the loop determines another round is warranted, increment the round counter and return to Step 3 with the re-fetched thread set. Otherwise, emit the terminal exit message defined in `references/polling.md` for the reached termination state and return.

---

## Integration with SDLC Workflow

```
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /commit-push  →  /open-pr #N  →  /address-pr-comments #N
                                                                                                                                  ▲ You are here
```

`/address-pr-comments` is the terminal step of the per-issue SDLC cycle. It runs only after `/open-pr` has opened the PR. When the PR is review-clean (either on entry or after the loop completes), the skill exits zero and the cycle is done — the next step is whatever work comes next in the project (a new `/draft-issue`, the next milestone issue via `/start-issue`, or a merge).
