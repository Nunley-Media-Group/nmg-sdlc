# Defect Report: Exit native plan mode when write-spec Finished is selected

**Issue**: #444
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

---

## Reproduction

1. In an Oh My Pi TUI session with nmg-sdlc loaded, run `/sdlc-write-spec #N` for an open issue without an approved spec, approve the proposal, and let the spec publish and merge.
2. The extension submits the post-publication continuation into native plan mode and the Continue picker appears.
3. Select `Finished — stop writing specs`.
4. Alternatively, run bare `/sdlc-write-spec` with at least one open issue missing `spec-created` and select `Finished — stop without writing a spec`.
5. Separately, on a plain shell without `NMG_SDLC_SMOKE_ISSUES`, run `/sdlc-execute #N` for any nmg-sdlc issue. Verification fails the required `repository.nmg-sdlc-smoke` gate with `nmg-sdlc-smoke issues config invalid`, and execute stops as `implementation_failed` even though the implementation is correct.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The Finished output (none for the initial picker) is printed and the turn ends; the session then leaves native plan mode completely — session mode `none`, normal tools restored, no plan or plan-paused status — without the user typing a command. |
| **Actual** | The Finished output is printed but the session stays in native plan mode; the agent cannot end its turn and keeps re-asking until the user exits plan mode manually. |
| **Expected (smoke gate)** | With no explicit queue, the steering smoke provider provisions one fresh smoke issue with an Approved spec itself — through the real `/sdlc-draft-issue` and `/sdlc-write-spec` workflows in a provider-owned Herdr OMP pane, answering every gate automatically — then delivers it. No operator selection or environment setup is ever needed. |
| **Actual (smoke gate)** | The provider only reads `NMG_SDLC_SMOKE_ISSUES`; when unset it fails closed, so every unattended `/sdlc-execute` of nmg-sdlc fails verification. |

## Acceptance Criteria

### AC1: Continue-loop Finished exits plan mode fully

**Given** a TUI write-spec session in native plan mode at the post-publication Continue loop with at least one published spec
**When** the user selects `Finished — stop writing specs`
**Then** the existing `Published specs: …` and `Next step: /sdlc-execute #<first-published>` lines are printed unchanged
**And** the turn ends without another `ask` or `xd://propose`
**And** after that turn ends terminally, the session's plan mode is fully disabled (last session mode entry `none`, no plan or plan-paused status) without the user typing any command
**And** the extension dispatches only builtin `/plan` commands, so the working tree remains on the repository default branch

### AC2: Initial-picker Finished exits plan mode fully

**Given** bare `/sdlc-write-spec` showing the initial picker in native plan mode
**When** the user selects `Finished — stop without writing a spec`
**Then** write-spec stops without Discovery and without printing `Published specs:` or `Next step:`
**And** the turn ends without another `ask` or `xd://propose`
**And** after that turn ends terminally, the session's plan mode is fully disabled without the user typing any command

### AC3: Non-Finished selections keep plan mode

**Given** either write-spec picker in native plan mode
**When** the user selects an issue row, `Continue — enter another issue number`, or a valid or invalid automatic Other entry
**Then** plan mode stays active, and the existing Discovery, Interview, re-ask, and `xd://propose` behavior is unchanged
**And** no plan-mode exit is dispatched

### AC4: Undispatchable exit fails safe

**Given** a Finished selection whose plan-mode exit cannot be dispatched because there is no UI, a non-empty editor draft, an unfocused editor, or a submit failure, or whose dispatched `/plan` leaves plan mode active (for example, the host's `Exit plan mode?` confirmation is declined)
**When** the terminal `agent_end` evaluates the exit
**Then** the extension preserves any editor draft and submits no partial command
**And** it shows the warning notification `NMG SDLC: write-spec finished, but plan mode is still active; /plan exits it.`
**And** a later terminal `agent_end` dispatches nothing for that Finished selection
**But Given** a non-terminal `agent_end` (`willContinue: true`) after a Finished selection
**Then** the extension dispatches nothing and waits for the terminal end

### AC5: Post-publication continuation is preserved

**Given** a merged write-spec publication in a TUI session
**When** the execution turn ends terminally
**Then** the extension still submits the Continue-loop continuation into native plan mode exactly once with every published `N-slug`
**And** a new `/sdlc-write-spec` invocation still resets the published list and any pending Finished exit

### AC6: Smoke gate self-provisions without an explicit queue

**Given** `repository.nmg-sdlc-smoke` runs with `NMG_SDLC_SMOKE_ISSUES` unset or empty, no `config.issues`, and a `config.provision.need` string
**When** the outer (non-nested) provider runs with valid Herdr, GitHub auth, and an allowlisted clone
**Then** it opens exactly one provider-owned Herdr pane running `omp` in a separate disposable clone of `Nunley-Media-Group/nmg-sdlc-smoke`, submits `/sdlc-draft-issue <need>`, and identifies exactly one newly created issue N
**And** it submits `/sdlc-write-spec N` (bare number) in that session and treats provisioning as complete only when issue N carries `spec-created` and a merged `docs: approve spec for #N` pull request exists
**And** it then runs the existing delivery smoke for queue `[N]` with unchanged baseline, receipt, exact-head merge, and closed-issue proof

### AC7: Every provisioning gate is answered automatically

**Given** the provisioning session raises a built-in `ask` (single or multi-question) or the native plan approval selector
**When** the provider observes the gate
**Then** it answers using only key presses: the Recommended option (index 0 when none is marked) for each ask question, then submit; `Approve and execute` for plan approval
**And** it never types free text, never selects automatic Other, and never selects an issue row other than the provisioned issue
**And** no operator interaction or environment variable is required at any point

### AC8: Provisioning completion is proven from GitHub, not the session

**Given** the write-spec session keeps asking or looping after publication
**When** issue N has `spec-created` and its spec PR is `MERGED`
**Then** the provider closes its owned pane without answering further prompts and proceeds to delivery

### AC9: Provisioning failures fail closed and never duplicate issues

**Given** provisioning cannot identify exactly one new issue, a gate is unrecognized, or the session settles without the completion evidence
**When** the provider detects it
**Then** the result is `failed` with the pane screen snapshot, session path, and any created issue URL as evidence, the owned pane is closed, and the provisioning clone is retained
**And** a retry of the same outer verification identity reuses the recorded provisioned issue instead of drafting another; an interrupted provisioning without a recorded issue fails closed until the verification identity changes
**And** Herdr launch, cancellation, or process loss is `incomplete`

### AC10: Explicit queues keep priority

**Given** `NMG_SDLC_SMOKE_ISSUES` holds a valid explicit queue, or `config.issues` is present
**When** the gate runs
**Then** no provisioning happens and the explicit queue behaves exactly as before; an invalid non-empty explicit value still fails `nmg-sdlc-smoke issues config invalid`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | In a write-spec session (started by `/sdlc-write-spec` or its post-publication continuation), detect an `ask` result that selected the exact label `Finished — stop writing specs` or `Finished — stop without writing a spec`, and after the next terminal `agent_end` dispatch builtin `/plan` through the focused TUI editor, one awaited toggle at a time, until the session mode is `none` (not `plan_paused`). | Must |
| FR2 | Both write-spec Finished branches end the turn after their existing output without calling `ask` or `xd://propose`; the write-spec workflow, publish reference, and interactive-surface reference describe the extension's plan-mode exit. | Must |
| FR3 | Keep Finished labels, the Finished summary text, non-Finished picker outcomes, and the post-publication continuation unchanged; a pending continuation takes precedence over a Finished exit in the same turn. | Must |
| FR4 | When the exit cannot be dispatched or leaves plan mode active, preserve the editor draft, submit nothing partial, show the warning notification once, and drop the pending exit. | Must |

| FR5 | Extend `steering/extensions/nmg-sdlc-smoke.mjs` so an absent/empty explicit queue plus `config.provision.need` provisions one fresh issue with an Approved spec through the real draft-issue and write-spec workflows in a provider-owned Herdr `omp` pane, driven only by key presses chosen from the session's pending gate. | Must |
| FR6 | Detect gates by polling (never a single indefinite `herdr agent wait`): pending `ask` from the session JSONL (last `ask` tool call without a result), plan approval from the `Plan mode - next step` screen marker while idle. Submit issue numbers bare, never `#N`. | Must |
| FR7 | Complete provisioning only on GitHub evidence (new issue N, `spec-created`, merged spec PR); always close the owned pane; persist the provisioned issue in the recovery store before delivery so retries never draft twice. | Must |
| FR8 | Apply the steering change through the shared steering writer (`scripts/sdlc-steering.mjs apply` with the current `sourceDigest`, then `validate`), registering `config.provision.need` in `steering/manifest.json` and updating the tech/product snippets so operators never provision smoke issues or set `NMG_SDLC_SMOKE_ISSUES`. | Must |
| FR9 | Deterministic regressions with faked Herdr/gh/JSONL for: provisioning success, Recommended/approve key sequences, publication-then-loop pane close, zero or multiple new issues, unknown gate, recovery reuse, explicit-queue precedence. | Must |
## Out of Scope

- Stop/exit behavior of other interactive commands (`/sdlc-draft-issue`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-run-retro`)
- Changing Finished option labels, the Continue-loop candidate list, or the `Published specs:` / `Next step:` wording
- Headless print/RPC write-spec behavior
- Suppressing or answering the host's builtin `Exit plan mode?` confirmation in the extension
- Reclassifying other missing-prerequisite gate failures in execute's verification routing

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #444 | 2026-09-26 | Initial defect report |
| #444 | 2026-09-26 | Added smoke-gate self-provisioning (AC6–AC10, FR5–FR9) |
