# Tasks: Harden execute against transient Herdr lifecycle races

**Issue**: #219
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG

---

## T001: Recover deterministic worker prompts safely

- Parse stalled prompt diagnostics from stderr as well as stdout.
- Recover early-idle new and retained worker prompts only when expected prompt identity is visible.
- Wait already-working workers through settlement.
- Preserve handoff and fail-closed behavior.

## T002: Separate interactive review transitions

- Submit a pasted `/review` command when necessary.
- Observe and select Review Mode.
- Observe and select literal `main` in the base-branch menu.

## T003: Retry transient worker startup once

- Wait one second after the first failure.
- Retry the same agent and pane once.
- Preserve `agent_start_failed` and pane retention after a second failure.

## T004: Add behavioral regression coverage

- Cover stderr errors, early idle, active workers, unrelated detection text, retained prompts, staged review menus, one-start recovery, and two-start failure.
- Run focused controller suites.

## T005: Prove end-to-end delivery

- Inject one real first-start failure in the disposable smoke repository.
- Complete the full execute queue through merged PR and closed issue.
- Confirm a clean main worktree and no leftover worker panes.
