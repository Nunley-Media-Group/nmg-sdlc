# Tasks: Add CONTRIBUTING.md Generation to Project Onboarding and Upgrades

**Issues**: #109
**Date**: 2026-04-26
**Status**: Planning
**Author**: Codex

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 2 | [ ] |
| Skill Contracts | 6 | [ ] |
| Documentation | 2 | [ ] |
| Testing | 4 | [ ] |
| **Total** | 14 | |

---

## Task Format

Each task follows this structure:

```markdown
### TNNN: Task Title

**File(s)**: `path/to/file`
**Type**: Create | Modify
**Depends**: TNNN or None
**Acceptance**:
- [ ] Verifiable criterion
```

---

## Phase 1: Setup

### T001: Create shared contribution-guide contract

**File(s)**: `references/contribution-guide.md`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Defines when callers may ensure `CONTRIBUTING.md` after steering exists.
- [ ] Defines missing-guide creation, incomplete-guide additive update, complete-guide no-op, missing-README skip, and README-link insertion behavior.
- [ ] Requires generated content to consult `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.
- [ ] Defines stable summary statuses for `CONTRIBUTING.md`, README link, and gaps.
- [ ] Documents unattended-mode behavior with no blocking prompts.

### T002: Update inventory expectations for the new shared reference

**File(s)**: `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Inventory audit baseline includes the new shared reference if the audit reports it.
- [ ] No unrelated inventory churn is introduced.

---

## Phase 2: Skill Contracts

### T003: Wire onboard-project to the shared contribution-guide contract

**File(s)**: `skills/onboard-project/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] The skill points to `../../references/contribution-guide.md` with compliant reference-pointer wording.
- [ ] Step 5 summary includes contribution-guide status.
- [ ] Public behavior remains stack-agnostic and mode-aware.

### T004: Ensure greenfield modes create or update the guide after steering exists

**File(s)**: `skills/onboard-project/references/greenfield.md`
**Type**: Modify
**Depends**: T001, T003
**Acceptance**:
- [ ] Greenfield mode ensures `CONTRIBUTING.md` after all three steering docs are verified.
- [ ] Greenfield-enhancement mode preserves existing guides and applies only targeted missing nmg-sdlc coverage.
- [ ] README link handling is idempotent and missing README is reported, not created.
- [ ] Contribution-guide outcomes are recorded for Step 5.

### T005: Ensure brownfield modes create or update the guide after steering exists

**File(s)**: `skills/onboard-project/references/brownfield.md`
**Type**: Modify
**Depends**: T001, T003
**Acceptance**:
- [ ] Brownfield mode ensures the guide only after steering bootstrap or verification succeeds.
- [ ] Brownfield-no-issues mode follows the same guide path before source backfill exits.
- [ ] Guide content reflects existing code and reconciled/source-backfilled specs as contribution context.
- [ ] Contribution-guide gaps are recorded in the summary without aborting unrelated reconciliation work.

### T006: Replace upgrade-project's blanket file-creation prohibition with managed-artifact policy

**File(s)**: `skills/upgrade-project/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] The skill no longer says it never creates files as a blanket rule.
- [ ] The key rules allow creation of missing files declared by the current plugin contract as managed, non-destructive project artifacts.
- [ ] The policy still prevents arbitrary unrelated file synthesis.
- [ ] `CONTRIBUTING.md` is listed as an analyzed managed artifact.

### T007: Add contribution-guide findings and apply behavior to upgrade-project

**File(s)**: `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: T001, T006
**Acceptance**:
- [ ] Missing or incomplete `CONTRIBUTING.md` coverage appears in Step 8 findings.
- [ ] Interactive mode presents guide/README edits with the existing non-destructive batch approval flow.
- [ ] Unattended mode auto-applies missing-guide creation and README-link insertion as non-destructive managed-artifact changes.
- [ ] Step 9 summary reports guide/link outcomes as created, updated, skipped, or already present.

### T008: Preserve existing guide and README content through targeted edits

**File(s)**: `references/contribution-guide.md`, `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: T001, T007
**Acceptance**:
- [ ] Existing `CONTRIBUTING.md` content is not overwritten.
- [ ] Missing nmg-sdlc coverage is appended as a targeted section only when equivalent coverage is absent.
- [ ] Existing README links to `CONTRIBUTING.md` are detected before insertion.
- [ ] Missing README is reported as a skip/gap and no README is created.

---

## Phase 3: Documentation

### T009: Update public README setup and upgrade documentation

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T003, T006, T007
**Acceptance**:
- [ ] First-Time Setup says onboarded projects receive root `CONTRIBUTING.md` after steering exists.
- [ ] Upgrade documentation says upgrade-project can create managed non-destructive artifacts including `CONTRIBUTING.md`.
- [ ] Skills reference table remains in sync with actual behavior.

### T010: Add changelog entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T003, T006, T007
**Acceptance**:
- [ ] `[Unreleased]` includes a concise entry for contribution-guide generation and upgrade-project managed file creation.
- [ ] Entry follows existing changelog style.

---

## Phase 4: Testing

### T011: Add static contribution-guide contract tests

**File(s)**: `scripts/__tests__/contribution-guide-contract.test.mjs`
**Type**: Create
**Depends**: T001, T003, T006, T007, T008
**Acceptance**:
- [ ] Tests assert onboard-project and upgrade-project reference the shared contribution-guide contract.
- [ ] Tests assert upgrade-project no longer contains a blanket "Never create files" rule.
- [ ] Tests assert upgrade-project documents managed non-destructive artifact creation.
- [ ] Tests assert the shared reference covers preservation, README-link idempotency, missing README skip, steering-derived content, and summary statuses.

### T012: Add or document exercise verification for onboarding and upgrade

**File(s)**: `scripts/__tests__/exercise-contribution-guide.test.mjs`, `specs/feature-add-contributing-md-generation-to-project-onboarding-and-upgrades/verification-report.md`
**Type**: Create
**Depends**: T004, T005, T007, T008
**Acceptance**:
- [ ] Exercise coverage scaffolds disposable projects for onboarding and upgrade when environment support is available.
- [ ] Exercise checks generated `CONTRIBUTING.md`, README link insertion, existing-guide preservation, and idempotent rerun behavior.
- [ ] If full Codex exercise is unavailable, the verification report records the limitation and the deterministic checks that still ran.

### T013: Run inventory, compatibility, and unit validation

**File(s)**: `scripts/skill-inventory.baseline.json`, `scripts/__tests__/contribution-guide-contract.test.mjs`
**Type**: Modify
**Depends**: T002, T011
**Acceptance**:
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes.
- [ ] `npm --prefix scripts test -- --runInBand` passes or any unrelated failure is documented.
- [ ] `npm --prefix scripts run compat` passes.
- [ ] `git diff --check` passes.

### T014: Perform final spec alignment verification

**File(s)**: `specs/feature-add-contributing-md-generation-to-project-onboarding-and-upgrades/verification-report.md`
**Type**: Create
**Depends**: T011, T012, T013
**Acceptance**:
- [ ] Verification maps every acceptance criterion to implementation evidence.
- [ ] Any exercise limitations are documented explicitly.
- [ ] No implementation file is left unmapped to a task or requirement.

---

## Dependency Graph

```text
T001 --> T002
T001 --> T003 --> T004
T003 --> T005
T001 --> T006 --> T007 --> T008
T004 --> T009
T007 --> T009 --> T010
T008 --> T011 --> T013 --> T014
T008 --> T012 --> T014
```

Critical path: T001 -> T006 -> T007 -> T008 -> T011 -> T013 -> T014.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #109 | 2026-04-26 | Initial feature spec |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] All tasks map to actual project paths
- [x] Dependencies are identified
- [x] Each acceptance criterion has a corresponding Gherkin scenario
- [x] Testing tasks include BDD/exercise coverage
- [x] Documentation tasks cover public behavior changes
- [x] Upgrade-project managed file creation policy is explicitly included
