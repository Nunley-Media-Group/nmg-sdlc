# Design: Creating PRs Skill

**Issues**: #8, #128, #108
**Date**: 2026-04-25
**Status**: Amended
**Author**: Codex (retroactive)

---

## Overview

The `/open-pr` skill is the final step of the interactive SDLC workflow. It gathers context from the GitHub issue, spec files, git state, and verification results, then generates a structured PR body and creates the pull request via `gh pr create`. The skill uses conventional commit prefixes for PR titles and includes acceptance criteria as a checklist for reviewers.

The skill has `minimal Codex frontmatter` in its frontmatter, meaning it follows the SKILL.md instructions deterministically without model-driven behavior. This makes PR creation predictable and reproducible.

**Issue #128 extension:** After PR creation completes in interactive mode, the skill now offers an optional CI-monitor + auto-merge step that mirrors the unattended runner's semantics (`gh pr checks` polling → `gh pr merge --squash --delete-branch` → local branch cleanup). The unattended branch of the skill remains untouched — when `.codex/unattended-mode` exists, the runner retains full ownership of monitoring and merging.

**Issue #108 extension:** The stage/commit/version/rebase/push handoff moves into `/open-pr` before PR creation. `/open-pr` becomes the single delivery command: it prepares the branch using the existing `$nmg-sdlc:commit-push` safety contract, creates or skips the commit as appropriate, reconciles with `origin/main`, pushes, and then creates the PR. The separate `$nmg-sdlc:commit-push` step is removed from the public workflow and from the runner step sequence.

---

## Architecture

### Component Diagram

```
┌────────────────────────────────────────────┐
│          /open-pr Skill                     │
├────────────────────────────────────────────┤
│  Step 1: Read Context                       │
│    ├── gh issue view #N                     │
│    ├── specs/{feature}/req.md               │
│    ├── specs/{feature}/tasks.md             │
│    ├── git status, git log, git diff        │
│  Step 2: Determine Version Bump             │
│  Step 3: Update Version Artifacts           │
│  Step 4: Generate PR Content                │
│    ├── Title (conventional commit prefix)   │
│    └── Body (summary, ACs, test plan, specs)│
│  Step 5: Push and Create PR                 │
│    ├── git push -u origin HEAD              │
│    └── gh pr create                         │
│  Step 6: Output (base case)                 │
│                                             │
│  Step 7 (Issue #128, interactive only):     │
│    ├── interactive prompt: monitor or skip?    │
│    ├── If monitor:                          │
│    │    ├── Poll gh pr checks (30s cadence) │
│    │    ├── On all-success:                 │
│    │    │    ├── gh pr merge --squash       │
│    │    │    │   --delete-branch            │
│    │    │    └── git branch -D <branch>     │
│    │    └── On failure/non-mergeable:       │
│    │         └── print failing checks,      │
│    │            exit (no merge, no delete)  │
│    └── If skip: fall through to Step 6 out  │
└────────────────────────────────────────────┘

Unattended branch (.codex/unattended-mode present):
  Step 6 output: "Done. Awaiting orchestrator."
  Step 7 actively suppressed (no prompt, no poll, no merge)
  sdlc-runner.mjs continues to own CI + merge.
```

### Data Flow

```
1. Read issue, specs, and git state
2. Determine version bump (if VERSION file exists)
3. Update VERSION + CHANGELOG + stack-specific files
4. Generate PR title + body
5. Ensure branch is pushed; gh pr create
6. Output PR URL (interactive: "Next step..." / unattended: "Done. Awaiting orchestrator.")

[Interactive-only, Issue #128]
7. Prompt: monitor CI + auto-merge, or skip?
   ├── monitor → poll gh pr checks every 30s
   │     ├── all success → gh pr merge --squash --delete-branch → git branch -D
   │     └── any failure / non-mergeable / no checks → print, exit without merging
   └── skip → exit with original Step 6 "Next step" output
```

### Delivery Handoff Consolidation (Issue #108)

```
1. Parse issue number and --major flag
2. Read issue labels and versioning steering
3. Stage eligible non-runner-artifact changes
4. If staged or version work exists:
   ├── Apply the project version bump when applicable
   ├── Commit with a conventional message
   └── Keep bump-only commits separate only when no implementation changes exist
5. Fetch origin and verify ancestry against origin/main
6. If local is behind:
   ├── Record origin/{branch} as EXPECTED_SHA
   ├── Rebase onto origin/main
   ├── Re-compute version artifacts against the new baseline
   └── Mark the push as requiring force-with-lease
7. Push:
   ├── New branch → git push -u origin HEAD
   ├── Fast-forward branch → git push
   └── Rebased branch → git push --force-with-lease=HEAD:{EXPECTED_SHA}
8. Verify no unpushed commits remain
9. Generate PR content and run gh pr create
10. Continue to optional interactive CI monitor or unattended completion
```

Clean already-pushed branches take the same path but skip commit creation after confirming there are no eligible staged changes and no version bump is required. The skill reports that no additional commit was needed, then continues to ancestry verification and PR creation.

---

## File Changes

| File | Type | Purpose |
|------|------|---------|
| `plugins/nmg-sdlc/skills/open-pr/SKILL.md` | Create | Original (Issue #8): 4-step workflow |
| `plugins/nmg-sdlc/skills/open-pr/SKILL.md` | Modify | Issue #128: Add Step 7 (interactive CI monitor + auto-merge); update `workflow instructions` to add `Bash(sleep:*)` (required for 30-second poll interval — not covered by `Bash(gh:*)` or `Bash(git:*)`); restructure Step 6 output so the existing "Next step..." message becomes the opt-out fallback |
| `skills/open-pr/SKILL.md` | Modify | Issue #108: Move stage/commit/version/rebase/push duties into `/open-pr`; remove the dirty-tree and divergence aborts that only existed to hand off to `$nmg-sdlc:commit-push`; update the Integration diagram to skip commit-push |
| `skills/open-pr/references/preflight.md` | Modify | Issue #108: Replace abort-only dirty/divergence preflight with delivery-preflight instructions that stage eligible work, preserve runner-artifact filtering, and route rebase/push through the safe lease contract |
| `skills/open-pr/references/version-bump.md` | Modify | Issue #108: Ensure the version bump is applied before the delivery commit and can be re-computed after rebase |
| `skills/commit-push/SKILL.md` | Delete/Deprecate | Issue #108: Remove from the shipped public skill surface or convert to a deprecation stub that points users to `$nmg-sdlc:open-pr` |
| `.codex-plugin/plugin.json` | Modify | Issue #108: Remove or hide the public `commit-push` entry if the manifest enumerates individual skills |
| `scripts/sdlc-runner.mjs` | Modify | Issue #108: Remove the `commitPush` step, bounce-back sentinel, prompt text, push-validation gate, and downstream step numbering that assumed a separate delivery step |
| `scripts/__tests__/sdlc-runner.test.mjs` | Modify | Issue #108: Update runner step order, state hydration, preconditions, prompt contracts, and no-bounce expectations |
| `README.md` | Modify | Issue #108: Simplify public workflow diagrams and skill descriptions to `verify-code` → `open-pr` → `address-pr-comments` |
| `specs/feature-open-pr-skill/feature.gherkin` | Modify | Add scenarios for AC5–AC9 |
| `specs/feature-open-pr-skill/feature.gherkin` | Modify | Issue #108: Add scenarios for open-pr delivery commit/push, safe rebase, clean branch no-op, runner step order, and public workflow cleanup |

---

## API / Interface Changes

### New Shell Invocations (Issue #128)

| Command | Purpose | Notes |
|---------|---------|-------|
| `gh pr checks <num> --json name,state,link` | Poll required checks with structured output | `state` values: SUCCESS, FAILURE, PENDING, IN_PROGRESS, CANCELLED, TIMED_OUT, SKIPPED |
| `gh pr checks <num>` (fallback) | Plain-text fallback when `--json` not available | Parse "no checks reported" to detect no-CI scenario |
| `gh pr merge <num> --squash --delete-branch` | Squash-merge and delete the remote branch atomically | Preferred over separate `gh pr merge` + `gh api` branch delete |
| `gh pr view <num> --json mergeable,mergeStateStatus` | Pre-merge mergeability check | Treat `CONFLICTING` or non-`CLEAN` mergeStateStatus as a failure |
| `git branch -D <branch>` | Delete the local feature branch after remote merge | Run `git checkout main` first to detach from the branch being deleted |
| `git checkout main` | Return to main before deleting the feature branch | Required since `git branch -D` cannot delete the checked-out branch |

### Moved Shell Invocations (Issue #108)

These commands already exist in the commit-push workflow and move into `/open-pr` delivery preflight.

| Command | Purpose | Notes |
|---------|---------|-------|
| `git status --porcelain` | Detect eligible dirty work and runner artifacts | Filter `.codex/sdlc-state.json` and `.codex/unattended-mode` before deciding what to stage or report |
| `git add -A` | Stage implementation, spec, docs, and version artifacts | Must not publish ignored runner artifacts; retain the existing dirty-tree filter before staging |
| `git commit -m "feat: <description> (#N)"` | Create a conventional delivery commit | Use `fix:` for bug labels; use `chore: bump version to {new_version}` only for bump-only commits |
| `git fetch origin` | Refresh `origin/main` and `origin/{branch}` | Captures remote state before ancestry and lease decisions |
| `git merge-base --is-ancestor origin/main HEAD` | Decide whether rebase is needed | Non-zero now triggers internal rebase instead of a `DIVERGED:` bounce |
| `git rev-parse origin/{branch}` | Capture the expected remote branch SHA | Input to the safe force-with-lease branch |
| `git pull --rebase origin main` | Reconcile local branch with the advanced base | Conflicts in version artifacts escalate and stop |
| `git push --force-with-lease=HEAD:{EXPECTED_SHA}` | Push rebased branch safely | Same safety envelope as commit-push; never replace with plain `--force` |
| `git log origin/{branch}..HEAD --oneline` | Verify push success | Must be empty before PR creation proceeds |

### Polling Cadence

| Constant | Value | Rationale |
|----------|-------|-----------|
| Poll interval | 30 seconds | Matches `sdlc-runner.mjs` Step 8 prompt (line 937) — keeps runner/skill behavior aligned |
| Poll timeout | 30 minutes total | Generous enough for typical CI runs; prevents a stuck skill from hanging the user's session indefinitely |
| Max polls | 60 (30min / 30s) | Deterministic upper bound |

### Terminal-State Mapping

| `gh pr checks` state | Skill action |
|----------------------|--------------|
| SUCCESS | Keep polling other checks; all SUCCESS → merge |
| PENDING, IN_PROGRESS, QUEUED | Keep polling |
| FAILURE, CANCELLED, TIMED_OUT | Report failure, exit without merging |
| SKIPPED, NEUTRAL | Treat as SUCCESS (standard GitHub semantics) |
| "no checks reported" (plain text) | Report "No CI configured — skipping auto-merge"; exit without merging (graceful skip per retrospective learning on absent integrations) |

---

## Database / Storage Changes

None. The skill operates on GitHub state (via `gh`) and local git state only.

---

## State Management

None. Skill state is implicit in shell invocations; no persistent state files are introduced.

Issue #108 introduces transient in-session values only:

| Value | Source | Purpose |
|-------|--------|---------|
| `rebased` | Set after a successful rebase | Selects the force-with-lease push branch |
| `EXPECTED_SHA` | `git rev-parse origin/{branch}` before rebase | Binds `--force-with-lease` to the remote SHA observed before rewriting local history |
| `commit_created` | Delivery-preflight commit decision | Supports the clean-branch output when no commit was needed |

---

## UI Components

No UI components. The new interactions are text-mode:
- `interactive prompt` with two options (monitor vs skip)
- Periodic status output during polling (e.g., `Polling checks... 3/5 complete`)
- Final status line (merged / failed / skipped)

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Always monitor unless user declines** | Default to monitoring post-PR-create | Faster ship cycle | Surprising; changes default behavior for existing users | Rejected — keep opt-in explicit |
| **B: Prompt with opt-in option (selected)** | Two-choice interactive prompt, user explicitly opts in | Preserves existing behavior for skeptics; clear intent | One extra prompt | **Selected** |
| **C: Separate `/ship` skill** | New skill that wraps `/open-pr` + monitor + merge | Keeps `/open-pr` surface untouched | Duplicates skill surface; two similar skills is confusing | Rejected — the enhancement belongs in `/open-pr` |
| **D: Reuse runner's gh pr checks loop verbatim** | Mirror the exact runner prompt for polling | Zero behavioral drift | Runner's prompt is for a `codex exec --cd` subprocess; in-skill we execute directly | Partially adopted — reuse the 30s cadence and "no checks reported" handling, but express as deterministic skill steps rather than an AI-driven retry loop |
| **E: Keep commit-push as a separate public step** | Preserve the existing two-command delivery model | Smaller `/open-pr` skill; current tests remain mostly stable | Users must remember a separate handoff step; runner needs bounce-back behavior for divergence | Rejected for issue #108 — the requested mental model is a single `$nmg-sdlc:open-pr` delivery command |
| **F: Move commit-push behavior into open-pr and deprecate the old skill** | `/open-pr` owns delivery preparation and PR creation; `commit-push` is removed or becomes a compatibility stub | One user-facing delivery command; runner state gets simpler; safe push behavior is preserved by moving, not rewriting, the contract | `/open-pr` grows and must carry more git safety detail | Selected |

---

## Security Considerations

- [x] PR creation via authenticated `gh` CLI — no tokens in PR body
- [x] `gh pr merge` uses the same authenticated session — no elevated privilege
- [x] `git branch -D` only operates on the local feature branch (never `main`, never force-pushes)
- [x] Check details URLs come from `gh pr checks --json link` — not user-controlled input, safe to print
- [x] `Closes #N` links are safe GitHub references

---

## Performance Considerations

- [x] Single `gh pr create` API call
- [x] 30-second poll cadence avoids rate-limit churn (matches runner)
- [x] 30-minute total polling timeout prevents indefinite hangs
- [x] `minimal Codex frontmatter` — deterministic execution, no model cost during polling loop
- [x] Local file reads for specs and git state

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| PR Creation | BDD | Scenarios for issue linking, spec references, unattended-mode (AC1–AC4) |
| Interactive CI monitor | BDD | Opt-in happy path, opt-out, CI failure, no-CI, unattended suppression (AC5–AC9) |
| Delivery preflight | BDD + contract tests | Dirty branch commit, clean branch no-op, rebase with force-with-lease, conflict escalation, and push verification (AC10, AC11, AC14) |
| Runner orchestration | Unit tests | Step order removes `commitPush`; `createPR` prompt owns delivery; no `DIVERGED:` bounce-back to commit-push remains (AC13) |
| Public documentation | Contract/search tests | README, integration diagrams, skill descriptions, and inventory no longer present `$nmg-sdlc:commit-push` as a separate workflow step (AC12, AC15) |
| Exercise test | Manual | Load modified plugin, invoke `/open-pr` against a test repo with a real PR; verify both branches (interactive + unattended) |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Polling hangs indefinitely on stuck CI | Medium | High | 30-minute total timeout with explicit failure message |
| Skill merges a PR the user didn't intend to merge | Low | High | Two-option opt-in prompt; unattended branch actively suppresses |
| `git branch -D` fails because branch is checked out | Medium | Low | Explicitly `git checkout main` before deletion |
| Non-mergeable PR silently slips through | Low | High | Pre-merge `gh pr view --json mergeable` check; treat non-`CLEAN` as failure |
| Rate-limit from overly aggressive polling | Low | Medium | 30s cadence matches runner; `gh` CLI handles auth backoff |
| Interactive prompt leaks into unattended run | Low | High | Sentinel check gates the entire Step 7 block; AC9 is an active-suppression test |
| Unsafe branch rewrite after rebase | Low | High | Reuse the existing `EXPECTED_SHA` + `--force-with-lease=HEAD:{EXPECTED_SHA}` contract from commit-push; add regression coverage |
| Runner artifacts get staged by the broader open-pr responsibility | Medium | Medium | Retain `.codex/sdlc-state.json` and `.codex/unattended-mode` filtering before staging and cover it in tests |
| Version bump becomes stale after rebasing onto a sibling release | Medium | High | Re-run the version-bump procedure after rebase and amend the delivery commit when the computed version changes |
| Removed commit-push step leaves stale docs or tests behind | Medium | Medium | Add contract/search tests for public workflow references and runner step keys |

---

## Open Questions

- [x] Polling cadence? *(30s — matches runner.)*
- [x] Merge strategy? *(Squash, hardcoded for this iteration — see Out of Scope.)*
- [ ] Should a future iteration surface merge strategy via `interactive prompt`? *(Deferred — out of scope for #128.)*

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #8 | 2026-02-15 | Initial feature spec |
| #128 | 2026-04-18 | Add interactive CI monitor + auto-merge design (Step 7); mirror runner polling cadence; document opt-in/opt-out and active unattended suppression |
| #108 | 2026-04-25 | Consolidate commit, version, rebase, and push into open-pr; remove commit-push from the public runner workflow |

---

## Validation Checklist

- [x] Architecture follows existing skill patterns
- [x] File changes documented
- [x] Security considerations addressed
- [x] Alternatives considered
- [x] Polling semantics aligned with `sdlc-runner.mjs` for consistency
- [x] Unattended branch behavior preserved (AC9 defensive check)
