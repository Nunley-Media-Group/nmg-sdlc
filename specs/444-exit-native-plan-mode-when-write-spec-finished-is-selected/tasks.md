# Tasks: Exit native plan mode when write-spec Finished is selected

**Issue**: #444
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

---

## Implementation Tasks

### T001: Detect write-spec Finished picker selections

**File(s)**: `src/sdlc-commands.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `WRITE_SPEC_FINISHED_LABELS` is exactly `Finished — stop writing specs` and `Finished — stop without writing a spec`
- `writeSpecFinishedSelection(event)` returns `null` for events that are not `ask` `tool_result`s, `true` when a single- or multi-question `ask` result selected one of those exact labels, and `false` for errored results, other labels, and automatic Other custom input (FR1, FR3)

### T002: Fully exit native plan mode after a terminal Finished turn

**File(s)**: `src/extension.ts`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- After a Finished selection in a write-spec session, the reply turn's exit point — a terminal `agent_end`, or a `willContinue: true` plan-mode decision continuation (mode `plan`, last assistant message without a tool call and not `error`/`aborted`) — awaits the focused editor's `onSubmit("/plan")` once per toggle until the session mode is `none` (two toggles from `plan`, one from `plan_paused`) and dispatches nothing else (AC1, AC2, FR1)
- Issue rows, `Continue — enter another issue number`, automatic Other input, a later non-Finished `ask` in the same turn, and `ask` results outside a write-spec session dispatch no exit (AC3)
- Missing UI, non-empty draft, unfocused editor, submit failure, or a mode that stops progressing leaves the draft intact and shows `NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.` once; the pending exit is dropped; any other `willContinue: true` end (not `plan` mode, a tool-call reply, or an `error`/`aborted` stop) dispatches nothing and keeps it pending (AC4, FR4)
- A pending continuation is submitted exactly as before and wins over a Finished exit in the same turn; a new `/sdlc-write-spec` invocation clears published[], pending continuation, and pending exit (AC5, FR3)

### T003: Align write-spec contracts with the Finished exit

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md`, `README.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- `skill://skill-creator` is read before editing workflow-bundled files
- Initial-picker step 7 and the Continue-loop Finished branch keep their labels and output and then end the turn without another `ask` or `xd://propose`, stating that the extension exits native plan mode fully after the turn ends (AC1, AC2, FR2)
- `publish.md`, `references/interactive-gates.md`, and README describe the terminal-turn `/plan` exit and the warning fallback (FR2)

### T004: Add regression coverage for the Finished exit

**File(s)**: `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- The extension fixture's host editor gains an async `onSubmit` that applies bare `/plan` as the host does (`plan` → `plan_paused`, or unchanged when the exit confirmation is declined; `plan_paused` → `none`) and records every dispatched command
- SCN001–SCN005 are exercised: Continue-loop and initial-picker Finished end at mode `none` with exactly two `/plan` commands and no notice; each non-Finished selection dispatches nothing; each undispatchable case and a declined confirmation preserves the draft and notifies once with no retry; the existing continuation assertions still hold
- `writeSpecFinishedSelection` cases cover single and multi-question results, both labels, other labels, custom input, errored results, and non-`ask` events
- The Finished-exit assertions fail without T002 and pass with it; `npm test -- --runInBand` in `scripts/` exits 0

### T005: Self-provision smoke issues in the steering smoke provider

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- With the explicit queue absent or blank and `config.provision.need` set, the outer provider provisions exactly one fresh issue through `/sdlc-draft-issue <need>` then `/sdlc-write-spec <N>` in one provider-owned Herdr `omp` pane in a separate disposable clone, then runs the unchanged delivery smoke for `[N]` (AC6, FR5)
- Gates are detected by polling; asks are answered with the Recommended option per question plus submit, plan approval with `Approve and execute`, using only key presses; issue rows other than N, free-form asks, and unknown gates fail closed (AC7, FR6)
- Spec completion is the `spec-created` label plus a merged `docs: approve spec for #N` PR; the owned pane is then closed without answering further prompts (AC8, FR7)
- Zero/multiple new issues, stalls, and interrupted provisioning fail closed with screen/session evidence and a retained provisioning clone; Herdr launch, cancel, and process loss are `incomplete`; the recovery store records the provisioned issue so retries reuse it (AC9, FR7)
- Explicit queues skip provisioning with unchanged behavior (AC10)
- The frozen extension export signature is unchanged

### T006: Register provisioning in steering through the steering writer

**File(s)**: `steering/manifest.json`, `steering/snippets/project-tech.md`, `steering/snippets/project-product.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- `repository.nmg-sdlc-smoke` config is `{ "issuesEnv": "NMG_SDLC_SMOKE_ISSUES", "provision": { "need": … } }`, still required with `when.kind` `always`
- Snippets state that the gate provisions its own fresh smoke issue unattended, that `NMG_SDLC_SMOKE_ISSUES` is only an optional explicit override, and that operators never provision issues or answer gates
- All steering writes are applied with `node scripts/sdlc-steering.mjs apply --project . --plan <plan>` using the `inspect` `sourceDigest`, then `validate` succeeds (FR8)
- The smoke extension loads in the writer's staged copy of `steering/` (plugin modules imported through a guarded dynamic import); a provider invocation without them fails closed

### T007: Regression coverage and docs for smoke provisioning

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T005, T006
**Acceptance**:
- Faked Herdr/gh/JSONL tests cover SCN006–SCN010: success with exact key sequences and prompts (bare N), publication-then-loop pane close, zero and multiple new issues, unknown gate, recovery reuse without a second draft, interrupted provisioning, and explicit-queue precedence (FR9)
- README's live-smoke section and CHANGELOG `[Unreleased]` describe unattended provisioning
- `npm test -- --runInBand` in `scripts/` exits 0

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #444 | 2026-09-26 | Initial defect tasks |
| #444 | 2026-09-26 | Added smoke-gate self-provisioning tasks T005–T007 |
