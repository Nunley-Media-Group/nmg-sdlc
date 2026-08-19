# Design: Creating PRs Skill

**Issue**: #8
**Date**: 2026-08-13
**Status**: Approved
**Author**: Codex (retroactive)

---

## Overview

The `/open-pr` skill is the final step of the interactive SDLC workflow. It gathers context from the GitHub issue, spec files, git state, and verification results, then generates a structured PR body and creates the pull request via `gh pr create`. The skill uses conventional commit prefixes for PR titles and includes acceptance criteria as a checklist for reviewers.

The skill has `minimal Codex frontmatter` in its frontmatter, meaning it follows the SKILL.md instructions deterministically without model-driven behavior. This makes PR creation predictable and reproducible.

**Issue #128 extension:** After PR creation completes in interactive mode, the skill now offers an optional CI-monitor + auto-merge step that mirrors the unattended runner's semantics (`gh pr checks` polling → `gh pr merge --squash --delete-branch` → local branch cleanup). The unattended branch of the skill remains untouched — when `.codex/unattended-mode` exists, the runner retains full ownership of monitoring and merging.

**Issue #108 extension:** The stage/commit/version/rebase/push handoff moves into `/open-pr` before PR creation. `/open-pr` becomes the single delivery command: it prepares the branch using the existing `$nmg-sdlc:commit-push` safety contract, creates or skips the commit as appropriate, reconciles with `origin/main`, pushes, and then creates the PR. The separate `$nmg-sdlc:commit-push` step is removed from the public workflow and from the runner step sequence.

**Issue #148 extension:** The compatibility stub left by issue #108 is deleted from the manifest-discovered `skills/` tree. A reusable, path-explicit validator proves that repository, release-source, fresh-install, and upgraded active plugin roots expose no `commit-push` directory, frontmatter, alias, redirect, deprecation metadata, or inventory entry while preserving the existing `open-pr` delivery contract and truthful historical records.

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
| `specs/8-open-pr-skill/feature.gherkin` | Modify | Add scenarios for AC5–AC9 |
| `specs/8-open-pr-skill/feature.gherkin` | Modify | Issue #108: Add scenarios for open-pr delivery commit/push, safe rebase, clean branch no-op, runner step order, and public workflow cleanup |

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

## Issue #148: Hard Removal From Released and Active Plugin Surfaces

### Architecture and Data Flow

The Codex manifest already discovers every skill under `.codex-plugin/plugin.json`'s `"skills": "./skills/"` path. Hard removal therefore uses physical bundle deletion as the source-of-truth change; no alias, redirect, or manifest exception is introduced.

```text
Repository plugin root
  ├── delete skills/commit-push/
  ├── verify manifest-resolved skills surface
  └── run open-pr delivery regression contracts
        ↓
sync-marketplace-pointer release gate
  ├── verify pinned release source is clean
  └── dispatch version + SHA to nmg-plugins
        ↓
Codex fresh install or marketplace upgrade
  ├── confirm selected nmg-sdlc version + SHA with codex plugin list --json
  ├── resolve the selected active plugin root
  ├── run the same surface validator against that root
  └── exercise explicit and natural-language delivery requests in a fresh session
```

The repository does not delete or rewrite older versioned cache roots. Verification targets the plugin root selected by Codex after a fresh install or upgrade; an older cache is relevant only if Codex still reports or loads it as active.

### Component Changes

| File | Type | Purpose |
|------|------|---------|
| `skills/commit-push/SKILL.md` | Delete | Remove the complete compatibility bundle from manifest discovery. The implementation routes this skill-surface change through `$skill-creator` as required by `steering/tech.md`. |
| `scripts/verify-plugin-surface.mjs` | Create | Zero-dependency, cross-platform validator for an explicit plugin root. Validate the manifest shape, resolve the declared skills directory without path traversal, require `open-pr`, and report every stale commit-push directory, frontmatter name, loader-facing token, alias/redirect, or inventory destination. |
| `scripts/__tests__/plugin-surface-verification.test.mjs` | Create | Cover the clean repository and staged-release surfaces, fresh-install and upgraded-active-root fixtures, stale directory/frontmatter/alias failures, path-specific diagnostics, malformed roots, and inactive historical-cache isolation. |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | Modify | Remove the compatibility-directory exclusion, assert `skills/commit-push/` is absent, scan the full active skill tree, and retain all open-pr and runner delivery invariants. |
| `.github/workflows/sync-marketplace-pointer.yml` | Modify | Run the surface validator against the checked-out release source before reading metadata and dispatching its version/SHA to the marketplace. |
| `CHANGELOG.md` | Modify | Add an `[Unreleased]` hard-removal entry; do not rewrite versioned entries. |
| `specs/8-open-pr-skill/{requirements.md,design.md,tasks.md,feature.gherkin}` | Modify | Append issue #148's active contract, architecture, implementation plan, and BDD scenarios. |

The following files are verified but intentionally unchanged:

- `.codex-plugin/plugin.json`: its existing directory discovery makes physical deletion sufficient; `$nmg-sdlc:open-pr` owns the later version bump.
- `skills/open-pr/**` and `scripts/sdlc-runner.mjs`: delivery ownership is already consolidated and remains protected by regression tests.
- `scripts/skill-inventory.baseline.json`: regenerate only if a fresh deterministic audit differs; the current baseline has no commit-push destination.
- `README.md`: the current workflow already exposes open-pr as the sole delivery command, so no migration note is added.
- Historical specs and versioned changelog entries: retained as truthful history.

### Validator Interface

```text
node scripts/verify-plugin-surface.mjs --root <plugin-root> --label <surface>
```

| Exit | Meaning | Output contract |
|------|---------|-----------------|
| `0` | Selected plugin surface is clean | Identify the label and validated root. |
| `1` | Stale active commit-push content exists | Identify the label, absolute root, and every offending relative path plus metadata kind. |
| `2` | Arguments, manifest, skills path, or root are invalid/unreadable | Identify the invalid input without mutating it. |

Paths are distinct process arguments and are resolved with `node:path`; repository-derived values are never interpolated into shell source. The validator reads only `.codex-plugin/plugin.json`, its manifest-declared skills tree, and the inventory baseline when present. It intentionally excludes `specs/` and versioned changelog entries from stale-surface matching.

### Install and Upgrade Verification

Current local Codex CLI help exposes `codex plugin add`, `codex plugin marketplace upgrade`, and `codex plugin list --json`. Release verification uses those observed interfaces in a disposable profile rather than mutating a developer's primary installation:

1. **Fresh install:** install the current marketplace entry, confirm the reported nmg-sdlc version/SHA, validate the selected active root, start a fresh Codex session, prove `$nmg-sdlc:commit-push` cannot load, and prove a delivery request selects `$nmg-sdlc:open-pr`.
2. **Upgrade:** install the previous release in the disposable profile, prove it exposes the old stub, refresh the marketplace and upgrade to the issue #148 release, confirm the new reported version/SHA, validate the newly selected active root, and repeat the fresh-session discovery checks.
3. **Stale-active negative case:** seed or select a root containing the old bundle and prove the validator fails with that root and the exact offending directory or metadata file.

Official OpenAI documentation search did not expose a public plugin-cache replacement contract during design. Consequently, version/SHA selection and active-root postconditions are verified directly instead of assuming that a successful upgrade command removed or ignored stale content.

### Alternatives Considered

| Option | Benefit | Cost / Risk | Decision |
|--------|---------|-------------|----------|
| Keep the deprecation stub | Existing explicit invocations receive a redirect | The skill remains discoverable and can intercept natural-language requests; violates issue #148 | Rejected |
| Delete the bundle and validate repository source only | Smallest code change | Cannot distinguish a clean source from a stale selected installation | Rejected |
| Delete the bundle and validate release plus selected active roots | Proves the surfaces the repository owns and the installation Codex actually selects | Requires a disposable live exercise in addition to CI | Selected |
| Delete every older cache directory | Makes filesystem searches look clean | Destructive, host-specific, and erases intentionally inactive versioned caches | Rejected |
| Rewrite all historical commit-push references | Removes every textual occurrence | Corrupts truthful specs and released changelog history | Rejected |

### Testing Strategy

| Layer | Coverage |
|-------|----------|
| BDD | Six new scenarios map AC16–AC21 one-to-one. |
| Validator unit tests | Clean/stale repository, staged release, fresh install, selected upgrade root, malformed root, actionable output, and inactive-cache boundaries. |
| Open-pr contract tests | Full skill-tree stale-reference scan, bundle absence, runner step absence, and unchanged staging/version/rebase/push/PR behavior. |
| Inventory and compatibility checks | `node scripts/skill-inventory-audit.mjs --check` plus the existing Codex compatibility check; refresh the baseline only on deterministic drift. |
| Release gate | Surface validation must pass before marketplace dispatch. |
| Live exercise | Disposable fresh-install and old-to-new upgrade sessions verify version/SHA selection, active-root cleanliness, direct invocation failure, and natural-language routing to open-pr. |

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Codex selects a different cached version than expected | Medium | High | Match `codex plugin list --json` version/SHA to the root before treating validation as active-install evidence. |
| Static checks pass while host discovery remains stale | Medium | High | Require disposable fresh-install and upgrade exercises in fresh sessions after marketplace refresh. |
| Inactive older caches produce false failures | Medium | Medium | Validate only repository/release roots and the explicitly selected active root; do not recursively scan or delete every cache version. |
| Hard removal weakens open-pr delivery | Low | High | Retain the existing open-pr/runner regression suite and add AC20 coverage before release. |
| Validator misses renamed alias or redirect metadata | Low | High | Inspect directory names, all skill frontmatter, manifest/loader-facing content, active skill text, and inventory destinations with fixture canaries for each shape. |
| Marketplace pointer advances despite a stale release source | Low | High | Gate `.github/workflows/sync-marketplace-pointer.yml` with the validator before dispatch. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #8 | 2026-02-15 | Initial feature spec |
| #128 | 2026-04-18 | Add interactive CI monitor + auto-merge design (Step 7); mirror runner polling cadence; document opt-in/opt-out and active unattended suppression |
| #108 | 2026-04-25 | Consolidate commit, version, rebase, and push into open-pr; remove commit-push from the public runner workflow |
| #148 | 2026-08-13 | Require hard removal plus release-source, fresh-install, and upgraded active-surface validation |

---

## Validation Checklist

- [x] Architecture follows existing skill patterns
- [x] File changes documented
- [x] Security considerations addressed
- [x] Alternatives considered
- [x] Polling semantics aligned with `sdlc-runner.mjs` for consistency
- [x] Unattended branch behavior preserved (AC9 defensive check)
