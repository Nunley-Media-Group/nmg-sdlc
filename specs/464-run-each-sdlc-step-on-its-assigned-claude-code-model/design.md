# Design: Run each nmg-sdlc step on its assigned Claude Code model

**Issue**: #464
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG

---

## Overview

nmg-sdlc steps run in three kinds of host surfaces, and each one gets its model through the mechanism Claude Code provides for it:

| Surface | Steps | Mechanism |
|---------|-------|-----------|
| Herdr Claude worker | execute stages `start`, `implement`, `verify`, `deliver` | `claude --model <model>` in `workerAgentArgs` |
| Plugin command file | `/sdlc-status`, `/sdlc-verify-code`, `/sdlc-open-pr` | frontmatter `model` written by `renderAutomatedCommandMarkdown` |
| Hooks-registered command | `/sdlc-execute`, the six interactive commands | `turn.step` rewrites the main-loop request `model` while the command's override is active |

None of the three changes the session model, so nothing needs restoring.

## Architecture

### Model map

`src/host-events.mjs` is already Node-free and imported by both `hooks/register.ts` and Node scripts. It exports `SDLC_MODELS`, a deep-frozen map:

```js
export const SDLC_MODELS = Object.freeze({
  stages: Object.freeze({ start: "haiku", implement: "sonnet", verify: "opus", deliver: "sonnet" }),
  repair: "opus",
  commands: Object.freeze({
    "sdlc-status": "haiku",
    "sdlc-execute": "haiku",
    "sdlc-open-pr": "sonnet",
    "sdlc-verify-code": "opus",
    "sdlc-draft-issue": "opus",
    "sdlc-write-spec": "opus",
    "sdlc-onboard-project": "opus",
    "sdlc-upgrade-project": "opus",
    "sdlc-steering": "opus",
    "sdlc-run-retro": "opus",
  }),
});
```

`commands` has exactly one key for every `INTERACTIVE_COMMANDS` name and every `AUTOMATED_COMMANDS` name. A test enforces this.

### Execute stage workers (`scripts/sdlc-execute.mjs`)

- `REPAIR_EXEMPT_REASONS = new Set(["pr_evidence_pending", "mergeability_reverification_required"])`.
- `stageModel(step, failure)` returns `SDLC_MODELS.repair` when `step !== "start"`, `failure` is non-null, and `failure.reasonCode` is not in `REPAIR_EXEMPT_REASONS`. Otherwise it returns `SDLC_MODELS.stages[step]`. It throws on an unknown step.
- `workerAgentArgs({ env, pluginRoot, model })` returns `['--plugin-dir', pluginRoot, '--permission-mode', mode]` and appends `'--model', model` when `model` is given.
- `defaultHerdr().agentStart({ name, paneId, model })` passes `model` through to `workerAgentArgs`.
- `runExecute` computes `model = stageModel(step, failure)` from the invocation's live `failure` record at dispatch time and passes it to `api.agentStart`. The existing `agent_start_failed` path, prompt suppression, and pane cleanup are unchanged (AC7).

### Automated command files (`src/sdlc-commands.mjs`)

`renderAutomatedCommandMarkdown` adds `model: <SDLC_MODELS.commands[name]>` after `argument-hint`. The `commands/*.md` files are regenerated, never hand-edited. `scripts/verify-plugin-surface.mjs` already compares checked-in frontmatter with the renderer, so it picks up the new field.

### Hooks-registered commands (`hooks/register.ts`)

Module state: `let override: { command: string; model: string; sessionModel: string } | null = null`.

- **Start.** In each `command.run` handler for `INTERACTIVE_COMMANDS`, after the headless guard and a successful render, set `override = { command: name, model: SDLC_MODELS.commands[name], sessionModel: await $.session.model() }`. A headless refusal or a render failure leaves `override` as it was.
- **Apply.** `on('turn.step', async ($, e, next) => …)`:
  - A step with `e.agentId !== undefined`, or with no `override`, passes through as `next(e)`.
  - If `await $.session.model()` differs from `override.sessionModel`, clear `override` and pass through. The user has picked a model (AC5).
  - Otherwise return `next({ ...e, model: override.model })`. `effort` is left as it is.
- **End.** `on('prompt.submit', …)` clears `override` when the submission comes from the person: `e.origin.kind` is `'composer'` or `'bridge'` (Remote Control) and `e.isMeta !== true`. That includes a new slash command, whose own `command.run` then sets a fresh override. Plugin-origin submissions (the workflow text, write-spec Continue, the Finished nudge) and meta prompts keep it (FR5). The hook always returns `next(e)` unchanged.
- **Ordering.** For a composer-submitted `/sdlc-*` command, `prompt.submit` runs before the command's `command.run`, so the clear comes first and the new override survives. The test fixture asserts this order.
- Every hook body that reads `$.session.model()` catches errors and then passes the event through unchanged, so a host failure never blocks a request.

`/sdlc-execute`'s controller session runs on `haiku`. Its stage workers are separate Herdr processes and are unaffected.

### Agents and steering

- `agents/spec-implementer.md` and `agents/deliverer.md` gain `model: sonnet`. `starter` (`haiku`) and `architecture-reviewer` (`opus`) keep theirs.
- The `steering/snippets/project-tech.md` Agent Files table records the four values. Its rule sentence changes to: "`model` is `haiku`, `sonnet`, or `opus` and matches `SDLC_MODELS`; never hardcode model ids."
- `scripts/__tests__/steering-contract.test.mjs` asserts each agent's `model` equals `SDLC_MODELS.stages[<step>]` for its step (`starter` → start, `spec-implementer` → implement, `architecture-reviewer` → verify, `deliverer` → deliver).
- `README.md` gains a "Models" subsection with the Model Map table.

## API / Interface Changes

| Interface | Input | Output | Behavior |
|-----------|-------|--------|----------|
| `SDLC_MODELS` (`src/host-events.mjs`) | — | frozen map | Single definition of every step model |
| `stageModel(step, failure)` (`scripts/sdlc-execute.mjs`) | stage, failure record or `null` | model alias | AC1/AC2 rule above |
| `workerAgentArgs({ env, pluginRoot, model })` | optional `model` | argv | Appends `--model <model>` when given |
| `renderAutomatedCommandMarkdown(name, …)` | command name | markdown | Frontmatter gains `model` |
| `turn.step` hook (`hooks/register.ts`) | `TurnStepInput` | response | Rewrites main-loop `model` while an override is active |
| `prompt.submit` hook (`hooks/register.ts`) | `PromptSubmitInput` | unchanged | A non-meta `composer` or `bridge` submission clears the override |

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Switch the session model with `/model` and restore it afterward | Rejected | Changes and persists the user's choice. Restore races with user changes, which the OMP design had to handle explicitly |
| Run interactive commands as `opus` subagents | Rejected | Plan mode, `AskUserQuestion`, and `ExitPlanMode` belong to the main loop |
| Use the `opusplan` alias for interactive commands | Rejected | It is a session setting, and it only covers planning, not post-approval execution |
| Rely on agent frontmatter for stage workers | Rejected | Stage workers are Herdr Claude processes, not `Agent` subagents, so `--model` is the only control. Frontmatter is kept in sync as the contract record |
| Per-step effort levels | Deferred | Out of scope. Models alone match the requested change |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #464 | 2026-10-22 | Initial feature design (OMP model roles) |
| #464 | 2026-10-24 | Replaced with Claude Code per-step models across workers, command files, and hooks-registered commands |
