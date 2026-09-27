# Root Cause Analysis: Exit native plan mode when write-spec Finished is selected

**Issue**: #444
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

---

## Root Cause

`src/extension.ts` enters native plan mode for `/sdlc-write-spec` through `rewriteInteractiveInput` and, after a merged publication, resubmits the materialized workflow into plan mode on the next terminal `agent_end`. Both Finished pickers therefore run in an active plan-mode session. `workflows/write-spec/WORKFLOW.md` handles each Finished choice by printing and stopping, and nothing in the workflow or extension ends plan mode. Native plan mode only lets a turn end through `ask` or `xd://propose`, so the agent keeps re-prompting.

The extension already observes every `tool_result` (including `ask` results with `details.selectedOptions` / `details.results[].selectedOptions`) and already submits text through the focused TUI editor on a terminal `agent_end`, but it has no Finished-driven path. The host's bare `/plan` only moves an enabled plan to `plan_paused`; a second bare `/plan` from `plan_paused` appends `none`. The editor's `submit()` fires its async `onSubmit` handler without awaiting it, so two back-to-back `submit()` calls race and can leave the session paused.

Native plan mode never ends a text-only plan-mode reply terminally. OMP's `#enforcePlanModeDecisionAtSettle` (`agent-session.ts`) appends a decision reminder, forces a required tool choice, and continues, so that reply's `agent_end` carries `willContinue: true`. Live verification at `3789e93` showed that waiting for a terminal `agent_end` after Finished never fires. The model re-asks instead, and the session stays in `plan`.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `src/sdlc-commands.mjs` | new `WRITE_SPEC_FINISHED_LABELS`, `writeSpecFinishedSelection` | Classifies `ask` tool results as Finished / not Finished |
| `src/extension.ts` | `WriteSpecContinuation` state, `input` / `tool_result` / `agent_end` handlers, registered command handler | Tracks the write-spec session and dispatches the plan-mode exit |
| `workflows/write-spec/WORKFLOW.md` | Initial issue selection step 7; Continue loop Finished | Finished must end the turn without `ask` / `xd://propose` |
| `workflows/write-spec/references/publish.md` | Native-plan continuation, Finished | Describes the exit |
| `references/interactive-gates.md` | Plan-mode entry | Describes the exit and its fallback |

## Fix Strategy

Record a Finished selection per write-spec session and, at that reply turn's exit point (the next terminal `agent_end`, or the host's plan-mode decision continuation for a text-only reply), run builtin `/plan` through the focused editor's `onSubmit` handler, awaiting each call and re-reading the session mode, until the mode is `none`. Every undispatchable or non-progressing case warns once and dispatches nothing more.

1. `src/sdlc-commands.mjs`
   - `export const WRITE_SPEC_FINISHED_LABELS = Object.freeze(["Finished — stop writing specs", "Finished — stop without writing a spec"]);` (U+2014 em dash, identical to the workflow labels).
   - `export function writeSpecFinishedSelection(event)`: return `null` unless `event?.type === "tool_result"` and `event.toolName === "ask"`; return `false` when `event.isError === true`; otherwise collect `event.details.selectedOptions` (when an array) and each `event.details.results[i].selectedOptions` (when `results` is an array) and return `true` iff any collected entry is a string strictly equal to a `WRITE_SPEC_FINISHED_LABELS` member, else `false`. Automatic Other (`customInput`) is never Finished.
2. `src/extension.ts`
   - `HostEditor` gains `onSubmit?: (text: string) => void | Promise<void>`.
   - State becomes `{ published, pending, active: boolean, exitPending: boolean }`, initialized `active: false, exitPending: false`.
   - `input` handler and the registered-command handler: when a rewrite happens for `sdlc-write-spec`, assign `{ published: [], pending: false, active: true, exitPending: false }`; for any other interactive command, assign `{ active: false, exitPending: false }` (published/pending untouched).
   - `tool_result`: first evaluate `writeSpecFinishedSelection(event)`; when non-null, set `writeSpec.exitPending = finished` only if `writeSpec.active`, then return (an `ask` result is never a merge result). The last `ask` result in a turn wins. Otherwise run the existing merge-recording logic unchanged.
   - Extract `focusedEditor(session): HostEditor | undefined` from the current continuation gate: returns `undefined` unless `session.hasUI === true`, `ui.getEditorText`, `ui.setEditorComponent`, and `pi.pi?.CustomEditor` exist, the draft is `""`, `setEditorComponent` resolves a focused `CustomEditor` instance without throwing, and `disableSubmit !== true`. The continuation path uses it (plus its existing `ui.setEditorText` check) with identical behavior, and sets `writeSpec.active = true` after a successful submission.
   - `agent_end`: when `willContinue === true`, return (pending state untouched) unless `exitPending` is set, no continuation is pending, and the end is a *plan-mode decision continuation*: session mode `plan`, and the last assistant message has no `toolCall` part and a `stopReason` other than `error`/`aborted`. That case runs the exit; awaiting the `/plan` dispatch aborts the forced continuation. Otherwise (terminal end): if `writeSpec.pending`, set `exitPending = false` and run the continuation path; else if `writeSpec.exitPending`, set `exitPending = false` (one-shot) and run the exit:
     - `mode = sessionModeFromEntries(entries)`; if `mode` is neither `plan` nor `plan_paused`, set `active = false` and return silently.
     - `editor = focusedEditor(session)`; if absent or `typeof editor.onSubmit !== "function"`, notify the warning and return.
     - Run an async sequence (the handler does not await it): up to two iterations — read `before` mode; stop if not `plan`/`plan_paused`; `await editor.onSubmit("/plan")`; stop if the mode is unchanged. Catch any throw/rejection. Afterwards, if the mode is `none` set `active = false`; otherwise notify the warning.
   - Warning literal: `const FINISHED_EXIT_NOTICE = "NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.";` shown with `ui.notify(FINISHED_EXIT_NOTICE, "warning")`.
   - The exit never calls `setEditorText`, `sendUserMessage`, git, or GitHub.
3. Contracts: WORKFLOW.md step 7 and the Continue-loop Finished paragraph end with “End the turn there without another `ask` or `xd://propose`; after the turn ends, the extension exits native plan mode fully.” `publish.md` and `references/interactive-gates.md` describe the terminal-`agent_end` `/plan` exit and the warning fallback; README's write-spec paragraph states that Finished leaves plan mode.

## Blast Radius

- `agent_end` now has two paths; the continuation path keeps its gates, pending-retry semantics, and notice, and wins over a Finished exit in the same turn.
- Other interactive commands clear `active`, so their `ask` results never arm an exit.
- The host's builtin `Exit plan mode?` confirmation (shown when a session-local plan draft exists) is awaited inside the first `/plan`; confirming continues to `none`, declining leaves mode `plan` and triggers the warning.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Await the focused editor's `onSubmit("/plan")` per toggle and re-read the session mode | Selected | Serializes toggles through the same handler `submit()` uses; deterministic end state |
| `setEditorText("/plan")` + `submit()` twice | Rejected | `submit()` does not await `onSubmit`; the second toggle races the first |
| A single `/plan` | Rejected | Leaves the session `plan_paused` |
| Poll session entries with timers between submissions | Rejected | The host confirmation has unbounded duration |
| Workflow-only change | Rejected | The agent cannot leave plan mode itself |

## Smoke Gate Self-Provisioning (steering)

### Root cause

`configuredIssues()` in `steering/extensions/nmg-sdlc-smoke.mjs` resolves the queue only from `config.issues` or `env[config.issuesEnv]`. Spec 343 left provisioning to an operator (`/sdlc-draft-issue` + `/sdlc-write-spec` in the smoke repo, then `export NMG_SDLC_SMOKE_ISSUES`). Nothing in `/sdlc-execute` performs that step, so an unattended run always fails the required gate with `nmg-sdlc-smoke issues config invalid`.

### Live probe facts (2026-09-26, smoke issue #179, spec PR #180)

- Herdr reports a pending `ask` as `blocked`, but reports the native plan-approval selector as `idle`.
- A single indefinite `herdr agent wait` did not return at an idle plan-approval gate; the driver must poll `herdr agent get` / `herdr agent read`.
- The TUI rewrites `#N` in a prompt into `pr://N` and leaves it unsubmitted; prompts must use a bare `N`.
- Each ask question has its Recommended option pre-selected; `enter` selects it and advances; a multi-question ask ends on a `Submit` review tab that also takes `enter`. The plan selector pre-selects `Approve and execute`; `enter` approves.
- The session JSONL path is `agent_session.value` from `herdr agent get`. A pending ask is the last `toolCall` named `ask` without a later `toolResult` for its id, and its `arguments.questions[]` give the option lists.
- After publication, write-spec's continuation picker recommends an unrelated issue, and the installed plugin then loops in plan mode (this issue's first defect). GitHub evidence, not the session, must end provisioning.

### Fix strategy

1. **Queue resolution** (`configuredIssues` → `resolveQueue(config, env)`): returns `{ kind: "explicit", issues }` for `config.issues` or a non-empty `env[config.issuesEnv]` (unchanged parsing and failures), `{ kind: "provision", need }` when the env value is absent/blank and `config.provision.need` is a non-empty string, otherwise `null` → `failed "nmg-sdlc-smoke issues config invalid"`. On the nested-ownership path a provisioning queue matches only the outer invocation's recorded `provisioned` issue.
2. **Recovery identity**: for `provision`, a stored state for the same scope with an unpublished `provisioned: { issue }` supplies `issues = [issue]` and only finishes its spec (no new draft). A stored state in phase `provisioning` without an issue fails closed `nmg-sdlc-smoke provisioning interrupted` unless the outer request identity changed (then it is superseded, like a receipt-less failure). A delivered provisioned issue is terminal: a changed verification identity provisions a fresh issue instead of advancing the old delivery.
3. **Provisioning** (`provisionSmokeIssue({ herdr, runCommand, readFile, need, env, signal, workRoot })`), run only on the outer path after `gh auth` and before the delivery clone:
   - Clone the allowlisted repo into a separate disposable `nmg-sdlc-smoke-provision-*` directory, check origin allowlist and a clean tree.
   - Record `baseline = max issue number` (`gh issue list --state all --limit 1 --json number`). Persist state phase `provisioning` with the baseline.
   - `herdr pane split --current --direction <right|down> --cwd <clone> --no-focus`, `herdr agent start <name> --kind omp --pane <pane>`; poll `agent get` until `interactive_ready`.
   - Phase *draft*: `herdr agent prompt <name> "/sdlc-draft-issue <need>"`. Phase *spec*: `herdr agent prompt <name> "/sdlc-write-spec <N>"` (bare N).
   - Poll loop (fixed interval, no wall-clock deadline, aborts on `signal`): first evaluate the phase completion predicate; then classify the gate; then act:
     - *draft complete*: agent not `working` and `gh issue list -R Nunley-Media-Group/nmg-sdlc-smoke --state all --author @me --json number` shows exactly one issue with number > baseline → N (persist `provisioned: { issue: N }` immediately). More than one → failed; none while the session stays settled → stalled.
     - *spec complete*: issue N has label `spec-created` and `gh pr list --state merged --search "docs: approve spec for #N in:title"` returns a merged PR → done; close the pane immediately without answering anything else.
     - *ask gate* (pending ask in JSONL, agent `blocked`): for each question choose the Recommended option (the `recommended` index, else 0). A free-form or multi-select ask fails closed. When a Recommended option is an issue row (`#M — …`) with M ≠ N, the ask is never answered; unless publication evidence ends provisioning, it stalls and fails. Otherwise send one `enter` per poll and re-evaluate after each key.
     - *plan gate* (agent `idle`, visible screen contains `Plan mode - next step`): send `enter`.
     - *unknown*: `blocked` without an answerable gate, or settled with no gate and no completion, for 20 consecutive polls → failed `nmg-sdlc-smoke provisioning stalled during <phase>` with a screen snapshot.
   - OMP pre-positions each question's cursor on its recommended option (`ask.ts` `cursorIndex = recommended ?? 0`), so only `enter` is ever sent: never text, never Other.
   - `finally`: `herdr pane close <pane>` for the owned pane. On success remove the provisioning clone; on failure retain it and report its path.
   - *plan gate* detection, from live runs: Herdr reports the settled selector as `idle`, as `blocked` without a pending ask, or as `done` in an unfocused pane. The title may be truncated by pane width (`Plan mode - next…`; a prefix of at least `Plan mode` plus an ellipsis counts). After an earlier approval replaced the session, OMP can leave a second selector unpainted, showing only `Plan ready for review.`; the last session message being a successful `xd://propose` result, with no later non-plan `mode_change`, also proves the gate (`pendingPlanApproval`).
4. After provisioning, continue the existing delivery flow with `issues = [N]`; persisted state keeps `provisioned` so terminal/resume paths see the same queue. Evidence adds the issue URL, spec PR URL, and session JSONL path.
5. **Candidate identity**: when `request.projectRoot` is itself a valid nmg-sdlc plugin root (the plugin verifying itself), `smokePluginRoot` uses that checkout for the candidate tree, the execute controller, and the propagated `NMG_SDLC_PLUGIN_ROOT`. An installed package has no Git candidate identity (`candidate identity unavailable`). Nested runs in a non-plugin clone keep the outer invocation's propagated root.
6. **Herdr adapter**: a small local adapter in the extension (`herdr` CLI via the existing `runCommand`), injectable for tests: `paneSplit`, `paneClose`, `agentStart`, `agentGet`, `agentPrompt`, `agentRead`, `agentSendKeys`. Herdr launch failures, cancellation, or process loss → `incomplete`.
7. **Steering application**: write the new extension, manifest (`config: { "issuesEnv": "NMG_SDLC_SMOKE_ISSUES", "provision": { "need": "<text>" } }`), and snippet text through `scripts/sdlc-steering.mjs apply --plan` with the `inspect` `sourceDigest`, then `validate`; record the returned `steeringHash`/`registrationHash`. The extension export keeps the frozen `{ schemaVersion: 1, id, providers }` signature.
   The writer validates a staged copy of `steering/` in a sibling temp directory, where the extension's static `../../src` and `../../scripts` imports cannot resolve (`steering_extension_invalid`). The extension therefore loads those plugin modules through a guarded top-level dynamic import. Loading always succeeds, and a provider invocation without them fails closed with `nmg-sdlc-smoke plugin modules unavailable`.

### Smoke blast radius

- Explicit queues (env or `config.issues`) behave exactly as before.
- Provisioning mutates only `Nunley-Media-Group/nmg-sdlc-smoke`, only through the real draft-issue and write-spec workflows in a provider-owned pane.
- The provider never kills panes it did not create.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #444 | 2026-09-26 | Initial defect design |
| #444 | 2026-09-26 | Added smoke-gate self-provisioning design |
| #444 | 2026-09-27 | Exit at the host's plan-mode decision continuation; smoke provisioning live-probe fixes |
