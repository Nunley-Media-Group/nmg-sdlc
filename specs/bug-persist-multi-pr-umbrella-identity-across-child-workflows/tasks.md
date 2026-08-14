# Tasks: Persist Multi-PR Umbrella Identity Across Child Workflows

**Issue**: #160
**Date**: 2026-08-14
**Status**: Ready for Implementation
**Author**: Rich Nunley

---

## T001: Add the Shared Durable Relationship Classifier

**Files**: `scripts/epic-relationships.mjs`, `references/epic-relationships.md`
**Type**: Create / Modify (route the shared reference through `$skill-creator`)
**Depends on**: None
**Acceptance**:

- [x] Normalize native parent/sub-issue, supported body cross-reference, `epic`, and `epic-child-of-N` label evidence without following cross-repository or invalid identifiers.
- [x] Return stable role, parent, identity, coordination-pair, execution-dependency, sibling, and gap fields for durable, legacy, inconsistent, ambiguous, unverifiable, and ordinary records.
- [x] Keep unknown or confirmed non-epic execution targets blocking and exclude only confirmed coordination parents.
- [x] Reconcile native child membership with checklist fallback while reporting native-only and checklist-only discrepancies.
- [x] Keep the implementation zero-dependency, deterministic, read-only, and free of cached GitHub state.

## T002: Persist and Consume Identity Across the Manual Lifecycle

**Files**: `skills/write-spec/SKILL.md`, `skills/write-spec/references/umbrella-mode.md`, `skills/draft-issue/references/multi-issue.md`, `skills/start-issue/SKILL.md`, `skills/write-code/SKILL.md`, `skills/verify-code/SKILL.md`, `skills/status/SKILL.md`, `skills/open-pr/references/version-bump.md`, `scripts/sdlc-status.mjs`
**Type**: Modify (route every skill/reference edit through `$skill-creator`)
**Depends on**: T001
**Acceptance**:

- [x] Canonical umbrella transition persists and revalidates the parent's `epic` label before child handoff.
- [x] Every generated epic child receives exactly one matching `epic-child-of-N` label plus native and body relationship evidence.
- [x] Start, spec, code, verify, status, and PR preparation use the shared result and stop before mutation on inconsistent, ambiguous, or unverifiable coordination claims.
- [x] A canonical, consistently classified child bypasses child-numbered sealing and proceeds to its implementation slice.
- [x] Open-PR sibling enumeration uses native children authoritatively, preserves checklist fallback, and reports discrepancies.
- [x] Status text and JSON expose the same active-issue coordination identity without changing lifecycle-stage inference or read-only guarantees.

## T003: Add Approval-Gated Recovery, Documentation, and Regression Coverage

**Files**: `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/epic-identity-recovery.md`, `scripts/__tests__/epic-relationships.test.mjs`, `scripts/__tests__/epic-relationship-contract.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__tests__/exercise-start-issue-epic.test.mjs`, `scripts/__tests__/exercise-open-pr-epic.test.mjs`, `scripts/__tests__/exercise-persisted-umbrella-identity.test.mjs`, `README.md`
**Type**: Create / Modify (route upgrade skill/reference edits through `$skill-creator`)
**Depends on**: T002
**Acceptance**:

- [x] Upgrade audit reports exact durable, legacy, inconsistent, ambiguous, and degraded records without mutation.
- [x] Each proposed label/link/checklist repair requires explicit approval, is revalidated immediately before write, aborts on drift, and is idempotent on rerun.
- [x] Unit tests cover identity normalization, genuine dependencies, conflicts, unknown targets, and sibling reconciliation.
- [x] Contract tests prove every named producer and consumer uses the shared fields and current GitHub query boundary.
- [x] A deterministic fresh-session fixture covers planning through PR preparation with a real sibling dependency and stale checklist.
- [x] README documents the durable tuple, native relationship authority, and recovery command.

## T004: Verify the Complete Defect Fix

**Files**: `specs/bug-persist-multi-pr-umbrella-identity-across-child-workflows/verification-report.md`, repository validation outputs
**Type**: Verify
**Depends on**: T003
**Acceptance**:

- [x] Run focused relationship, status, and exercise contract suites.
- [x] Run the full Jest suite with intentional exercise skips accounted for.
- [x] Run skill inventory, Codex compatibility, active plugin-surface, and Git hygiene gates.
- [x] Validate every affected skill bundle through `$skill-creator` tooling.
- [x] Confirm every AC has passing implementation and Gherkin evidence and no unrelated path changed.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #160 | 2026-08-14 | Initial defect task plan |

---

## Completion Checklist

- [x] T001 complete
- [x] T002 complete
- [x] T003 complete
- [x] T004 complete
