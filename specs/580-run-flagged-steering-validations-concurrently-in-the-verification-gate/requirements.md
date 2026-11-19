# Requirements: Run flagged steering validations concurrently in the verification gate

**Issue**: #580
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## User Story

**As a** project maintainer whose verification gate runs several independent validations
**I want** to mark validations that may run at the same time
**So that** the gate finishes in roughly the time of its slowest validation instead of the sum of all of them

## Background

`runSteeringValidations` in `src/sdlc-verification-runtime.mjs` runs in two phases:

- Phase 1 runs required `builtin.command` validations one at a time and records whether they all passed.
- Phase 2 awaits `execute(validation, …)` for each remaining applicable validation in turn. Project-provider validations are deferred as `incomplete` when a Phase 1 validation failed.

`execute` already handles selection, the optional host-wide heavy-job slot (`heavy: true`, `acquireHeavySlot` in `src/heavy-pool.mjs`), provider invocation, and the `signal` abort. Results are emitted in manifest order from `resultById`.

`src/sdlc-steering-runtime.mjs` validates the optional validation keys (`OPTIONAL_VALIDATION_KEYS`), and `references/steering-schema.md` documents them. No key lets validations overlap.

## Acceptance Criteria

### AC1: Flagged validations run at the same time

**Given** a steering manifest with two applicable Phase 2 validations that both declare `concurrent: true`
**When** the verification gate runs
**Then** both providers start before either one finishes, and the gate's elapsed time is close to the longer of the two rather than their sum

### AC2: Unflagged validations keep today's serial behavior

**Given** a manifest where some applicable Phase 2 validations omit `concurrent` or set it to `false`
**When** the verification gate runs
**Then** each unflagged validation runs while no other validation is running, and a manifest with no `concurrent` keys produces the same execution order and artifact as before this change

### AC3: A failure does not stop the other concurrent validations

**Given** two concurrent validations where one provider fails quickly and the other is still running
**When** the gate runs
**Then** the still-running validation completes and records its own result, the artifact contains a result for every applicable validation, and the ceiling reflects the failure

### AC4: Results stay in manifest order

**Given** concurrent validations that finish in a different order from the manifest
**When** the verification artifact is written
**Then** its `results` array lists validations in manifest order, with the same fields as a serial run, including `selection` and `heavy` when present

### AC5: Heavy validations still take a pool slot

**Given** a validation with both `heavy: true` and `concurrent: true` and a heavy-job pool whose only slot is held
**When** the gate runs
**Then** that validation waits for a slot before its provider starts and records `heavy: { slot, waitedMs }`, while other concurrent validations that are not heavy start without waiting

### AC6: The Phase 1 deferral rule is unchanged

**Given** a required local `builtin.command` validation that fails in Phase 1
**When** Phase 2 runs concurrent project-provider validations
**Then** those validations are recorded as `incomplete` with "deferred until required local validations pass", exactly as unflagged ones are

### AC7: Cancelling the gate stops every running validation

**Given** several concurrent validations in progress
**When** the gate's abort signal fires
**Then** every running provider is cancelled, every held heavy slot is released, and each unfinished validation is recorded as non-passing

### AC8: An invalid flag is rejected

**Given** a manifest validation whose `concurrent` value is not a boolean
**When** the steering runtime loads the manifest
**Then** loading fails with `steering_validation_invalid` naming `concurrent`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Accept an optional boolean `concurrent` key on `validations[]` and reject non-boolean values with `steering_validation_invalid` | Must |
| FR2 | In Phase 2, start all applicable `concurrent: true` validations together and wait for all of them to settle | Must |
| FR3 | Run validations without `concurrent: true` one at a time, never overlapping another validation | Must |
| FR4 | Let every concurrent validation run to completion when another fails, and record every result | Must |
| FR5 | Emit artifact `results` in manifest order regardless of completion order | Must |
| FR6 | Keep heavy-slot acquisition, selection, Phase 1 deferral, and abort handling per validation when running concurrently | Must |
| FR7 | Document `concurrent` in `references/steering-schema.md` next to `heavy` and `tier` | Must |

## Out of Scope

- Running Phase 1 required `builtin.command` validations concurrently
- Cancelling the remaining validations as soon as one fails
- A project-wide or concurrent-by-default setting, or a cap on how many validations run at once
- Changing the heavy-job pool size or its locking

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #580 | 2026-11-19 | Initial feature spec |
