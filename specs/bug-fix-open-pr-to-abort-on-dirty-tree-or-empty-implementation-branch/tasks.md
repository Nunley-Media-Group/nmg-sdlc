# Tasks: Fix /open-pr to abort on dirty tree or empty implementation branch

**Issue**: #95
**Date**: 2026-04-23
**Status**: Planning
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Promote `dirty-tree.md` to plugin-shared reference | [ ] |
| T002 | Add preflight gate to `/open-pr` Step 1 | [ ] |
| T003 | Add regression Gherkin scenarios | [ ] |
| T004 | Verify no regressions | [ ] |

---

### T001: Promote `dirty-tree.md` to Plugin-Shared Reference

**File(s)**:
- `references/dirty-tree.md` (create)
- `skills/start-issue/references/dirty-tree.md` (delete)
- `skills/start-issue/SKILL.md` (edit pointer)

**Type**: Create + Delete + Modify
**Depends**: None
**Acceptance**:
- [ ] `references/dirty-tree.md` exists at the plugin-shared-references tier and contains the `git status --porcelain` filter with the `.codex/sdlc-state.json` and `.codex/unattended-mode` allowlist.
- [ ] The file's `Consumed by:` header lists both `start-issue` Step 4 and `open-pr` Step 1.
- [ ] Skill-specific prose ("Cannot create feature branch", `gh issue develop`, etc.) is generalized to skill-neutral language (e.g., "Cannot proceed with the workflow" or a placeholder the consumer substitutes); the interactive and unattended abort-message *shapes* are preserved so consuming skills can render their own context.
- [ ] `skills/start-issue/references/dirty-tree.md` is removed from the working tree.
- [ ] `skills/start-issue/SKILL.md` Step 4 pointer reads `Read ../../references/dirty-tree.md when Step 4 begins — ...` with the existing triggering-condition sentence intact.
- [ ] `node scripts/skill-inventory-audit.mjs --check` still exits 0 after the move.

**Notes**: Prep change. No behavioural change for `/start-issue` — pointer path changes, content stays equivalent. Must land before T002 so `/open-pr`'s new preflight.md can reference the shared file.

### T002: Add Preflight Gate to `/open-pr` Step 1

**File(s)**:
- `skills/open-pr/references/preflight.md` (create)
- `skills/open-pr/SKILL.md` (edit Step 1)
- `CHANGELOG.md` (edit `[Unreleased]`)

**Type**: Create + Modify
**Depends**: T001
**Acceptance**:
- [ ] `skills/open-pr/references/preflight.md` exists with a `Consumed by: open-pr Step 1` header, a Step 1a "Dirty-tree check" section that delegates the filter to `../../../references/dirty-tree.md`, and a Step 1b "Empty-branch check" section with the `git log main..HEAD --oneline` command, the `^chore: bump version` case-insensitive filter regex, and the exact abort string `No implementation commits found on this branch — run /write-code before opening a PR.`.
- [ ] `preflight.md` covers both interactive abort messaging and the unattended `ESCALATION: open-pr — {diagnostic}` sentinel line for each of the two failures.
- [ ] `skills/open-pr/SKILL.md` Step 1 begins with a `Read references/preflight.md when Step 1 begins — ...` pointer, and the preflight runs *before* any read of `git status`, `git log`, or spec files — that is, before the existing Step 1 body.
- [ ] The pointer sentence names both failure conditions (dirty tree and no non-bump commits) so the greppable `when`-clause matches both branches.
- [ ] After Step 1 preflight passes, the original Step 1 reads (`gh issue view #N`, spec-glob, `git diff`) execute unchanged.
- [ ] Step 2 (version-bump) and Step 3 (version-artifact writes) are unchanged and are never reached when the preflight fails.
- [ ] `CHANGELOG.md` `[Unreleased]` section contains a `### Fixed` bullet: `/open-pr now aborts with a diagnostic when the working tree is dirty or the branch contains no implementation commits (#95).`.
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits 0.

**Notes**: This is the primary fix. Follow the design's Fix Strategy table row-for-row. Do not modify `references/version-bump.md` — its Steps 2 and 3 are protected by the new gate, not rewritten.

### T003: Add Regression Gherkin Scenarios

**File(s)**: `specs/bug-fix-open-pr-to-abort-on-dirty-tree-or-empty-implementation-branch/feature.gherkin`

**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Feature file tagged `@regression` at the feature level.
- [ ] Four `@regression` scenarios — one per AC (AC1 dirty-tree abort, AC2 empty-branch abort, AC3 runtime-artifact filter, AC4 unattended escalation).
- [ ] Each scenario uses concrete example data from the reproduction steps (e.g., real file names in dirty `git status` output; real `chore: bump version to 1.55.0` commit subjects).
- [ ] AC1 and AC2 scenarios assert the skill aborts *before* `VERSION`/`CHANGELOG.md`/stack-specific files are read or written (not just before the PR is created).
- [ ] AC4 scenario asserts both the `ESCALATION: open-pr — ...` prefix and that `interactive prompt` is NOT invoked.

**Notes**: Exercise-based verification (per `steering/tech.md` Testing Standards) — the Gherkin file is the design artifact; `/verify-code` exercises the skill against a test project with each precondition and evaluates the output against these scenarios.

### T004: Verify No Regressions

**File(s)**: [no file changes — verification only]

**Type**: Verify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits 0.
- [ ] `/start-issue` still aborts cleanly on a dirty tree after the pointer rewrite (exercise: scaffold a disposable test project, dirty the tree, invoke `/start-issue`, confirm abort message is unchanged in shape).
- [ ] `/open-pr` still creates a PR successfully when the working tree is clean AND the branch has at least one non-version-bump commit (happy-path regression).
- [ ] All four ACs from `requirements.md` pass under exercise: AC1 (dirty tree), AC2 (empty branch), AC3 (filtered artifacts), AC4 (unattended escalation).
- [ ] No entries added to `skills/open-pr/SKILL.md` or `preflight.md` reference files outside the design's declared change set (no scope creep).

**Notes**: This task runs during `/verify-code`. Use the dry-run evaluation pattern in `steering/tech.md` Testing Standards → Dry-Run Evaluation for GitHub-Integrated Skills — evaluate what `/open-pr` WOULD create under each precondition, not actual PRs.

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #95 | 2026-04-23 | Initial defect report |
