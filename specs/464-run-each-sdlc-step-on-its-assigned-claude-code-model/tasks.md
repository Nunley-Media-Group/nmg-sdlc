# Tasks: Run each nmg-sdlc step on its assigned Claude Code model

**Issue**: #464
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG

---

## Implementation Tasks

### T001: Define the step model map

**File(s)**: `src/host-events.mjs`, `src/host-events.d.mts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `SDLC_MODELS` is exported, deep-frozen, and equal to the design's map. Its type declaration is in `src/host-events.d.mts` (FR1)
- `SDLC_MODELS.commands` has exactly one key for each `INTERACTIVE_COMMANDS` and `AUTOMATED_COMMANDS` name, and every value is `haiku`, `sonnet`, or `opus` (FR1, FR6)

### T002: Launch stage workers on their model

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `stageModel(step, failure)` is exported and implements the design rule. `workerAgentArgs` appends `--model <model>` when given one (AC1, AC2, FR2)
- `defaultHerdr().agentStart` forwards `model`, and `runExecute` passes `stageModel(step, failure)` for every dispatch (AC1, AC2)
- `agent_start_failed`, prompt suppression, and owned-pane cleanup are unchanged (AC7)

### T003: Declare models in the automated command files

**File(s)**: `src/sdlc-commands.mjs`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `renderAutomatedCommandMarkdown` writes `model: <SDLC_MODELS.commands[name]>` after `argument-hint` (AC3, FR3)
- The three command files are regenerated from the renderer and match it byte-for-byte (FR3)

### T004: Route hooks-registered commands through `turn.step`

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- After the headless guard and a successful render, each `INTERACTIVE_COMMANDS` `command.run` handler sets the override from `SDLC_MODELS.commands` and `$.session.model()` (AC4)
- A `turn.step` hook rewrites `model` only for main-loop steps while the override is active and the session model equals the recorded one. It leaves `effort` and subagent steps unchanged (AC4, AC5, FR4)
- A `prompt.submit` hook clears the override on a non-meta `composer` or `bridge` submission, and plugin-origin, other-origin, and meta submissions keep it (AC5, FR5)
- No hook changes the session model, writes settings, or blocks a request when `$.session.model()` throws (FR4)

### T005: Sync agents, steering, and README

**File(s)**: `agents/spec-implementer.md`, `agents/deliverer.md`, `steering/snippets/project-tech.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `spec-implementer` and `deliverer` declare `model: sonnet`. `starter` and `architecture-reviewer` are unchanged (AC6)
- The steering Agent Files table and rule sentence match the design (AC6, FR7)
- `README.md` documents the Model Map, and `CHANGELOG.md` `[Unreleased]` records the change (FR7)

### T006: Test coverage

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/plugin-commands.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`, `hooks/register.test.ts`
**Type**: Modify
**Depends**: T002, T003, T004, T005
**Acceptance**:
- `sdlc-execute.test.mjs`:
  - `stageModel` cases cover each fresh stage, a repairable failure for implement, verify, and deliver (→ `opus`), and both exempt reason codes (→ the stage model).
  - `workerAgentArgs` is tested with and without `model`.
  - A `runExecute` fixture asserts the `agentStart` model for a fresh dispatch, a repair re-dispatch, and the dispatch after the failure clears.
  - An `agentStart` failure on a model-routed launch sends no prompt (SCN001, SCN002, SCN007).
- `plugin-commands.test.mjs` asserts each command file's `model` frontmatter (SCN003)
- `steering-contract.test.mjs` asserts agent `model` equals `SDLC_MODELS.stages` per step, and `sdlc-commands.test.mjs` asserts `SDLC_MODELS.commands` key coverage (SCN006)
- `hooks/register.test.ts` has a `describe('step models')` block whose tests are titled like SCN004 and SCN005 and assert their Then steps. The fixture records `turn.step` models, the session model, and prompt origins (SCN004, SCN005)
- The new assertions fail without T002–T005 and pass with them. `repository.tests` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #464 | 2026-10-22 | Initial feature tasks (OMP model roles) |
| #464 | 2026-10-24 | Replaced with Claude Code per-step model tasks; absorbed #463 |
