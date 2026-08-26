# Tasks: Remove project snippet byte bounds

**Issue**: #271
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## T001: Normalize unbounded project snippets

**File(s)**: `src/sdlc-steering-runtime.mjs`
**Type**: Modify
**Depends**: none

**Acceptance**:

- Require only `id`, `path`, `consumers`, `slot`, and `order` for project snippets.
- Accept and ignore an optional legacy `byteBound` while rejecting other unknown keys.
- Store and emit project snippet records without `byteBound`.
- Preserve existing validation for required fields, consumers, slots, and order.

**Covers**: AC2, AC3

## T002: Make registry bounds optional

**File(s)**: `src/sdlc-prompt-snippets.mjs`
**Type**: Modify
**Depends**: T001

**Acceptance**:

- Allow fragments without `byteBound`.
- Validate and enforce `byteBound` only when present.
- Preserve plugin catalog bounds, worker-header bounds, and provenance byte counts.
- Keep explicit exceeded plugin bounds failing with `byte_bound_exceeded`.

**Covers**: AC1, AC3, AC4

## T003: Remove project bound writes

**File(s)**: `scripts/sdlc-steering.mjs`, `scripts/sdlc-upgrade.mjs`, `steering/manifest.json`, `references/steering-schema.md`
**Type**: Modify
**Depends**: T001, T002

**Acceptance**:

- Omit `byteBound` from initialize and migrate manifest records.
- Remove all project snippet bounds from this repository manifest.
- Document unbounded project fragments, ignored legacy bounds, and retained plugin catalog bounds.
- Do not change snippet bodies or workflow files.

**Covers**: AC2, AC5

## T004: Add project-unbounded regression coverage

**File(s)**: `scripts/__tests__/sdlc-steering-runtime.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003

**Acceptance**:

- Prove initialize and migrate outputs contain no project snippet bounds.
- Prove a legacy `byteBound: 1` is ignored and larger project content renders.
- Prove a project fragment larger than 8192 bytes registers without a bound.
- Prove this checkout builds `worker:start` while builtin explicit bounds remain enforced.

**Covers**: AC1, AC2, AC3, AC4, AC5
