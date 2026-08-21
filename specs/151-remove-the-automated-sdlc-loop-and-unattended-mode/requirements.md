# Requirements: Remove the Automated SDLC Loop and Unattended Mode

**Issue**: #151
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

nmg-sdlc 3.0 has no legacy in-process runner or unattended mode. Automated delivery is explicit `/sdlc-execute` orchestration through Herdr OMP workers; interactive stages remain native `/plan` workflows. Git history, not stale working-tree specs or runner artifacts, preserves superseded behavior.

## Acceptance Criteria

### AC1: Fresh install has no automated loop surface

Given the 3.0 plugin surface, when fresh install has no automated loop surface is evaluated, then only the current OMP/Herdr contract remains observable.

### AC2: Skills use interactive contracts only

Given the 3.0 plugin surface, when skills use interactive contracts only is evaluated, then only the current OMP/Herdr contract remains observable.

### AC3: Automation eligibility is absent from issue workflows

Given the 3.0 plugin surface, when automation eligibility is absent from issue workflows is evaluated, then only the current OMP/Herdr contract remains observable.

### AC4: Active product surfaces describe only the manual pipeline

Given the 3.0 plugin surface, when active product surfaces describe only the manual pipeline is evaluated, then only the current OMP/Herdr contract remains observable.

### AC5: Managed repository assets remain available

Given the 3.0 plugin surface, when managed repository assets remain available is evaluated, then only the current OMP/Herdr contract remains observable.

### AC6: Upgrade removes only known obsolete runner artifacts

Given the 3.0 plugin surface, when upgrade removes only known obsolete runner artifacts is evaluated, then only the current OMP/Herdr contract remains observable.

### AC7: Existing GitHub labels and issue history are not mutated

Given the 3.0 plugin surface, when existing github labels and issue history are not mutated is evaluated, then only the current OMP/Herdr contract remains observable.

### AC8: Historical records remain truthful and intact

Given the 3.0 plugin surface, when historical records remain truthful and intact is evaluated, then only the current OMP/Herdr contract remains observable.

### AC9: Conflicting backlog is reconciled

Given the 3.0 plugin surface, when conflicting backlog is reconciled is evaluated, then only the current OMP/Herdr contract remains observable.

### AC10: Manual pipeline and migration are verified

Given the 3.0 plugin surface, when manual pipeline and migration are verified is evaluated, then only the current OMP/Herdr contract remains observable.

## Normative Sources

- `package.json`, `src/`, `commands/`, and `skills/` define the installed surface.
- `scripts/verify-plugin-surface.mjs` rejects removed or stale plugin artifacts.
- `skills/upgrade-project/` and `scripts/sdlc-upgrade.mjs` own approved legacy cleanup.
