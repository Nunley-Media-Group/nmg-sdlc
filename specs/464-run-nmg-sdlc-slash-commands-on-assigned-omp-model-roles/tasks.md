# Tasks: Run nmg-sdlc slash commands on assigned OMP model roles

**Issue**: #464
**Date**: 2026-10-22
**Status**: Approved
**Author**: NMG

---

## Implementation Tasks

### T001: Add command roles to the shared role map

**File(s)**: `src/sdlc-model-roles.mjs`, `src/sdlc-commands.mjs`, `scripts/sdlc-execute.mjs`
**Type**: Create
**Depends**: none
**Acceptance**:
- `src/sdlc-model-roles.mjs` exports frozen `SDLC_MODEL_ROLES`. Its `commands` maps `sdlc-execute`, `sdlc-status`, and `sdlc-open-pr` to `smol` and `sdlc-verify-code` to `slow`. Its `stages` holds the execute stage-worker roles from #463, and `scripts/sdlc-execute.mjs` reads stage roles from `SDLC_MODEL_ROLES.stages`. No second definition of any stage or command role remains (FR1)
- `roleThinkingLevel(role, { getModelRole, resolve })` implements the design's Thinking level rule (AC1, FR2)
- `parseAutomatedSlash(text)` in `src/sdlc-commands.mjs` returns `{ command }` for the four `AUTOMATED_COMMANDS` names, with or without arguments. It returns `null` for everything else, including all six interactive commands (FR1, FR4)

### T002: Switch and restore the session model for automated TUI commands

**File(s)**: `src/extension.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- An idle TUI submission of an automated command switches to `ctx.models.resolve("@<role>")` via `pi.setModel` before the input handler resolves. When the role's matched selector has an explicit thinking level, it is applied via `pi.setThinkingLevel` (AC1, FR2)
- A terminal `agent_end` restores the prior model and thinking level, whether the run ended by completion, an `error` stop, or an `aborted` stop. A `willContinue: true` end does not restore. An open record is also settled at the next idle TUI submission. `pi.setModel` and `pi.setThinkingLevel` are only ever called with a single argument (AC2, FR2, FR3)
- If the model or thinking level differs from the switched values at settle time, it stays active and nothing is restored (AC3, FR3)
- Interactive command submissions keep the unchanged `/plan` rewrite. They cause no `setModel` or `setThinkingLevel` call, including at their runs' `agent_end` (AC4, FR4)
- An unresolvable role, or a `setModel` that returns `false` or throws, shows `NMG SDLC: @<role> is unavailable; /<command> continues on the current model.` once. No thinking change is made and no record is kept (AC5, FR5)
- A `source` other than `interactive`, a headless context, or `ctx.isIdle()` not returning `true` causes no switch and no settle (AC6, FR6)
- A failed restore shows `NMG SDLC: the previous model could not be restored after /<command>.`. No `input` or `agent_end` handler rejects (FR3)
- `src/extension.ts` still passes no `AUTOMATED_COMMANDS` name to `registerCommand`

### T003: Cover automated-command model roles in the extension host fixture

**File(s)**: `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- The fixture's `extension()` accepts API overrides, including `pi.settings`, merged into the installed API. A model-aware host fakes the following:
  - `setModel`: records the provider/id and argument count, returns `false` for models marked unauthenticated, and resets thinking to the new model's default level as OMP does.
  - `getThinkingLevel` and `setThinkingLevel`: `setThinkingLevel` records its argument count.
  - `models.resolve`: handles `@role` and `provider/id[:level]` specs from a `modelRoles` table and an available-model list.
  - `models.current` and `isIdle`.
- A `describe('automated command model roles')` block holds one `it` per scenario. Each `it` is titled exactly like its SCN001–SCN006 scenario in `feature.gherkin` and asserts that scenario's Then steps (AC1–AC6)
- The new assertions fail without T002 and pass with it. `repository.tests` (`npm test -- --runInBand` in `scripts/`) exits 0

### T004: Cover role thinking-level selection and automated command parsing

**File(s)**: `scripts/__tests__/sdlc-model-roles.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- `roleThinkingLevel` cases (AC1, FR2):
  - A single selector `x/deep:xhigh` → `xhigh`.
  - `a/unavailable:high, b/ok:low` → `low`.
  - A resolvable selector without a suffix → `undefined`.
  - `b/ok:inherit` → `undefined`.
  - `@default` with `default: "c/x:medium"` → `medium`.
  - `*` → the `default` role's level.
  - A cycle (`smol: "@slow"`, `slow: "@smol"`) → `undefined`.
  - An unset role → `undefined`.
  - A throwing `getModelRole` → `undefined`.
  - `ollama/qwen3:8b` → `undefined`.
- `parseAutomatedSlash` cases (FR1, FR4):
  - `/sdlc-status`, `/sdlc-status --json`, `/sdlc-execute #9`, `/sdlc-verify-code #9`, and `/sdlc-open-pr #9` return their commands.
  - `/sdlc-statusx`, `sdlc-status`, `please /sdlc-status`, and each of the six interactive commands return `null`.
- `repository.tests` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #464 | 2026-10-22 | Initial feature tasks |
