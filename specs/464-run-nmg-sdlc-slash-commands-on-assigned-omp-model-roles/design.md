# Design: Run nmg-sdlc slash commands on assigned OMP model roles

**Issue**: #464
**Date**: 2026-10-22
**Status**: Approved
**Author**: NMG

---

## Overview

The `src/extension.ts` `input` handler already sees every TUI submission before OMP expands file commands and before the run reads the session model. It gains a role switch for the four automated commands:

1. Resolve the command's role.
2. Switch the session model, and the role's explicit thinking suffix, through session-only extension APIs.
3. Record the prior model and thinking level.
4. Restore them when the command's run ends terminally, unless the user changed either in the meantime.

Interactive commands keep their existing native `/plan` rewrite and never switch. Automated commands remain `commands/*.md` file commands. No automated name is passed to `registerCommand`.

## Architecture

- `src/sdlc-model-roles.mjs` owns `SDLC_MODEL_ROLES`, the single frozen role map, and the pure helper `roleThinkingLevel`. The map has two keys:
  - `stages`: the execute stage-worker roles delivered by #463.
  - `commands`: `{ "sdlc-execute": "smol", "sdlc-status": "smol", "sdlc-open-pr": "smol", "sdlc-verify-code": "slow" }`.
- The command entries join the role map that `scripts/sdlc-execute.mjs` reads for stage-worker `--model @<role>` arguments. If that map is not already `SDLC_MODEL_ROLES.stages` in `src/sdlc-model-roles.mjs`, move its entries unchanged into `SDLC_MODEL_ROLES.stages` and make `scripts/sdlc-execute.mjs` read them from there. Every stage and command role then has exactly one definition.
- `src/sdlc-commands.mjs` exports `parseAutomatedSlash(text)` beside `parseInteractiveSlash`. Its regular expression is built from `AUTOMATED_COMMANDS` names.
- `src/extension.ts` holds at most one `roleSwitch` record in the extension factory closure, which has TUI-process scope. It implements two functions:
  - `switchToCommandRole(command, ctx)`, called from `input`.
  - `settleRoleSwitch(ctx)`, called on a terminal `agent_end` and on the next idle TUI submission while a record is still open.
- Host APIs used (OMP 18). The structural `ExtensionAPI` and `CommandContext` types in `src/extension.ts` gain them as optional members. No `@oh-my-pi` dependency is added.
  - `pi.setModel(model): Promise<boolean>`: session-only; returns `false` without credentials; may throw.
  - `pi.getThinkingLevel(): string | undefined`.
  - `pi.setThinkingLevel(level)`: always called with one argument, so it never persists.
  - `pi.pi.settings.getModelRole(role): string | undefined`: the effective merged `modelRoles` value.
  - `ctx.models.resolve(spec)` and `ctx.models.current()`.
  - `ctx.isIdle()`.
  - `ctx.ui.notify(message, "warning")`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `SDLC_MODEL_ROLES.commands` (`src/sdlc-model-roles.mjs`) | automated command name | role name | `sdlc-execute`, `sdlc-status`, `sdlc-open-pr` → `smol`; `sdlc-verify-code` → `slow`; frozen |
| `parseAutomatedSlash(text)` (`src/sdlc-commands.mjs`) | submitted text | `{ command }` or `null` | Trims the text and matches `/` plus one `AUTOMATED_COMMANDS` name, followed by end of text or by whitespace and arguments; the regular expression is built from `AUTOMATED_COMMANDS` like `INTERACTIVE_SLASH_RE`. `/sdlc-status --json` → `{ command: "sdlc-status" }`. `/sdlc-statusx`, `sdlc-status`, and every interactive command → `null` |
| `roleThinkingLevel(role, { getModelRole, resolve })` (`src/sdlc-model-roles.mjs`) | role name; effective role-value lookup; model resolver | explicit thinking level or `undefined` | Thinking level rule below |
| `input` handler (`src/extension.ts`) | `{ text, source }`, ctx | interactive rewrite or `undefined` | State and UI Behavior below |
| `agent_end` handler (`src/extension.ts`, registered separately from the write-spec handler) | `{ willContinue }`, ctx | none | `willContinue === true` is ignored; otherwise an open record is settled with `void settleRoleSwitch(ctx)` |

### Thinking level rule

`roleThinkingLevel(role, deps, seen = new Set())`:

1. Return `undefined` when `role` is already in `seen`. Otherwise add it.
2. Read `value = deps.getModelRole(role)`. A throw, a non-string, or a blank value returns `undefined`.
3. Split `value` on `,`, trim each selector, and drop empty ones. Skip any selector for which `deps.resolve(selector)` is `undefined`. The first resolvable selector decides the result:
   - It ends in `:<level>` with a level in `off|minimal|low|medium|high|xhigh|max|auto`: return that level.
   - It ends in `:inherit`: return `undefined`.
   - It is `*`: return `roleThinkingLevel("default", deps, seen)`.
   - It starts with `@` and has no suffix: return `roleThinkingLevel(<name after @>, deps, seen)`.
   - Anything else returns `undefined`. This includes ids with non-level colons such as `ollama/qwen3:8b`.
4. If no selector resolves, return `undefined`.

The extension passes `getModelRole: (name) => pi.pi?.settings?.getModelRole?.(name)` and `resolve: (spec) => ctx.models.resolve(spec)`.

## State and UI Behavior

The `roleSwitch` record is `{ command, previousModel, previousThinking, switchedModel, switchedThinking }`. Two models are the same when their `provider` and `id` are equal.

The `input` handler keeps the existing interactive rewrite and its `startInteractiveCommand` call synchronous and unchanged. It then proceeds as follows:

- A submission is eligible when `source === "interactive"`, `!isInteractiveHeadless(ctx)`, and `ctx.isIdle?.() === true`.
- An ineligible submission returns the rewrite result unchanged. Nothing is switched or settled.
- An eligible submission with no open record that is not an automated command also returns the rewrite result synchronously.
- Any other eligible submission returns a promise that settles an open record first. For an automated command it then awaits `switchToCommandRole`. The promise resolves to the rewrite result, which is `undefined` for automated commands, so OMP expands the file command normally.

`switchToCommandRole(command, ctx)`:

1. If any of `pi.setModel`, `pi.getThinkingLevel`, `pi.setThinkingLevel`, `ctx.models.resolve`, or `ctx.models.current` is missing, or `ctx.models.current()` is `undefined`, return without switching or notifying.
2. Capture `previousModel = ctx.models.current()` and `previousThinking = pi.getThinkingLevel()`.
3. Let `role = SDLC_MODEL_ROLES.commands[command]` and `target = ctx.models.resolve("@" + role)`. If `target` is `undefined`, notify `NMG SDLC: @<role> is unavailable; /<command> continues on the current model.` as `"warning"` and return.
4. `await pi.setModel(target)`. If it returns `false` or throws, show the same warning and return without recording anything.
5. Let `level = roleThinkingLevel(role, …)`. If it is defined, call `pi.setThinkingLevel(level)`. Otherwise leave the thinking level as OMP applied it for the new model.
6. Record `{ command, previousModel, previousThinking, switchedModel: ctx.models.current() ?? target, switchedThinking: pi.getThinkingLevel() }`.

`settleRoleSwitch(ctx)`:

1. Take and clear the open record. If there is none, return.
2. If `ctx.models.current()` is not the same model as `switchedModel`, or `pi.getThinkingLevel()` differs from `switchedThinking`, return without restoring. The user's choice wins.
3. `await pi.setModel(previousModel)`. If it returns `true`, call `pi.setThinkingLevel(previousThinking)` when `previousThinking` is defined. If it returns `false` or throws, notify `NMG SDLC: the previous model could not be restored after /<command>.` as `"warning"`.

Neither function rejects: every host call sits inside `try/catch`, because a rejected detached promise is fatal to the OMP session.

A run can end without any terminal `agent_end`, for example when it is aborted before dispatch. Its record stays open, and the next eligible submission settles it before handling the input.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Register automated commands with `registerCommand` and switch in the handler | Rejected | Extension handlers win over `commands/*.md`, and print mode drops `sendUserMessage` |
| Take the thinking level from `ctx.models.resolve` | Rejected | It returns the model only |
| Import `resolveModelRoleValue` from `@oh-my-pi/pi-coding-agent/config/model-resolver` | Rejected | It resolves only inside the OMP host, and plain-Node contract tests import `src/extension.ts` |
| Detect user model changes through host events | Rejected | OMP exposes no extension event for model or thinking changes; state is compared at settle time |
| Settle on terminal `agent_end` and on the next idle submission | Selected | Covers terminal run ends and runs that never emit one |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #464 | 2026-10-22 | Initial feature design |
