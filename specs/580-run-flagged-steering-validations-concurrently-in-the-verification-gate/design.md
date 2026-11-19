# Design: Run flagged steering validations concurrently in the verification gate

**Issue**: #580
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Overview

A new optional boolean `concurrent` key lets Phase 2 of `runSteeringValidations` start the flagged validations together. Each still runs through the existing `execute` closure, so selection, the heavy-job slot, deferral, provider invocation, abort, and error capture are unchanged per validation. Unflagged validations stay serial. The artifact is assembled from `resultById` in manifest order, as today.

## Architecture

**Key validation (`src/sdlc-steering-runtime.mjs`)**

- Add `"concurrent"` to `OPTIONAL_VALIDATION_KEYS`.
- Beside the `heavy` check, add `if (Object.hasOwn(record, "concurrent") && typeof record.concurrent !== "boolean") fail("steering_validation_invalid", "concurrent")`.
- The loaded validation keeps `concurrent` when present.

**Phase 2 scheduling (`src/sdlc-verification-runtime.mjs`)**

- Phase 1 is unchanged.
- Phase 2 computes `pending`: the validations without a `resultById` entry, in manifest order. `deferred(validation)` is `!String(validation.provider).startsWith("builtin.") && !localRequiredCommandsPassed`, as today.
- `batch` is the subset of `pending` with `validation.concurrent === true`.
- Phase 2 then walks `pending` in manifest order:
  - **Unflagged validation:** `resultById.set(validation.id, await execute(validation, deferred(validation)))`.
  - **First flagged validation:** start every member of `batch` together.
    1. Map each member to `execute(validation, deferred(validation)).then((entry) => resultById.set(validation.id, entry))`.
    2. Await `Promise.all` of those promises.
    3. Mark the batch run.
  - **Later flagged validations:** skip them; they ran with the batch.
- `execute` catches every provider and slot error and returns an entry, so one member's failure cannot reject `Promise.all`. Every member settles and records its own result (AC3, FR4).
- `results` stays `runtime.validations.map((v) => resultById.get(v.id)).filter(Boolean)`, so order is manifest order regardless of completion order (AC4, FR5).
- Each member's `execute` still calls `acquireSlot` when `heavy: true` and releases it in `finally`. It still uses `resolveSelection`, and still receives the shared `signal` through `providerRequest` and `acquireSlot` (AC5, AC7, FR6).
- On abort, each running provider sees the same signal. Its `execute` records `incomplete` (non-passing) from the thrown or aborted result and releases its slot.
- A deferred member returns its `incomplete` "deferred until required local validations pass" entry without starting a provider (AC6).
- With no flagged validation, the walk is the existing serial loop: same order, same entries, same artifact (AC2).

**Documentation (`references/steering-schema.md`)**

- The `validations[]` line lists `concurrent` among the optional keys.
- A `concurrent` entry next to `heavy` and `tier` explains the following:
  - Phase 2 starts all applicable `concurrent: true` validations together.
  - Unflagged validations never overlap another validation.
  - Phase 1 required `builtin.command` validations stay serial.
  - A failure does not cancel the others.
  - `heavy: true` still takes a pool slot.
  - Results remain in manifest order.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `steering/manifest.json` `validations[].concurrent` | optional boolean | non-boolean → `steering_validation_invalid` (`concurrent`) | `true` joins the Phase 2 concurrent batch |
| `runSteeringValidations` | unchanged | unchanged artifact shape | Phase 2 batch scheduling as above |

## Data / Storage Changes

None. The verification artifact's shape and field set are unchanged, and `concurrent` is not recorded in results.

## State and UI Behavior

None.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Cancel the remaining validations on the first failure | Rejected | Out of scope; AC3 requires every result |
| Run the batch at the end of Phase 2 | Rejected | Starting it at its first manifest position keeps the order closest to the manifest |
| Batch the flagged validations through the existing `execute` with `Promise.all` | Selected | It reuses every per-validation behavior and leaves unflagged runs unchanged |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #580 | 2026-11-19 | Initial feature design |
