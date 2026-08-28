# Defect Report: Repair obsolete steering manifests during project upgrades

**Issue**: #314
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Reproduction

1. Initialize a consumer project with an earlier nmg-sdlc release that writes `byteBound` on records in `steering/manifest.json`.
2. Install nmg-sdlc 3.18.9 or newer.
3. Ensure no legacy `steering/product.md`, `steering/tech.md`, or `steering/structure.md` files remain.
4. Run `/sdlc-upgrade-project` and observe that it reports no steering-runtime repair.
5. Run `/sdlc-write-spec #N` and observe `project_runtime_invalid`; direct runtime validation reports `steering_manifest_unknown_key`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Upgrade detection reports an approval-gated repair that removes only obsolete `byteBound` fields from current-layout snippet records. Applying the unchanged plan preserves every canonical registration and project-owned file, after which interactive workflows load normally. |
| **Actual** | `detectSteeringRuntime` returns early whenever a manifest exists and no legacy Markdown exists. The obsolete field remains, strict runtime loading rejects it, and users have no supported repair path. |

## Acceptance Criteria

### AC1: Upgrade Detects the Obsolete Current-Layout Manifest

**Given** an initialized project has `steering/manifest.json`, no legacy steering Markdown, and one or more snippet records containing `byteBound`
**When** `/sdlc-upgrade-project` performs read-only detection
**Then** it reports one actionable managed steering-runtime repair
**And** detection does not mutate any project file

### AC2: Approved Repair Removes Only the Known Obsolete Field

**Given** the user approves the detected repair without changing its source tree
**When** `/sdlc-upgrade-project` applies the repair
**Then** `byteBound` is absent from every snippet record
**And** snippet identities, paths, consumers, slots, ordering, bodies, managed files, modules, extensions, validations, and unrelated project files are preserved
**And** a changed source digest fails with `steering_plan_stale` before mutation

### AC3: Interactive Workflows Recover After Repair

**Given** the obsolete current-layout manifest has been repaired through `/sdlc-upgrade-project`
**When** project prompt fragments are loaded for `/sdlc-write-spec #N`
**Then** loading succeeds without `project_runtime_invalid` or `steering_manifest_unknown_key`

### AC4: Installation Guidance Requires Project Upgrade

**Given** a user installs or updates nmg-sdlc
**When** the user follows the README installation guidance
**Then** the README directs them to run `/sdlc-upgrade-project` after every install or update
**And** it directs them to review and apply relevant approved migrations before other SDLC workflows

### AC5: Strict Runtime and Unknown-Key Rejection Remain Fail Closed

**Given** a manifest still contains `byteBound`, or contains `byteBound` plus another unknown snippet field
**When** ordinary runtime loading or upgrade detection validates it
**Then** ordinary runtime loading still rejects unknown fields
**And** upgrade detection does not offer or apply a partial repair for the additional unknown field
**And** no silent compatibility alias or command-time mutation is introduced

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Inspect current-layout steering manifests during upgrade detection instead of treating every present manifest with no legacy Markdown as current. | Must |
| FR2 | Recognize `byteBound` as the only repairable obsolete snippet field and produce a deterministic manifest-only update plan bound to the complete steering source digest. | Must |
| FR3 | Preserve all canonical manifest registrations and project-owned content; remove no field except `byteBound`. | Must |
| FR4 | Reuse the staged `applySteeringRuntime` / `sdlc-steering apply` boundary so candidate runtime validation and stale-plan rejection occur before live mutation. | Must |
| FR5 | Keep ordinary runtime validation strict and fail closed when any unrecognized field accompanies `byteBound`. | Must |
| FR6 | Document `/sdlc-upgrade-project` as required after every plugin install or update and before other workflows when migrations apply. | Must |

## Out of Scope

- Restoring runtime acceptance of `byteBound` or any other unknown snippet field.
- Silently rewriting manifests while `/sdlc-write-spec` or another ordinary workflow starts.
- Combining this repair with legacy steering Markdown migration.
- Reformatting or rewriting project-owned snippet bodies and unrelated files.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #314 | 2026-08-28 | Initial defect report |
