# Design: Remove project snippet byte bounds

**Issue**: #271
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## Overview

Remove size caps from project-owned steering snippets while retaining byte-bound enforcement for plugin and builtin catalog fragments. The steering runtime accepts legacy project-manifest `byteBound` fields but discards them, ensuring project fragments reach the registry without a bound. New initialize and migrate writes omit the field.

Unknown manifest keys and all existing consumers, slots, order, and non-empty-content validation remain fail closed.

## Runtime Flow

```text
steering/manifest.json
  → loadSteeringRuntime accepts required project snippet fields
  → optional legacy byteBound is ignored
  → projectPromptFragments emits no byteBound
  → defaultPromptRegistry registers unbounded project fragments
  → renderPrompt composes the requested consumer
```

Plugin and builtin fragments continue through the same registry with explicit catalog `byteBound` values, which remain validated and enforced.

## Changes

### `src/sdlc-steering-runtime.mjs`

Require `id`, `path`, `consumers`, `slot`, and `order`. Permit an optional leftover `byteBound` key without validating its type or value, reject every other unknown key, and freeze normalized snippet records without `byteBound`. Emit project prompt fragments without `byteBound`. Empty snippet arrays and existing consumer, slot, and order validation remain unchanged.

### `src/sdlc-prompt-snippets.mjs`

Keep `byteBound` as an allowed fragment key but make it optional. Validate it as a positive integer only when present. Registration and rendering enforce the UTF-8 bound only when it is an integer. Keep catalog tuples, plugin fragments, the 512-byte worker header bound, and measured provenance `byteCount` unchanged.

### `scripts/sdlc-steering.mjs` and `scripts/sdlc-upgrade.mjs`

Initialize plans strip both transient `content` and `byteBound` before writing snippet records. Upgrade detection stops synthesizing a bound while retaining snippet content for staged writes. New and migrated manifests therefore contain only the project snippet schema fields.

### `steering/manifest.json` and `references/steering-schema.md`

Remove `byteBound` from all three repository snippet registrations without changing paths, consumers, slots, order, or snippet bodies. Document the unbounded project-fragment contract, compatibility handling for leftover bounds, and continued plugin-catalog enforcement.

### Regression coverage

Prove initialize and migrate outputs omit bounds, runtime normalization strips legacy bounds, project registration and rendering accept bodies beyond the former cap, this checkout can build `worker:start`, and builtin fragments still reject exceeded explicit bounds.

## Failure Behavior

Unknown project snippet keys still fail with `steering_manifest_unknown_key`. Invalid required fields, consumers, slots, and order still fail with `steering_manifest_invalid`. Explicit plugin or builtin bounds remain positive integers and still fail with `byte_bound_exceeded` when exceeded. Project snippets have no size-bound failure path.

## Verification

- Focused Jest coverage for steering runtime, prompt registry, upgrade behavior, and rendered prompt bytes.
- Manifest assertion proving repository snippet records omit `byteBound`.
- Direct `workerPrompt` smoke proving `worker:start` succeeds against this checkout and reports a positive UTF-8 byte count.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #271 | 2026-08-26 | Initial bug-fix design |
