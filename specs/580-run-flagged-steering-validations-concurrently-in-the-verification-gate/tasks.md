# Tasks: Run flagged steering validations concurrently in the verification gate

**Issue**: #580
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Implementation Tasks

### T001: Accept and validate the concurrent key

**File(s)**: `src/sdlc-steering-runtime.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `concurrent` is in `OPTIONAL_VALIDATION_KEYS`. A boolean value loads and is kept on the validation.
- A non-boolean value fails with `steering_validation_invalid` naming `concurrent` (AC8, FR1).

### T002: Run flagged Phase 2 validations as one concurrent batch

**File(s)**: `src/sdlc-verification-runtime.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- At the first applicable flagged Phase 2 validation, all applicable `concurrent: true` Phase 2 validations start together through `execute` and are awaited with `Promise.all`. Unflagged validations run serially in manifest order (AC1, AC2, FR2, FR3).
- Every batch member records its own result even when another fails (AC3, FR4).
- `results` stay in manifest order (AC4, FR5).
- Heavy-slot acquisition, selection, Phase 1 deferral, and abort handling stay per validation (AC5–AC7, FR6).
- A manifest without `concurrent` keys takes the unchanged serial path.

### T003: Document the concurrent key

**File(s)**: `references/steering-schema.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- `concurrent` is listed among the optional `validations[]` keys and described next to `heavy` and `tier`, with the batch, serial, Phase 1, failure, heavy, and ordering rules (FR7).
- The edit is made after invoking the `skill-creator` skill with the `Skill` tool.

### T004: Add behavioral coverage

**File(s)**: `scripts/__tests__/sdlc-steering-runtime.test.mjs`, `scripts/__tests__/validation-tiers.test.mjs`, `scripts/__tests__/sdlc-heavy-pool.test.mjs`
**Type**: Modify
**Depends**: T002, T003
**Acceptance**:
- AC8: loading a manifest with `concurrent: "yes"` fails with `steering_validation_invalid` naming `concurrent`; `true` and `false` load.
- AC1: two flagged fake providers that record start and finish times both start before either finishes.
- AC2: unflagged validations never overlap another validation, and a manifest with no `concurrent` keys yields the same start order and artifact `results` as the serial baseline.
- AC3: when one flagged provider fails fast, the other completes and records `passed`, every applicable validation has a result, and the ceiling is non-passing.
- AC4: flagged providers that finish in reverse order produce `results` in manifest order, with `selection` and `heavy` fields as in a serial run.
- AC5: with an injected `acquireSlot` whose only slot is held, the heavy flagged validation's provider starts only after the slot is granted and records `heavy: { slot, waitedMs }`. The non-heavy flagged validation starts without waiting.
- AC6: after a failing required `builtin.command`, flagged project-provider validations record `incomplete` with "deferred until required local validations pass".
- AC7: aborting the signal while flagged validations run cancels each provider, releases each held slot, and records each unfinished validation as non-passing.
- `cd scripts && npm test` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #580 | 2026-11-19 | Initial feature tasks |
