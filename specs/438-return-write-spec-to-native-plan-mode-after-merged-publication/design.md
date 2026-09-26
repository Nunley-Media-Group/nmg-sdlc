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
| `steering/extensions/nmg-sdlc-smoke.mjs` | failed-state recovery in `createSmokeProvider` | Only re-verifies a queue that fully delivered; a mid-queue stop is permanent at that head |
| `scripts/sdlc-execute.mjs` | `runExecute` pre-loop active-branch checks | Refuse to continue a queue from the first queued issue's branch or past a delivered branch |

---

## Fix Strategy

### Approach

`writeSpecPlanReentry` keeps its exact materialized command and sole-JSON validation but returns `{ issue, slug, pr }`. `renderWriteSpecContinuation(root, projectRoot, published)` shares the initial rewrite's registry rendering, controller-path materialization, and provenance, prefixing a `Post-publication continuation.` header with every published number and `N-slug`.

The extension records publications for its TUI process on `tool_result` (plan approval's "Approve and execute" clears into a new session, so the list cannot be keyed by session id; each new `/sdlc-write-spec` invocation resets it) and dispatches on the first terminal `agent_end`, after post-merge remediation. It requires `hasUI`, an empty editor, and `pi.pi.CustomEditor`; captures the focused editor via `ui.setEditorComponent` returning the same instance (OMP reattaches it and rewires its submit handler); sets the editor text; and calls `submit()` once. The TUI input controller then dispatches builtin `/plan` and submits the continuation as the first plan-mode prompt. When the session is already in plan mode only the continuation is submitted.

The registered smoke gate at `4634e17` delivered #170 and then stopped on a transient `dependency_unreadable` for #171. The provider's failed-state branch only re-verifies receipts for every configured issue and never re-runs execute, so the gate could not pass at that head. The provider now accepts a non-empty leading prefix of invocation-bound receipts, revalidates them as before, and runs `sdlc-execute run` for only the remainder in the retained clone with the same `NMG_SDLC_SMOKE_RECOVERY` token. It then requires consistent receipts for the whole queue before the unchanged remote proof. Execute shares a `leaveDeliveredBranch` helper between its pre-loop and per-issue checks and no longer refuses a multi-issue queue that starts on the first queued issue's branch.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `src/sdlc-commands.mjs` | Return slug; add `renderWriteSpecContinuation`; share workflow rendering | One prompt-rendering path |
| `src/extension.ts` | Record on `tool_result`; submit through the focused editor on terminal `agent_end` | Real `/plan` dispatch through public extension UI |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/interactive-gates.md` | Describe post-turn editor submission and continuation entry | Keep contracts accurate |

| `steering/extensions/nmg-sdlc-smoke.mjs` | Resume the undelivered remainder of a partially delivered queue | Let the registered gate finish after a mid-queue stop |
| `scripts/sdlc-execute.mjs` | Share delivered-branch exit; allow a queue to start on its first issue's branch | Let the resumed controller continue from the retained clone |

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
