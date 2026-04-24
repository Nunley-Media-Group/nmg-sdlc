# Root Cause Analysis: Fix /open-pr to abort on dirty tree or empty implementation branch

**Issue**: #95
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley

---

## Root Cause

`/open-pr` Step 1 ("Read Context") reads `git status` and `git log main..HEAD --oneline` exclusively for situational awareness — it uses the output to assemble the PR body later, but it never evaluates either signal against a pass/fail predicate. The skill then proceeds unconditionally to Step 2 (version-bump classification) and Step 3 (`git add VERSION CHANGELOG.md [stack-specific…]` → `git commit -m "chore: bump version to {new}"` → `git push`). Because Step 3 stages a targeted allowlist rather than the whole worktree, uncommitted feature files never enter the commit; the PR ends up containing only the version-bump commit, and the implementation disappears silently.

Two orthogonal branch states produce the same bad outcome:

1. **Dirty tree with real changes** — the user ran `/open-pr` before `/write-code` actually committed (or before they had a chance to commit manually). The allowlist-scoped `git add` in `references/version-bump.md` Step 3 step 4 walks right past the dirty files.
2. **Branch has no implementation commits at all** — `git log main..HEAD` is empty, or contains only a prior `chore: bump version to X.Y.Z` commit. The skill still computes a bump, writes it, and pushes a PR that is literally just a version increment.

Neither condition is an exceptional error state — both are routine user mistakes (invoked too early, invoked after a failed `/write-code`) that the skill's lack of a predicate promotes to "successful" version-bump-only PRs.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/open-pr/SKILL.md` | Step 1 "Read Context" (~lines 50–65) | Reads `git status` and `git log main..HEAD --oneline` informatively; no predicate evaluation. This is the insertion point for the preflight gate. |
| `skills/open-pr/references/version-bump.md` | Step 2 (`references/version-bump.md` lines 9–46) and Step 3 (lines 48–68) | Downstream of the missing gate — reads/writes `VERSION`, edits `CHANGELOG.md`, updates stack files, commits the bump. Not modified; protected by the new gate. |
| `skills/start-issue/references/dirty-tree.md` | full file | Prior art: already defines the runtime-artifact filter (`.codex/sdlc-state.json`, `.codex/unattended-mode`) and abort-message shape for both interactive and unattended modes. Promoted to plugin-shared (see Fix Strategy) so `open-pr` can reuse it without duplication. |

### Triggering Conditions

- The user runs `/open-pr` against a branch where `/write-code` either did not run or failed to commit its work, AND
- Any `VERSION` file exists at the repo root so the skill does not short-circuit past Steps 2–3, AND
- No other skill or hook between `/write-code` and `/open-pr` (e.g., `/verify-code`) happened to catch the dirty tree.

The conditions weren't caught earlier because `/open-pr` was authored under the implicit assumption that its upstream skill (`/verify-code`) would refuse to hand off a dirty or empty branch. `/verify-code` does check implementation coverage against `tasks.md`, but it does not gate on the tree state at the git level — and `/open-pr` can be invoked directly without going through `/verify-code` at all.

---

## Fix Strategy

### Approach

Add a single preflight phase at the top of `/open-pr` Step 1 that runs two fail-fast checks before any other work: (1) a dirty-tree check that mirrors the runtime-artifact filter already used by `/start-issue`, and (2) an empty-implementation-branch check that rejects branches whose only commits ahead of `main` match `^chore: bump version`. Both failures abort the skill non-zero before Step 2 can read `VERSION` or any stack-specific version file. Interactive mode prints a diagnostic and stops; unattended mode emits a single `ESCALATION: open-pr — {diagnostic}` sentinel line and exits non-zero.

Per FR5, the dirty-tree filter is not duplicated into `/open-pr`. Instead, `skills/start-issue/references/dirty-tree.md` is promoted to a plugin-shared reference at `references/dirty-tree.md` (joining `unattended-mode.md`, `legacy-layout-gate.md`, `feature-naming.md`, etc.) and generalized so its wording applies to any skill that gates on working-tree cleanliness. `/start-issue` swaps its pointer to the new path; `/open-pr` gains a new per-skill reference `skills/open-pr/references/preflight.md` that delegates the dirty-tree filter to the shared reference and adds the empty-branch check plus skill-specific abort messaging.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `references/dirty-tree.md` | **Create** (moved content from `skills/start-issue/references/dirty-tree.md`, generalized). Keep the `git status --porcelain` filter, the runtime-artifact list, and the interactive/unattended abort-message *shapes* — replace "Cannot create feature branch" and `gh issue develop`-specific prose with skill-neutral language so any consumer can reuse it. `Consumed by:` lists both `start-issue` and `open-pr`. | Promotes the filter to the plugin-shared tier per `steering/structure.md` (shared refs hold content ≥2 skills consume). Satisfies FR5. |
| `skills/start-issue/references/dirty-tree.md` | **Delete** (content moved to plugin-shared location). | Avoids duplication; the per-skill references directory keeps only start-issue-specific content. |
| `skills/start-issue/SKILL.md` | **Edit** Step 4 pointer: `Read references/dirty-tree.md when Step 4 begins` → `Read ../../references/dirty-tree.md when Step 4 begins`. Triggering-condition sentence unchanged. | Follows the plugin-shared-reference grammar (`../../references/{name}.md`) already used by every other shared-ref pointer in `start-issue/SKILL.md`. |
| `skills/open-pr/references/preflight.md` | **Create**. Contents: a short "Consumed by: open-pr Step 1" header, a Step 1a "Dirty-tree check" section that delegates to `../../../references/dirty-tree.md` for the filter (restating the filter inputs and expected behaviour for discoverability without repeating the artifact list), a Step 1b "Empty-branch check" section with the `git log main..HEAD --oneline` command, the `^chore: bump version` (case-insensitive) filter regex, and the exact abort string `No implementation commits found on this branch — run /write-code before opening a PR.`, and an "Abort messaging" block covering interactive vs. unattended (`ESCALATION: open-pr — {diagnostic}`) output for both failures. | Per-skill reference keeps open-pr-specific message and command wording out of the plugin-shared file. |
| `skills/open-pr/SKILL.md` | **Edit** Step 1 header: prepend a new `### Step 1: Preflight Gate` (renumbering the existing "Read Context" body to run *after* the preflight) and add a pointer `Read references/preflight.md when Step 1 begins — the gate aborts before any version-artifact read/write if the working tree is dirty or the branch has no non-bump commits.` Keep the existing `gh issue view`, spec-glob, and `git diff` reads exactly as they are — they run only after both preflight checks pass. | Gate must fire before Step 2 per AC1/AC2; placing it at the top of Step 1 keeps Step 2's "no `VERSION` file → skip" short-circuit intact while guaranteeing the ordering. |
| `CHANGELOG.md` | **Edit** (add bullet to `[Unreleased]`): `### Fixed — /open-pr now aborts with a diagnostic when the working tree is dirty or the branch contains no implementation commits (#95).` | Standard fix-labelled changelog entry per `AGENTS.md`. |

### Blast Radius

The change touches two skills (`open-pr`, `start-issue`) and the plugin-shared references directory. All changes are prompt-text; no script or schema is modified.

- **Direct impact**:
  - `/open-pr` gains a new fail-fast gate at Step 1. Branches that previously produced version-bump-only PRs now abort with a diagnostic instead — the correct behaviour, but a behavioural break for any workflow that was (knowingly or unknowingly) relying on the permissive path.
  - `/start-issue` loses its local `references/dirty-tree.md` (the file moves, not the behaviour). The per-skill pointer rewrites from `references/dirty-tree.md` to `../../references/dirty-tree.md`; Step 4 semantics are unchanged.
- **Indirect impact**:
  - `/address-pr-comments` invokes `/open-pr`'s pre-push flow only for review-comment cleanups where the branch already has commits; those branches trivially pass the empty-branch check. The dirty-tree check is neutral unless the user has unrelated uncommitted work, in which case aborting is the correct outcome (matches `/start-issue`'s existing stance).
  - `scripts/skill-inventory-audit.mjs` walks per-skill `references/` directories and the plugin-shared `references/` directory. Promoting `dirty-tree.md` and adding `open-pr/references/preflight.md` produces a net-zero inventory delta and the audit continues to pass.
  - SDLC runner: in unattended mode the `ESCALATION: open-pr — {diagnostic}` line is the runner's intended halt signal; the runner's existing escalation handler surfaces the message to the human operator without change.
- **Risk level**: **Low**. The behavioural change is strictly a "now aborts where it previously succeeded silently" tightening, and the silent-success path is the bug being fixed.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A legitimate `/open-pr` run is blocked because the working tree contains only SDLC runtime artifacts (`.codex/sdlc-state.json`, `.codex/unattended-mode`) | Medium (happens on every unattended run) | AC3 explicitly requires filtering those artifacts before evaluating cleanliness; the shared `references/dirty-tree.md` already enforces the filter and the Gherkin regression scenario covers this case. |
| `/start-issue` breaks because its pointer no longer resolves after `dirty-tree.md` is moved | Low | The pointer rewrite in `skills/start-issue/SKILL.md` is part of the same change set; the skill-inventory audit would fail the build if the pointer is broken. |
| Empty-branch regex false-positive: a non-bump commit whose subject happens to start with "chore: bump version" (e.g., a revert of a bump) is filtered and the branch is declared empty | Low | The regex is anchored to `^chore: bump version` — subjects like `Revert "chore: bump version..."`, `chore: document bump process`, or `fix: chore-based bump logic` do not match. The check counts non-matching commits; one such commit is enough to pass. |
| Empty-branch regex false-negative: a malformed bump subject (e.g., `chore(release): bump to 1.2.3`) is counted as implementation work and a version-bump-only branch slips through | Low | Existing `/open-pr` always emits subjects via the exact `chore: bump version to {X.Y.Z}` template (`skills/open-pr/references/version-bump.md` Step 3 step 4). Divergent prior commits are out-of-scope historical noise. |
| `EnterPlanMode` skills or other consumers that run `/open-pr` from an arbitrary state see the gate fire unexpectedly | Low | `/open-pr` is only invoked from `/address-pr-comments` (post-verify, branch has commits) and directly by users (who are the ones the gate is meant to protect). No consumer relies on the silent-success path. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Inline the dirty-tree filter list (`.codex/sdlc-state.json`, `.codex/unattended-mode`) directly in `/open-pr`'s Step 1 without extraction | Smallest diff — one new paragraph in `open-pr/SKILL.md`, no file moves | Violates FR5 (explicitly prohibits duplicating the runtime-artifact list inline) and creates two places to update the next time a runtime artifact is added. |
| Point `/open-pr` directly at `skills/start-issue/references/dirty-tree.md` via a `../../start-issue/references/dirty-tree.md` pointer | Avoids the file move | Cross-skill pointers violate `steering/structure.md`'s per-skill-reference contract ("Per-skill references must not hold content other skills consume"). Skill-inventory audit would flag the coupling. |
| Add the preflight gate to `/verify-code` instead of `/open-pr`, so `/open-pr` can assume a clean hand-off | Enforces the gate earlier in the pipeline | `/open-pr` can be invoked directly by users or by `/address-pr-comments` without re-running `/verify-code`; the gate must live on `/open-pr` itself, not an upstream skill. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references (`open-pr/SKILL.md` Step 1; `open-pr/references/version-bump.md` Steps 2–3)
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed (two skills, one shared-ref promotion, net-zero audit delta)
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (plugin-shared `references/` tier per `structure.md`; `ESCALATION:` sentinel per `references/unattended-mode.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #95 | 2026-04-23 | Initial defect report |
