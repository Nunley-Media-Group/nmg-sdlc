# Root Cause Analysis: First-run delivery blocked by missing CHANGELOG.md and push-event checks

**Issue**: #484
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Root Cause

1. `workflows/onboard-project/WORKFLOW.md` ("Initialize VERSION (0.1.0 or from manifest), create specs/ empty") and `workflows/onboard-project/references/greenfield.md` ("Init VERSION + specs/") initialize `VERSION` only. Brownfield reuses the greenfield bootstrap. Nothing creates `CHANGELOG.md`, but `prepare-version` requires it with a `## [Unreleased]` section.
2. `synchronizeVersion` in `scripts/sdlc-deliver.mjs` reads `VERSION` and `CHANGELOG.md` with `fs.readFileSync` without checking that they exist. `updateChangelog` throws a plain `Error('CHANGELOG.md lacks [Unreleased]')` that carries no `reasonCode`. The `prepare-version` branch of `runDeliverUnlocked` maps only `major_bump_required` to a specific handoff and rethrows everything else. The outer catch then labels the error `delivery_failed`.
3. `prepareVersion` in `scripts/sdlc-execute.mjs` reads only `reasonCode` from `.nmg-sdlc/handoffs/<N>-deliver.json` and drops `summary`.
4. `scripts/sdlc-upgrade.mjs` has no detector for an onboarded project (`VERSION` present) that lacks `CHANGELOG.md`.
5. `normalizeSnapshot` in `scripts/pr-delivery-state.mjs` adds the gap `check <name> must have exact pull_request event provenance` for every check whose event is not `pull_request`. Any gap makes `classifyPrDeliveryState` return `unverifiable` / `evidence_incomplete_or_invalid`, even when the check is a green push-event run on the head commit.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `workflows/onboard-project/WORKFLOW.md` | Greenfield / Enhancement initialization line | Omits changelog creation |
| `workflows/onboard-project/references/greenfield.md` | "Init VERSION + specs/" | Omits changelog creation |
| `workflows/onboard-project/references/brownfield.md` | Preflight | Reuses bootstrap; must name changelog |
| `scripts/sdlc-deliver.mjs` | `synchronizeVersion`, `updateChangelog`, `runDeliverUnlocked` prepare-version catch | Raw ENOENT / reasonless error → `delivery_failed` |
| `scripts/sdlc-execute.mjs` | `prepareVersion` | Discards handoff summary |
| `scripts/sdlc-upgrade.mjs` | detector assembly, apply dispatch, `order` priority map | No changelog detector |
| `scripts/pr-delivery-state.mjs` | `normalizeSnapshot` check loop | Push-event check becomes a gap |

## Fix Strategy

- **Onboarding:** change the initialization lines to "Initialize VERSION (0.1.0 or from manifest), create `CHANGELOG.md` containing `# Changelog` and `## [Unreleased]` when it is absent (never modify an existing `CHANGELOG.md`), create specs/ empty." Add the same rule to `greenfield.md`, and to the `brownfield.md` preflight. Edit these workflow-bundled files through the `skill-creator` skill.
- **Deliver preflight:** add `requireVersionArtifacts(fs, cwd)`. `synchronizeVersion` calls it first, before any read or write. It throws `Error` with `reasonCode: 'version_artifact_missing'` when:
  - `VERSION` is missing or is not a regular non-symlink file: `VERSION is missing; create it with the current semver version`;
  - `CHANGELOG.md` is missing or is not a regular non-symlink file: `CHANGELOG.md is missing; create it with a ## [Unreleased] section`;
  - `CHANGELOG.md` has no `## [Unreleased]` line: `CHANGELOG.md lacks a ## [Unreleased] heading`.
  Give `updateChangelog`'s own throw the same `reasonCode`. In the prepare-version catch, map both `major_bump_required` and `version_artifact_missing` to `fail(context, error.reasonCode, error.message)`. The check runs before every write and commit, so a failure changes no file and creates no commit.
- **Execute:** in `prepareVersion`, read `reasonCode` and `summary` from the handoff. When `summary` is a non-empty string, build `version_preparation_failed: <reasonCode> — <summary>`. Otherwise keep the current `version_preparation_failed: <reasonCode>`.
- **Upgrade:** add `detectChangelogCreate(root)`. When root `VERSION` is a regular file and root `CHANGELOG.md` does not exist (`lstatOrNull` is null), it emits `{ id: 'changelog-create', kind: 'changelog-create', description: 'Create CHANGELOG.md with a ## [Unreleased] section for version preparation.', rel: 'CHANGELOG.md', actionable: true }`. `applyChangelogCreate` re-checks live state. If anything now exists at `CHANGELOG.md`, it returns `already-current` without writing. Otherwise it writes `# Changelog\n\n## [Unreleased]\n`. Register the kind at order 10.75 in the `order` map and in the apply dispatch. Document it in `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/v3-detectors.md`, and `workflows/upgrade-project/references/upgrade-procedures.md`, again through the `skill-creator` skill.
- **PR delivery state:** in `normalizeSnapshot`, replace the `check.event !== 'pull_request'` gap with a gap only for a missing event: `if (!check.event) gaps.push(\`check ${check.name} is missing event provenance\`)`. Keep the `identity\0event` duplicate key, the `observedPrChecks` filter for declared PR-only checks, and the all-event `failing`/`pending` checks in `classifyPrDeliveryState` unchanged. A failed push-event check then returns `remediate` / `checks_failed`, and delivery never merges in that state.
- **Docs:** update the README versioning paragraph to say that delivery requires `CHANGELOG.md` with `## [Unreleased]`, that onboarding creates it, and that `prepare-version` fails with `version_artifact_missing` when it is absent. Add an `[Unreleased]` CHANGELOG entry.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/greenfield.md`, `workflows/onboard-project/references/brownfield.md` | Create-if-absent changelog rule | AC1, FR1 |
| `scripts/sdlc-deliver.mjs` | `requireVersionArtifacts`, reason-coded changelog error, prepare-version catch | AC2, AC3, AC6, FR2 |
| `scripts/sdlc-execute.mjs` | Summary in `version_preparation_failed` | AC4, FR3 |
| `scripts/sdlc-upgrade.mjs` + upgrade references | `changelog-create` detector/apply | AC5, FR4 |
| `scripts/pr-delivery-state.mjs` | Gap only for missing event | AC7, AC8, FR5 |
| `README.md`, `CHANGELOG.md` | Document requirement and fix | User-facing behavior |

## Blast Radius

- `classifyPrDeliveryState` is shared by `sdlc-deliver.mjs` delivery and merge reconciliation. Only the gap condition changes, so failing and pending checks of any event still block merge, and declared PR-only evidence still requires `pull_request` provenance.
- `synchronizeVersion` is reached only through `prepare-version`. The idempotent already-synchronized path still finds `## [Unreleased]`, because `updateChangelog` keeps that marker.
- The upgrade detector adds one item only for projects that have `VERSION` and lack `CHANGELOG.md`. Repeated runs after apply report nothing.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Have `prepare-version` create a missing `CHANGELOG.md` itself | Rejected | The issue requires a specific failure. Creating project files silently is onboarding/upgrade's job |
| Drop non-`pull_request` checks from the snapshot entirely | Rejected | A failed push check must still block merge (AC8) |
| Also accept checks with a missing event | Rejected | Keeps provenance fail-closed; out of scope |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #484 | 2026-10-25 | Initial defect report |
