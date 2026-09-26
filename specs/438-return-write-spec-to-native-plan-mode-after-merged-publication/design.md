# Root Cause Analysis: Return write-spec to native plan mode after merged publication

**Issue**: #438
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/400-restore-per-spec-plan-approval-and-ci-gated-merge-waiting/

---

## Root Cause

`src/extension.ts` handles the authoritative merge `tool_result` with `pi.sendUserMessage("/plan\n\n…", { deliverAs: "followUp" })`. OMP's `AgentSession.sendUserMessage` queues follow-up text as a user prompt; only the TUI input controller dispatches builtin slash commands such as `/plan` (`handlePlanModeCommand`). The queued text therefore never enters native plan mode.

### Affected Code

| File | Lines / Symbol | Role |
|------|----------------|------|
| `src/extension.ts` | `tool_result` handler | Queues the non-dispatching follow-up |
| `src/sdlc-commands.mjs` | `writeSpecPlanReentry`, `rewriteInteractiveInput` | Parses the merge result and renders interactive prompts |
| `workflows/write-spec/WORKFLOW.md` | Initial issue selection, Approval Behavior | Describes the queued follow-up |
| `workflows/write-spec/references/publish.md` | helper result, Continue | Describes the queued follow-up |
| `references/interactive-gates.md` | Plan-mode entry | Describes the queued follow-up |

---

## Fix Strategy

### Approach

`writeSpecPlanReentry` keeps its exact materialized command and sole-JSON validation but returns `{ issue, slug, pr }`. `renderWriteSpecContinuation(root, projectRoot, published)` shares the initial rewrite's registry rendering, controller-path materialization, and provenance, prefixing a `Post-publication continuation.` header with every published number and `N-slug`.

The extension records publications for its TUI process on `tool_result` (plan approval's "Approve and execute" clears into a new session, so the list cannot be keyed by session id; each new `/sdlc-write-spec` invocation resets it) and dispatches on the first terminal `agent_end`, after post-merge remediation. It requires `hasUI`, an empty editor, and `pi.pi.CustomEditor`; captures the focused editor via `ui.setEditorComponent` returning the same instance (OMP reattaches it and rewires its submit handler); sets the editor text; and calls `submit()` once. The TUI input controller then dispatches builtin `/plan` and submits the continuation as the first plan-mode prompt. When the session is already in plan mode only the continuation is submitted.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `src/sdlc-commands.mjs` | Return slug; add `renderWriteSpecContinuation`; share workflow rendering | One prompt-rendering path |
| `src/extension.ts` | Record on `tool_result`; submit through the focused editor on terminal `agent_end` | Real `/plan` dispatch through public extension UI |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md` | Describe post-turn editor submission and continuation entry | Keep contracts accurate |

### Blast Radius

- **Direct impact**: write-spec continuation after merged publication.
- **Indirect impact**: initial interactive rewrite shares the refactored renderer.
- **Risk level**: Low. Dispatch is gated on validated merge evidence, terminal turn end, UI presence, editor focus, and an empty draft.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Continuation lost when the editor is busy | Low | Keep pending and notify; retry on the next terminal turn end |
| Active plan toggled off | Low | Omit `/plan` when the last mode entry is `plan` |
| Duplicate submissions | Low | Deduplicate by tool call and issue; clear pending before submit |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns
