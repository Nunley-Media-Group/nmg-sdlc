# Tasks: Remove Legacy Design URL Support

**Issues**: #105
**Date**: 2026-04-25
**Status**: Approved
**Author**: Rich Nunley

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 2 | [ ] |
| Backend | 0 | N/A |
| Frontend | 0 | N/A |
| Integration | 6 | [ ] |
| Testing | 5 | [ ] |
| **Total** | **13** | |

---

---

## Task Format

Each task follows this structure:## Phase 1: Setup

### T001: Establish live-surface stale-reference baseline

**File(s)**: `README.md`, `skills/draft-issue/`, `skills/onboard-project/`, `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Search live surfaces for `legacy Design`, `Design URL`, `design archive`, `design-url`, `designContext`, `designFailureNote`, `design_context`, and `--design-url`.
- [ ] Record which hits are live contract text and which are archival-only.
- [ ] Do not rewrite `specs/` or historical `CHANGELOG.md` entries solely to reduce grep output.

### T002: Route skill-bundled edits through skill-creator

**File(s)**: `skills/draft-issue/SKILL.md`, `skills/draft-issue/references/*`, `skills/onboard-project/SKILL.md`, `skills/onboard-project/references/*`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `$skill-creator` is used for every skill-bundled edit.
- [ ] If `$skill-creator` is unavailable, implementation stops rather than hand-editing skill-bundled files.
- [ ] Root README, CHANGELOG, and inventory baseline edits remain normal repo edits.

---

## Phase 2: Backend Implementation

N/A. This feature does not change runtime scripts except the generated skill inventory baseline.

---

## Phase 3: Frontend Implementation

N/A. This feature has no UI surface.

---

## Phase 4: Integration

### T003: Remove Design URL support from draft-issue workflow skeleton

**File(s)**: `skills/draft-issue/SKILL.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Workflow overview no longer lists optional Design URL gathering or fetch/decode.
- [ ] Step 1 input/process/output no longer mentions optional Design URL or `session.designUrl`.
- [ ] Step 1a fetch/decode branch and pointer to `references/design-url.md` are removed.
- [ ] Step 4 investigation no longer accepts or cites `session.designContext`.
- [ ] Step 6 synthesis no longer accepts or cites `session.designContext`.
- [ ] Step 11 no longer appends design fetch failure summaries.

### T004: Remove design URL reference material from draft-issue bundle

**File(s)**: `skills/draft-issue/references/design-url.md`, `skills/draft-issue/references/feature-template.md`, `skills/draft-issue/references/interview-depth.md`, `skills/draft-issue/references/multi-issue.md`
**Type**: Modify | Delete
**Depends**: T002
**Acceptance**:
- [ ] `skills/draft-issue/references/design-url.md` is deleted from the live bundle.
- [ ] `feature-template.md` no longer instructs generated issues to cite design URLs.
- [ ] `interview-depth.md` no longer treats design context as an interview input or skip source.
- [ ] `multi-issue.md` no longer includes `session.designContext`, `session.designFailureNote`, or design fetch failure summary text.

### T005: Remove Design URL support from onboard-project workflow skeleton

**File(s)**: `skills/onboard-project/SKILL.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Frontmatter description no longer says onboarding optionally ingests a Design URL.
- [ ] Step 2G summary no longer advertises design URL ingest.
- [ ] Step 5 summary no longer includes "Design URL fetch result" or design-context default source labels.
- [ ] Error States no longer include Design URL fetch/decode or non-HTTPS Design URL cases.
- [ ] Integration diagram no longer describes greenfield design URL ingest.

### T006: Remove design context from onboard-project greenfield references

**File(s)**: `skills/onboard-project/references/greenfield.md`, `skills/onboard-project/references/interview.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Greenfield reference no longer has an optional Design URL ingestion step.
- [ ] Greenfield sequence starts with the intent and tech-selection interview.
- [ ] Starter issue candidate synthesis uses interview and steering context, not design context.
- [ ] Delegation to `$nmg-sdlc:draft-issue` no longer passes shared design context.
- [ ] Interview defaults no longer include `from design context` or `design_context`.

### T007: Update public README command and workflow docs

**File(s)**: `README.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] First-Time Setup greenfield prose no longer says onboarding optionally ingests a Design URL.
- [ ] Step 1 draft-issue docs remove the Design URL subsection.
- [ ] Skills reference row for `$nmg-sdlc:draft-issue` no longer includes `[design-url]`.
- [ ] Skills reference row for `$nmg-sdlc:onboard-project` no longer includes `[--design-url <url>]`.
- [ ] README still accurately describes multi-issue mode and greenfield onboarding without the removed feature.

### T008: Add changelog entry for the removal

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Add an `[Unreleased]` entry describing removal of legacy Design URL support from live workflows.
- [ ] The entry references issue #105.
- [ ] Historical release entries are not rewritten.

---

## Phase 5: BDD Testing and Verification

### T009: Update skill inventory baseline

**File(s)**: `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T003, T004, T005, T006
**Acceptance**:
- [ ] Regenerate or update the baseline after skill reference changes.
- [ ] Baseline no longer contains live pointers to `skills/draft-issue/references/design-url.md`.
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits 0.

### T010: Run compatibility validation

**File(s)**: `scripts/codex-compatibility-check.mjs`, `scripts/package.json`
**Type**: Verify
**Depends**: T003, T004, T005, T006, T007, T009
**Acceptance**:
- [ ] `npm --prefix scripts run compat` exits 0.
- [ ] Any compatibility failures caused by the removal are fixed in scope.

### T011: Run targeted stale-reference verification

**File(s)**: `README.md`, `skills/draft-issue/`, `skills/onboard-project/`, `scripts/skill-inventory.baseline.json`
**Type**: Verify
**Depends**: T003, T004, T005, T006, T007, T009
**Acceptance**:
- [ ] Targeted searches over live surfaces find no unsupported `Design URL`, `design archive`, `design-url`, `designContext`, `designFailureNote`, `design_context`, or `--design-url` references.
- [ ] Any remaining matches outside live surfaces are documented as archival-only.
- [ ] Historical specs are not bulk-rewritten.

### T012: Review workflow continuity

**File(s)**: `skills/draft-issue/SKILL.md`, `skills/onboard-project/SKILL.md`, `skills/onboard-project/references/greenfield.md`
**Type**: Verify
**Depends**: T003, T004, T005, T006
**Acceptance**:
- [ ] Draft-issue still has a coherent Step 1 -> Step 1b -> Step 2 flow.
- [ ] Onboard-project greenfield still has a coherent Step 2G interview -> steering -> version/milestone -> starter issue flow.
- [ ] Removed design state is not referenced by later workflow steps.

### T013: Create BDD feature file

**File(s)**: `specs/feature-remove-design-url-support/feature.gherkin`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Every acceptance criterion in `requirements.md` has a matching Gherkin scenario.
- [ ] Scenarios use concrete live file surfaces.
- [ ] Feature file is valid Gherkin syntax.

---

## Dependency Graph

```
T001 -> T002 -> T003 -> T009 -> T010
              -> T004 -> T009 -> T011
              -> T005 -> T012
              -> T006 -> T012
T007 ---------------------------> T011
T008
T001 -> T013
```

Critical path: **T001 -> T002 -> T003/T004/T005/T006 -> T009 -> T010/T011/T012**.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #105 | 2026-04-25 | Initial feature spec |
