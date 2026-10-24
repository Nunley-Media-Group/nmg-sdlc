# Defect Report: Fix sdlc-upgrade detection failing on issue listings over 1 MiB

**Issue**: #478
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG

## Reproduction

1. In a clone of `Nunley-Media-Group/nmg-sdlc-smoke`, whose issue listing is 1,290,608 bytes, run `node <nmg-sdlc>/scripts/sdlc-upgrade.mjs detect --root .`.
2. It prints `ERROR {"reasonCode":"dependency_unreadable",…,"message":"Repository issue listing failed"}` and exits 1.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Detection reads the full listing and reports the upgrade items. |
| **Actual** | Detection fails with `dependency_unreadable`, so `/sdlc-upgrade-project` can detect and apply nothing. |

## Acceptance Criteria

### AC1: A large issue listing is read

**Given** a repository whose issue listing output is larger than 1 MiB
**When** `sdlc-upgrade.mjs detect --root .` runs
**Then** it exits 0 and reports its items

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `sdlc-upgrade.mjs`'s default command runner allows 256 MiB of output | Must |

## Out of Scope

- Paging the listing differently
