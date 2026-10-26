# Tasks: Track /sdlc-execute's queued issues with a Claude Code /goal

**Issue**: #529
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Implementation Tasks

### T001: Add Node-free goal helpers

**File(s)**: `src/host-events.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `EXECUTE_GOAL_MAX_ISSUES`, `executeGoalCondition`, `executeGoalRequest`, `isExecuteSuperviseCommand`, and `executeGoalStoppedLine` behave as design.md specifies (FR2, FR3)
- `executeGoalCondition` names every issue in order, quotes each `#N: MERGED and CLOSED` line and the `/sdlc-execute stopped:` prefix, returns at most 4,000 characters for 20 issues, and returns `null` for empty, duplicate, non-integer, or more than 20 issues
- The module still imports nothing

### T002: Add the `goal` controller subcommand

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `sdlc-execute.mjs goal #A #B` prints `{"ok":true,"issues":[A,B],"condition":<executeGoalCondition([A,B])>}` and exits 0; flags are accepted and ignored
- With no tokens on a branch `parseIssueBranch` recognizes, it prints that issue; on any other branch it prints `{"ok":false,"reasonCode":"goal_issues_unresolved"}` and exits 1
- Invalid tokens print the existing usage on stderr and exit 2; no GitHub, Herdr, or git-write call is made

### T003: Set the goal and gate supervise in the hooks module

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- A successful `/sdlc-execute` dispatch starts an execute run with no goal; headless, model-refused, and render-failed dispatches start none (AC6)
- During an execute run with no goal set, a Bash `supervise` call is refused with `{ deny }` and never reaches `next` (FR1, AC5)
- A `goal` helper result with valid issues is recorded, and the next main-loop `turn.complete` that is not aborted runs `$.command.run({ command: 'goal', args: executeGoalCondition(issues) })` through `void`, marking the goal set first (AC1, AC2)
- A missing `goal` command or a rejected run submits a prompt carrying `executeGoalStoppedLine(reason)` and leaves `supervise` refused (AC5)
- The module imports no Node built-ins and type-checks against the existing `tsconfig.json`

### T004: Route the execute workflow through the goal

**File(s)**: `workflows/execute/WORKFLOW.md`
**Type**: Modify
**Depends**: T002, T003
**Acceptance**:
- A **Set the goal** section is reached from the explicit-token path, the bare issue-branch path, and **Select specified issues** step 7 before any `supervise` call; it runs `goal` with the same tokens, ends the turn, and continues with `supervise` in the goal's turn (AC1, AC2)
- Terminal rules require repeating each `#N: MERGED and CLOSED` line verbatim and printing `/sdlc-execute stopped: <diagnosis>` on a halt or non-remediable exit (AC3, AC4)
- The goal failure line, the existing stop paths that set no goal, and `/goal clear` are described (AC5, AC6, FR6)

### T005: Document the goal in the README and changelog

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- The README `/sdlc-execute` section describes the goal, its completion lines, the `goal_unavailable` stop, `/goal` status, and `/goal clear` (FR6)
- `CHANGELOG.md` `[Unreleased]` gains a bullet that ends with `(#529)`

### T006: Add goal behavior and contract tests

**File(s)**: `scripts/__tests__/execute-goal.test.mjs`, `scripts/skill-inventory.baseline.json`
**Type**: Create | Modify
**Depends**: T001, T002, T003, T004, T005
**Acceptance**:
- Unit tests cover `executeGoalCondition` (order, exact completion lines, 20-issue length ≤ 4,000, invalid input → `null`), `executeGoalRequest`, `isExecuteSuperviseCommand` (quoted, `<plugin-root>`, and absolute spellings; `decide`/`wait`/`list-specified` → false), and `executeGoalStoppedLine` (AC1–AC5)
- CLI tests run `sdlc-execute.mjs goal` in a temporary git repository for explicit tokens, an `N-*` branch, a non-issue branch (exit 1), and invalid tokens (exit 2) (AC1, AC2)
- Source contract tests assert that `hooks/register.ts` refuses `supervise` before the goal, runs `command: 'goal'` from `turn.complete`, and uses `executeGoalStoppedLine`, and that `WORKFLOW.md` and `README.md` contain the goal section, the `/sdlc-execute stopped:` line, and `/goal clear` (AC3–AC6)
- `cd scripts && npm test`, `node scripts/skill-inventory-audit.mjs --check`, and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0, with the inventory baseline refreshed if the workflow change requires it

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #529 | 2026-10-26 | Initial feature tasks |
