# Tasks: Add Bounded Relevant-Spec Discovery for nmg-sdlc Projects

**Issues**: #139
**Date**: 2026-04-30
**Status**: Planning
**Author**: Codex

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 2 | [ ] |
| Backend | 4 | [ ] |
| Integration | 2 | [ ] |
| Testing | 4 | [ ] |
| **Total** | 12 | |

---

## Task Format

Each task follows this structure:

```text
### T[NNN]: [Task Title]

**File(s)**: `path/to/file`
**Type**: Create | Modify | Delete
**Depends**: T[NNN], T[NNN] (or None)
**Acceptance**:
- [ ] [Verifiable criterion 1]
- [ ] [Verifiable criterion 2]
```

Skill-bundled files in this task list must be authored through `$skill-creator` during implementation, as required by `steering/tech.md`.

---

## Phase 1: Setup

### T001: Create Bounded Spec-Context Contract

**File(s)**: `references/spec-context.md`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Contract states that SDLC workflows always establish active-plus-neighboring spec context before decisions.
- [ ] Contract defines project-root `specs/` as canonical and explicitly excludes legacy `.codex/specs/` except through the legacy-layout gate.
- [ ] Contract defines metadata extraction fields, ranking signals, thresholds, caps, ranking reasons, no-match behavior, ambiguous-match behavior, and broken-link handling.
- [ ] Contract requires metadata-first scanning and forbids full-archive body loading by default.

### T002: Create Managed Project AGENTS Contract

**File(s)**: `references/project-agents.md`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Contract defines how onboarding and upgrade create or update root `AGENTS.md` additively.
- [ ] Contract includes managed markers or equivalent ownership boundaries for the nmg-sdlc section.
- [ ] Contract preserves project-authored instructions and forbids deleting, moving, or reformatting unrelated content.
- [ ] Contract returns stable statuses: `AGENTS.md: created | updated | already present | skipped (<reason>)`.

---

## Phase 2: Backend Implementation

### T003: Wire Bounded Context Into Draft-Issue Investigation

**File(s)**: `skills/draft-issue/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Step 4 feature investigation reads `../../references/spec-context.md` before summarizing current state.
- [ ] The skill uses bounded relevant-spec discovery instead of loading every spec body.
- [ ] The issue draft current-state block can mention surrounding specs and ranking gaps when relevant.

### T004: Upgrade Write-Spec Discovery to Shared Ranking Contract

**File(s)**: `skills/write-spec/SKILL.md`, `skills/write-spec/references/discovery.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `write-spec` declares the shared spec-context contract at the correct workflow point.
- [ ] Parent-link resolution remains first and still handles unsupported `gh --json parent` fields with the documented warning.
- [ ] Keyword fallback is replaced by the shared metadata ranking contract with thresholds and candidate reasons.
- [ ] Interactive ambiguity uses the existing `request_user_input` gate shape; unattended mode selects only a threshold-qualified deterministic candidate.

### T005: Add Active-Plus-Neighboring Context to Implementation Planning

**File(s)**: `skills/write-code/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] After active spec resolution, `write-code` reads bounded related specs when surrounding contracts can affect implementation scope.
- [ ] Active spec remains fully loaded and authoritative.
- [ ] Related specs are capped and used for constraints, not as replacement task sources.

### T006: Add Surrounding-Spec Verification Context

**File(s)**: `skills/verify-code/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Verification reads bounded related specs during acceptance, architecture, and blast-radius review.
- [ ] Verification reports when no related specs are found or when broken links are ignored.
- [ ] Active spec verification remains the primary pass/fail source.

---

## Phase 3: Integration

### T007: Wire Managed AGENTS.md Into Onboarding Flows

**File(s)**: `skills/onboard-project/SKILL.md`, `skills/onboard-project/references/greenfield.md`, `skills/onboard-project/references/brownfield.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Onboarding declares `../../references/project-agents.md` after steering bootstrap or verification succeeds.
- [ ] Greenfield and enhancement modes apply AGENTS.md guidance after steering exists and before starter issue generation.
- [ ] Brownfield modes apply AGENTS.md guidance after steering verification succeeds.
- [ ] Step 5 summary reports AGENTS.md status and gaps.

### T008: Wire Managed AGENTS.md Into Upgrade Flow

**File(s)**: `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Upgrade-project classifies missing or incomplete AGENTS.md spec-context guidance as a non-destructive managed-artifact finding.
- [ ] Approved or unattended runs create/update only the managed section and preserve existing instructions.
- [ ] Upgrade summary reports `AGENTS.md` status consistently with `references/project-agents.md`.

---

## Phase 4: Testing

### T009: Update Public Docs and Changelog

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T003, T004, T005, T006, T007, T008
**Acceptance**:
- [ ] README documents that SDLC workflows use project-root `specs/` as active-plus-neighboring context by default.
- [ ] README documents that onboarding and upgrade manage root `AGENTS.md` spec-context guidance.
- [ ] CHANGELOG `[Unreleased]` includes a concise issue #139 entry.

### T010: Add Static Contract Tests

**File(s)**: `scripts/__tests__/spec-context-contract.test.mjs`
**Type**: Create
**Depends**: T001, T002, T003, T004, T005, T006, T007, T008, T009
**Acceptance**:
- [ ] Tests assert `references/spec-context.md` contains canonical specs, metadata-first scanning, caps, thresholds, ranking reasons, and no persistent index requirement.
- [ ] Tests assert each affected skill references the correct shared contract.
- [ ] Tests assert `references/project-agents.md` contains managed markers, additive update rules, status shape, and safety rules.
- [ ] Tests assert README and CHANGELOG mention the new behavior.

### T011: Add Exercise Tests for Ranking and AGENTS Idempotency

**File(s)**: `scripts/__tests__/exercise-spec-context.test.mjs`
**Type**: Create
**Depends**: T001, T002, T010
**Acceptance**:
- [ ] Exercise fixture creates multiple specs and proves only active spec plus capped related specs are marked for full loading.
- [ ] Exercise fixture proves strong path/symbol/frontmatter signals outrank generic project terms.
- [ ] Exercise fixture covers missing, incomplete, and already-complete `AGENTS.md` guidance states.
- [ ] Rerunning the AGENTS.md exercise produces no duplicate managed section.

### T012: Refresh Inventory and Run Verification Gates

**File(s)**: `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011
**Acceptance**:
- [ ] Run `node scripts/skill-inventory-audit.mjs --check`; if it reports intentional new inventory drift, regenerate `scripts/skill-inventory.baseline.json`.
- [ ] Run `npm --prefix scripts test -- --runInBand`.
- [ ] Run `node scripts/skill-inventory-audit.mjs --check`.
- [ ] Run `node scripts/codex-compatibility-check.mjs`.
- [ ] Run `git diff --check`.

---

## Dependency Graph

```text
T001 ──┬──▶ T003 ─┐
       ├──▶ T004 ─┤
       ├──▶ T005 ─┤
       └──▶ T006 ─┤
                   ├──▶ T009 ───▶ T010 ──▶ T011 ──▶ T012
T002 ──┬──▶ T007 ─┤
       └──▶ T008 ─┘
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #139 | 2026-04-30 | Initial feature spec |
