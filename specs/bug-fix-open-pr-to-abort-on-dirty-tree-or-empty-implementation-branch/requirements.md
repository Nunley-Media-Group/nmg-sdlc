# Defect Report: Fix /open-pr to abort on dirty tree or empty implementation branch

**Issue**: #95
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: `specs/feature-open-pr-skill/`

---

## Reproduction

### Steps to Reproduce

1. Create a feature branch from `main` and link it to a GitHub issue.
2. Write implementation files to disk for that issue but do NOT commit them.
3. Run `/open-pr #N`.
4. Observe that the skill reads `git status` informatively, proceeds through Step 2 (version bump) and Step 3 (commit `VERSION` + `CHANGELOG.md` + `plugin.json`), then pushes and creates a PR.
5. Inspect the PR: it contains only the version-bump commit; the implementation files remain uncommitted in the local working tree.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS / Linux / Windows (platform-independent — the bug is in prompt logic) |
| **Version / Commit** | nmg-sdlc 1.55.0 and prior |
| **Runtime** | Claude Code (interactive) + SDLC runner (unattended) |
| **Configuration** | Any project with `VERSION` present; both modes affected |

### Frequency

Always, whenever `/open-pr` is invoked with a dirty working tree that contains non-artifact changes, or with a branch whose only non-base commit is a version bump.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Before reading or modifying `VERSION`, `CHANGELOG.md`, or any stack-specific version file, `/open-pr` checks that (a) the working tree has no uncommitted non-artifact changes and (b) the branch contains at least one non-version-bump commit ahead of `main`. Either check failing aborts the skill non-zero with a diagnostic naming the dirty files or the empty-branch condition. In unattended mode both failures emit an `ESCALATION:` line. |
| **Actual** | `/open-pr` Step 1 reads `git status` and `git log main..HEAD --oneline` for situational awareness only — neither output is evaluated against a pass/fail predicate. The workflow proceeds to Step 2 (version bump), Step 3 (stage+commit+push of just `VERSION`, `CHANGELOG.md`, and stack-specific version files), Step 4, and Step 5, producing a version-bump-only PR. Uncommitted implementation files are silently left behind in the working tree. |

### Error Output

None — the bug manifests as silent success. The PR for issue #86 landed with 3 files changed and no implementation content; the feature-delivery commit never existed.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Dirty-Tree Abort Before Any Version-Artifact Read or Write

**Given** the working tree contains uncommitted non-artifact changes (staged, unstaged, or untracked files other than the runtime artifacts listed in AC3)
**When** `/open-pr` runs Step 1
**Then** the skill aborts non-zero before reading or modifying `VERSION`, `CHANGELOG.md`, or any file listed in `steering/tech.md`'s `## Versioning` table
**And** prints a single-line diagnostic that names the dirty files
**And** does NOT invoke `git add`, `git commit`, `git push`, or `gh pr create`

### AC2: Empty-Implementation-Branch Abort

**Given** `git log main..HEAD --oneline` returns either no commits or only commits whose subject matches `^chore: bump version` (case-insensitive)
**When** `/open-pr` evaluates branch state in Step 1
**Then** the skill aborts non-zero with the exact message `No implementation commits found on this branch — run /write-code before opening a PR.`
**And** does NOT invoke `git add`, `git commit`, `git push`, or `gh pr create`

### AC3: SDLC Runtime Artifacts Are Filtered Before Cleanliness Evaluation

**Given** the only dirty files in `git status --porcelain` output are `.claude/sdlc-state.json` and/or `.claude/unattended-mode`
**When** the dirty-tree check runs in Step 1
**Then** those lines are filtered out before the cleanliness predicate is evaluated (mirroring the filter in `skills/start-issue/references/dirty-tree.md`)
**And** the dirty-tree check passes
**And** the workflow continues to the empty-branch check and, on pass, to Step 2

### AC4: Unattended-Mode Escalation for Both Preflight Failures

**Given** `.claude/unattended-mode` exists
**And** either the AC1 (dirty tree) or AC2 (empty branch) condition fires
**When** the Step 1 preflight gate triggers
**Then** the skill prints `ESCALATION: open-pr — {diagnostic}` (where `{diagnostic}` is the condition-specific message) and exits non-zero
**And** does NOT call `AskUserQuestion`
**And** does NOT read or modify `VERSION`, `CHANGELOG.md`, or any stack-specific version file

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add a dirty-tree preflight check to `/open-pr` Step 1 that mirrors the filter in `skills/start-issue/references/dirty-tree.md` (filter `.claude/sdlc-state.json` and `.claude/unattended-mode`, then fail on non-empty output). | Must |
| FR2 | Add an empty-branch check to `/open-pr` Step 1 that aborts when `git log main..HEAD --oneline` contains no commits whose subject does not match `^chore: bump version`. | Must |
| FR3 | Both checks must run and fail fast **before** any read or write of `VERSION`, `CHANGELOG.md`, or stack-specific version files (i.e., before Step 2). | Must |
| FR4 | Unattended mode escalates both failures via a single-line `ESCALATION: open-pr — {diagnostic}` sentinel and exits non-zero without calling `AskUserQuestion`. | Must |
| FR5 | The dirty-tree filter is implemented by reusing `skills/start-issue/references/dirty-tree.md` (via a shared reference or by extracting the filter into a plugin-shared reference), rather than duplicating the runtime-artifact list inline in `open-pr`. | Should |

---

## Out of Scope

- Investigating why `/write-code` failed to commit implementation files for issue #86 (tracked separately).
- Changes to `/write-code`, `/verify-code`, or any other pipeline skill.
- Enforcing that the implementation is "complete" beyond the empty-branch check (e.g., verifying all tasks in `tasks.md` have been addressed — that is `/verify-code`'s job).
- Recovering work from a misfired `/open-pr` that already landed a version-bump-only PR (one-time cleanup, not a skill feature).
- Auto-committing uncommitted changes on the user's behalf — the abort is the correct behaviour; the user must resolve the dirty tree deliberately.

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included (AC3)
- [x] Fix scope is minimal — no feature work mixed in
- [x] Out of scope is defined

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #95 | 2026-04-23 | Initial defect report |
