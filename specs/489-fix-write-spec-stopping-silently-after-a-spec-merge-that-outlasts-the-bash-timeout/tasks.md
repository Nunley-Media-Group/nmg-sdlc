# Tasks: Write-spec stops silently after a spec merge that outlasts the Bash timeout

**Issue**: #489
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/438-return-write-spec-to-native-plan-mode-after-merged-publication/

## Implementation Tasks

### T001: Report issue and directory in merged helper results

**File(s)**: `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC2/FR1: `merge` success and the post-merge `default_checkout_failed` and `spec_created_label_failed` results include `issue: N` and `dir: "specs/N-slug"` alongside existing fields.
- Pre-merge failures (`pr_create_failed`, `pr_merge_failed`, `spec_not_approved`) are unchanged and still omit `merged: true`.

### T002: Recognize publications from the helper result

**File(s)**: `src/host-events.mjs`, `src/host-events.d.mts`, `src/sdlc-commands.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC1/FR2: `writeSpecMergeIssue(command)` returns the `--issue` number for any command invoking `publish-approved-spec.mjs merge` regardless of root spelling, quoting, trailing slash, or surrounding text, else `null`.
- AC1/AC5/FR2: `writeSpecMergeResult(text)` returns `{ issue, slug, pr }` only for a sole JSON object with `merged: true`, positive `pr` and `issue`, and a `dir` whose leading number equals `issue`.
- AC1/AC5: `writeSpecPublication({ toolUseId, command, stdout })` requires a non-empty `toolUseId` and matching command and result issues; `writeSpecMergeCommand` and the `root` parameter are removed from source, declarations, and re-exports.

### T003: Track backgrounded merges and harden the continuation in the hooks module

**File(s)**: `hooks/register.ts`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- AC8/FR3: a merge result with `backgroundTaskId` (from `run_in_background: true` or the timeout) is remembered; a later `Bash` stdout or `Read` text content carrying that issue's sole merged JSON records the publication once and clears it.
- AC1/AC5: publications are recorded only through the result-based helpers, once per `tool_use_id` and per issue.
- AC4/FR4: the pending toast names every published issue number and says the Continue picker opens after the next turn that ends with an empty prompt box; a non-empty prompt box, headless session, render failure, `/plan` failure, or thrown host call keeps the continuation pending.
- AC3/AC6/AC7/FR5: continuation submission, Finished approval, and autopilot behavior otherwise match the current handlers.

### T004: Document backgrounded-merge handling in the write-spec workflow

**File(s)**: `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `scripts/__tests__/sdlc-commands.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC9/FR6: Approval Behavior step 4 and the Helper contract require running `merge` verbatim as the whole `Bash` command with `run_in_background: true`, waiting for its completion notification with no timeout, polling, or stall rule, reading the complete output, and then applying the existing result handling; they state that the hooks module recognizes the publication from the result's `issue`/`dir`.
- AC9: `scripts/__tests__/sdlc-commands.test.mjs` asserts the rendered write-spec workflow contains the `run_in_background: true` merge instruction and the completion-wait instruction.
- AC2: the Helper contract documents `issue` and `dir` in merged results.
- The edit is made after invoking the `skill-creator` skill with the `Skill` tool; `node scripts/skill-inventory-audit.mjs --check` and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0.

### T005: Add helper and recognition regression coverage

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- AC2: the merge success, `default_checkout_failed`, and `spec_created_label_failed` fixture results contain `issue` and `dir`.
- AC1: `writeSpecPublication` accepts the verbatim command, a trailing-slash root, single-quoted and unquoted helper paths, an unmaterialized `<plugin-root>` path, and a chained command whose sole JSON result is valid.
- AC5: it rejects an unrelated command, missing `merged: true`, several JSON objects, malformed JSON, non-positive `pr`, a `dir`/`issue` mismatch, a command/result issue mismatch, and an empty `toolUseId`.
- `cd scripts && npm test` exits 0.

### T006: Add hooks-module regression coverage

**File(s)**: `hooks/register.test.ts`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- AC1/AC3: a merged result with `issue`/`dir` from a differently quoted merge command submits one `/plan` + continuation prompt after the main turn ends.
- AC8: a `run_in_background: true` merge result with `backgroundTaskId` and empty stdout, and separately a timeout-moved result with `timedOutAfterMs: 120000`, records nothing; a later `cat` `Bash` call (and, in another case, a `Read`) returning the merged JSON records the issue once and the next empty turn end submits the continuation.
- AC5: an unrelated `Bash` result carrying merged JSON with no outstanding backgrounded merge, and a backgrounded merge followed by JSON for a different issue, schedule nothing.
- AC4: a non-empty prompt box and a render failure each keep the continuation pending with a toast naming the published issue numbers, and a later empty turn end submits it.
- AC7: two successive publications each submit a continuation listing every published issue; after a Finished answer no continuation follows.
- AC6: existing Finished, explicit-number, and autopilot tests still pass; `claude plugin test .` reports 0 failures.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #489 | 2026-10-24 | Initial defect tasks |
