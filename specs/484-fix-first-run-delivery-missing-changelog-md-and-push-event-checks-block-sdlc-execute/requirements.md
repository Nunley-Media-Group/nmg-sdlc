# Defect Report: First-run delivery blocked by missing CHANGELOG.md and push-event checks

**Issue**: #484
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Reproduction

1. Onboard a greenfield project with `/sdlc-onboard-project`. `VERSION` is created and `CHANGELOG.md` is not.
2. Draft an issue, then write and approve its spec.
3. Run `/sdlc-execute #N`.
4. Separately, add a workflow that triggers on both `push` and `pull_request`, then let `/sdlc-execute` reach delivery.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Onboarding creates `CHANGELOG.md` with a `## [Unreleased]` section, and version preparation succeeds. If the changelog or its heading is missing anyway, `prepare-version` fails with `version_artifact_missing`, and `/sdlc-execute` prints that code with a summary that names what is missing. A successful push-event check on the PR head does not block delivery and is never counted as PR-only evidence. |
| **Actual** | `/sdlc-execute` exits 1 with only `version_preparation_failed: delivery_failed`. The handoff summary holds a raw `ENOENT` for `CHANGELOG.md`. With a push-and-pull_request workflow, delivery fails with `PR #N is not mergeable: evidence_incomplete_or_invalid`, and the PR is never merged. |

## Acceptance Criteria

### AC1: Onboarding creates the changelog

**Given** a greenfield or brownfield project without `CHANGELOG.md`
**When** `/sdlc-onboard-project` completes
**Then** `CHANGELOG.md` exists with a `# Changelog` heading and a `## [Unreleased]` section, and an existing `CHANGELOG.md` is left unchanged

### AC2: Missing changelog fails with a specific reason

**Given** a project whose issue branch has no `CHANGELOG.md`
**When** `sdlc-deliver.mjs prepare-version --issue N` runs
**Then** it exits non-zero with a failed deliver handoff whose `reasonCode` is `version_artifact_missing` and whose summary names `CHANGELOG.md`, and it creates no commit and changes no version file

### AC3: Missing Unreleased heading fails with a specific reason

**Given** a `CHANGELOG.md` without a `## [Unreleased]` heading
**When** `prepare-version --issue N` runs
**Then** it fails with `reasonCode` `version_artifact_missing` and a summary naming the missing `## [Unreleased]` heading, and it creates no commit

### AC4: Execute prints the failure summary

**Given** `prepare-version` fails and writes a deliver handoff
**When** `/sdlc-execute` reports the failure
**Then** the printed line contains `version_preparation_failed: <reasonCode>` followed by the handoff summary

### AC5: Upgrade proposes the missing changelog

**Given** an onboarded project with `VERSION` and no `CHANGELOG.md`
**When** `/sdlc-upgrade-project` runs
**Then** its proposed reconciliation includes creating `CHANGELOG.md` with a `## [Unreleased]` section

### AC6: Existing version preparation is preserved

**Given** a project with a valid `VERSION` and a `CHANGELOG.md` that has `## [Unreleased]`
**When** `prepare-version --issue N` runs
**Then** it bumps and commits the version artifacts as before, and `major_bump_required` handling is unchanged

### AC7: Push-event checks do not block delivery

**Given** an open PR whose exact head has a successful push-event check, plus a successful pull_request-event check with the same name from a workflow that triggers on both events
**When** delivery classifies the PR state
**Then** the snapshot is not `evidence_incomplete_or_invalid` because of that push-event check, the PR can reach `merge_ready`, and the push-event check is never counted as PR-only evidence for a declared check

### AC8: Failing push-event checks still block delivery

**Given** an open PR whose exact head has a failed push-event check
**When** delivery classifies the PR state
**Then** delivery does not merge the PR

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Onboarding (greenfield and brownfield) creates `CHANGELOG.md` with `## [Unreleased]` when it is absent, and preserves an existing one | Must |
| FR2 | `prepare-version` checks for `VERSION`, `CHANGELOG.md` and the `## [Unreleased]` heading before mutating anything, and fails with `version_artifact_missing` and a summary naming what is missing | Must |
| FR3 | `sdlc-execute` includes the deliver handoff summary in its `version_preparation_failed` output | Must |
| FR4 | `/sdlc-upgrade-project` proposes creating a missing `CHANGELOG.md` with `## [Unreleased]` | Should |
| FR5 | PR delivery classification keeps non-`pull_request`-event checks out of PR-only evidence without treating a successful one as a snapshot gap, and a failed check of any event still blocks merge | Must |

## Out of Scope

- Changing the changelog entry format or the version bump classification
- Turning other `delivery_failed` causes outside version preparation into specific reason codes
- Treating a check with a missing event as acceptable provenance

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #484 | 2026-10-25 | Initial defect report |
