# Root Cause Analysis: Write-spec stops silently after a spec merge that outlasts the Bash timeout

**Issue**: #489
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

## Root Cause

`publish-approved-spec.mjs merge` waits for the spec PR in `awaitPublicationReady`, polling every 5 s with no upper bound. The workflow runs it as a plain `Bash` call with the default 120 s timeout, so a PR whose checks take longer is moved to the background and the tool result carries empty `stdout`, a `backgroundTaskId`, and `timedOutAfterMs`.

The `Bash` `tool.call` handler in `hooks/register.ts` classifies a publication only from that call's own stdout through `writeSpecPublication` in `src/host-events.mjs`, which first requires `writeSpecMergeCommand` to match one exact materialized command form and then takes `issue`/`slug` from the command text because the helper's JSON carries no `issue` or `dir`. With empty stdout it returns `null`. When the background task finishes, the model reads the output with a separate `cat …/tasks/<id>.output` `Bash` call (or a `Read`); that call is not a merge command, so it is not recognized either. `writeSpec.pending` stays false, and the `turn.complete` handler neither runs `/plan` nor submits the continuation, nor shows a toast.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/publish-approved-spec.mjs` | `mergeSpec` `ok` / `fail` results | Merged results omit `issue` and `dir` |
| `src/host-events.mjs` | `writeSpecMergeCommand`, `writeSpecPublication` | Exact-text command match; identity from command text only |
| `src/host-events.d.mts` | declarations for the above | Type surface for the hooks module |
| `src/sdlc-commands.mjs` | re-exports | Re-exports the host-events helpers |
| `hooks/register.ts` | `Bash` / `Read` `tool.call`, `submitContinuation`, `PENDING_CONTINUATION_NOTICE` | Recognition only from the merge call's own stdout; static toast |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md` | Approval Behavior step 4, Helper contract | Claim decoration-sensitive recognition; no backgrounded-merge guidance |

## Fix Strategy

1. **Helper result identity.** In `mergeSpec`, add `issue: issueN` and `dir` to the success `ok(...)` result and to the post-merge `default_checkout_failed` and `spec_created_label_failed` failures (the results that carry `merged: true`).
2. **Result-based recognition** in `src/host-events.mjs`:
   - `writeSpecMergeIssue(command)` → the positive `--issue` number when the command text invokes `publish-approved-spec.mjs` (optionally followed by a closing quote) then whitespace and the `merge` subcommand, and carries `--issue N` (optionally quoted); otherwise `null`. It does not depend on root spelling, quoting, trailing slash, or surrounding text.
   - `writeSpecMergeResult(text)` → `{ issue, slug, pr }` when `soleJsonObject(text)` has `merged: true`, a positive safe-integer `pr` and `issue`, and `dir` matching `^specs/([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$` whose number equals `issue`; otherwise `null`.
   - `writeSpecPublication({ toolUseId, command, stdout })` → requires a non-empty `toolUseId`, `writeSpecMergeIssue(command)`, and `writeSpecMergeResult(stdout)` with the same issue. The `root` parameter and `writeSpecMergeCommand` are removed (update `src/host-events.d.mts` and the `src/sdlc-commands.mjs` re-export).
3. **Hooks module** (`hooks/register.ts`):
   - Add `backgrounded: Set<number>` to `writeSpec`; reset it with `published` in `startInteractiveCommand`.
   - `Bash` `tool.call`: after the call, record `writeSpecPublication(...)` when it matches. Otherwise, when the command is a merge and `ran.result?.backgroundTaskId` is set, add its issue to `writeSpec.backgrounded`. Otherwise, when `backgrounded` is non-empty, record `writeSpecMergeResult(stdout)` if its issue is in `backgrounded`, then remove it.
   - `Read` `tool.call`: after `next`, when `backgrounded` is non-empty and the result is `type: "text"`, apply the same `writeSpecMergeResult(ran.result.file.content)` check.
   - One `recordPublication({ issue, slug })` helper keeps the existing per-`tool_use_id` and per-issue dedup and sets `pending`.
   - Replace the static `PENDING_CONTINUATION_NOTICE` with `pendingContinuationNotice(published)`: `NMG SDLC: write-spec published #A, #B; the Continue picker opens in plan mode after the next turn that ends with an empty prompt box.`
   - `submitContinuation`: wrap `$.prompt.read`, render, and `submitInPlanMode` (including `$.prompt.submit`) so any thrown host failure keeps `pending` true and shows the notice.
4. **Workflow text** (edited through the `skill-creator` skill): in `workflows/write-spec/WORKFLOW.md` Approval Behavior step 4 and the `references/publish.md` Helper contract and Merge sections, keep "run verbatim" and replace the claim that decoration prevents recognition. Step 4 runs `merge` as the whole `Bash` command with `run_in_background: true`. It waits for the task's completion notification without a timeout, polling, or stall rule, because CI always ends in success or failure and the helper exits on either. It then reads the complete output (the task's output file) and applies the existing success, post-merge-failure, and pre-merge-failure handling. The hooks module recognizes the publication from the helper's JSON `issue`/`dir` once that output is read. Document `issue` and `dir` in the merge result.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/publish-approved-spec.mjs` | Add `issue`, `dir` to merged results | AC2, FR1 |
| `src/host-events.mjs` | `writeSpecMergeIssue`, `writeSpecMergeResult`; result-based `writeSpecPublication`; drop `writeSpecMergeCommand` | AC1, AC5, FR2 |
| `src/host-events.d.mts`, `src/sdlc-commands.mjs` | Matching declarations and re-exports | FR2 |
| `hooks/register.ts` | Backgrounded tracking, `Read` recognition, issue-naming toast, guarded continuation | AC3, AC4, AC7, AC8, FR3–FR5 |
| `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md` | Background merge with completion wait; `issue`/`dir` result fields | AC9, FR6 |
| `hooks/register.test.ts`, `scripts/__tests__/sdlc-commands.test.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs` | Regression coverage | FR7 |

## Blast Radius

`writeSpecPublication`'s signature changes (no `root`); its only callers are `hooks/register.ts` and the tests. `writeSpecMergeCommand` is used only by `src/sdlc-commands.mjs` re-export and tests. Additional JSON fields from `merge` are additive for the workflow and existing helper tests. Finished, autopilot, plugin-root materialization, and model-override handlers are unchanged. Running `merge` in the background changes only how the model waits; the helper's readiness, merge, and failure semantics are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Run `merge` in the background, wait for completion, recognize from the helper JSON result | Selected | No `Bash` timeout applies to a background task; CI always ends in success or failure; works for any command spelling; no new runtime files |
| Raise the foreground merge `Bash` timeout to 600 s | Rejected | Readiness polling is unbounded; a merge past 600 s still backgrounds |
| Add a stall/stuck exit to the helper or a model-side watch | Rejected | CI always reports success or failure and the helper already exits on each; a stall rule would fail slow-but-healthy CI |
| Helper writes its result to a `.nmg-sdlc/` file the hook reads at turn end | Rejected | Stale-file and untracked-file risks in projects that do not ignore `.nmg-sdlc/`, and a second result channel |
| Add an upper bound to `awaitPublicationReady` | Rejected | Would turn slow-but-healthy CI into a publication failure |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #489 | 2026-10-24 | Initial defect design |
