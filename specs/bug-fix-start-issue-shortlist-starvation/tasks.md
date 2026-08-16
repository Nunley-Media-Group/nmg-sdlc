# Tasks: Fix Start-Issue Shortlist Starvation

**Issue**: #175
**Date**: 2026-08-15
**Status**: Fixed
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Define bounded discovery and completed-Project behavior | [x] |
| T002 | Add regression and forward-exercise coverage | [x] |
| T003 | Validate the plugin and real PathCast behavior | [x] |
| T004 | Document the repair | [x] |

### T001: Define Bounded Discovery and Completed-Project Behavior

**Files**: `skills/start-issue/SKILL.md`, `skills/start-issue/references/milestone-selection.md`

- [x] Define four-choice, ten-increment, 100-issue bounds.
- [x] Re-run complete Step 1a classification after expansion.
- [x] Define the exact all-Done predicate and Project-metadata fallback.
- [x] Preserve explicit/manual issue starts with a reopen warning.
- [x] Keep dependency-blocked and Project-completed counts distinct.

### T002: Add Regression and Forward-Exercise Coverage

**Files**: `scripts/__tests__/start-issue-selection-contract.test.mjs`, `scripts/__tests__/exercise-start-issue-backfill.test.mjs`, `specs/bug-fix-start-issue-shortlist-starvation/feature.gherkin`

- [x] Pin the bounds, retry, Done predicate, loop, notes, and explicit recovery in static tests.
- [x] Exercise a disposable queue whose first window starves and whose expanded window contains four ready issues.
- [x] Block and assert every write-shaped GitHub command during discovery.

### T003: Validate the Plugin and Real PathCast Behavior

**Files**: changed plugin surface and verification evidence

- [x] Run focused Jest contract tests.
- [x] Run the opt-in start-issue exercise, including an unneeded malformed trailing candidate.
- [x] Run full Jest, skill inventory, Codex compatibility, plugin-surface, and quick validation.
- [x] Apply the repaired source contract read-only to PathCast and confirm the evaluated prefix yields #103, #104, #105, and #107 without consuming the malformed trailing #96 identity.

### T004: Document the Repair

**Files**: `README.md`, `CHANGELOG.md`, version artifacts during delivery

- [x] Document bounded backfill and all-Done automatic exclusion.
- [x] Add the issue #175 changelog entry.

**Downstream boundary**: protected-repository delivery, marketplace publication, and installed-cache proof belong to `$nmg-sdlc:open-pr` and release operations after local verification. They are not implementation tasks and cannot be preconditions for opening their own pull request.
