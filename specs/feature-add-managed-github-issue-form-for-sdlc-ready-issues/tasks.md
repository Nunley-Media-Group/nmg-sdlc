# Tasks: Add Managed GitHub Issue Form for SDLC-Ready Issues

**Issues**: #135
**Date**: 2026-04-27
**Status**: Planning
**Author**: Codex

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 3 | [ ] |
| Skill Contracts | 3 | [ ] |
| Documentation | 2 | [ ] |
| Testing | 4 | [ ] |
| **Total** | 12 | |

---

## Task Schema

Each task follows this structure:

```markdown
### TNNN: Task Title

**File(s)**: `path/to/file`
**Type**: Create | Modify
**Depends**: TNNN or None
**Acceptance**:
- [ ] Verifiable criterion
```

Skill-bundled files include `skills/**`, shared `references/**`, and `agents/**`; edits to those files must be routed through `$skill-creator` per `steering/tech.md`.

---

## Phase 1: Setup

### T001: Add the canonical SDLC-ready GitHub Issue Form

**File(s)**: `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] The file lives under `.github/ISSUE_TEMPLATE/` in this repository.
- [ ] The YAML includes required top-level `name`, `description`, and `body` keys.
- [ ] Required body fields capture issue type, structured context, acceptance criteria, functional requirements, scope boundaries, priority, and automation suitability.
- [ ] Acceptance-criteria example text uses Given/When/Then structure.
- [ ] The form does not request secrets, credentials, tokens, private keys, or sensitive internal data.
- [ ] Boolean-like dropdown options such as "Yes" and "No" are quoted.

### T002: Define the shared managed issue-form contract

**File(s)**: `references/issue-form.md`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Defines approved target path `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- [ ] Defines the canonical template source and how lifecycle skills read it from the plugin root.
- [ ] Defines `created`, `overwritten`, `already present`, and `skipped (<reason>)` outcomes.
- [ ] Defines the stable `Issue Form:` status block.
- [ ] States that any existing file at the approved target path is replaced, while unrelated issue templates are preserved.
- [ ] Documents unattended-mode behavior as deterministic and non-prompting.

### T003: Refresh inventory for the new shared reference

**File(s)**: `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Inventory baseline includes intentional clauses from `references/issue-form.md`.
- [ ] Baseline changes are limited to the new issue-form contract and any required pointer changes.
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes after the refresh.

---

## Phase 2: Skill Contracts

### T004: Wire init-config to install the managed issue form

**File(s)**: `skills/init-config/SKILL.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] The skill reads `../../references/issue-form.md` with compliant pointer wording.
- [ ] Setup creates `.github/ISSUE_TEMPLATE/` when needed and writes the managed form when the approved path is absent.
- [ ] Setup replaces any differing file at the approved target path and reports `overwritten`.
- [ ] Setup leaves every unrelated issue template unchanged.
- [ ] Completion output includes the stable Issue Form status block alongside existing config and contribution-gate output.

### T005: Teach upgrade-project to analyze issue-form drift

**File(s)**: `skills/upgrade-project/SKILL.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] `What Gets Analyzed` includes `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` as a managed issue form.
- [ ] A contribution-adjacent managed artifact step records missing, current, and differing target-path states.
- [ ] Missing and differing forms are classified as managed project artifact findings.
- [ ] Unattended mode auto-applies missing or differing form reconciliation and records the outcome without prompting.
- [ ] Key rules state that only the approved issue-form target path may be overwritten.

### T006: Apply issue-form findings in upgrade-project

**File(s)**: `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] Apply procedures create `.github/ISSUE_TEMPLATE/` when needed.
- [ ] Missing form creation and differing target-path replacement use the shared issue-form contract.
- [ ] Unrelated issue templates under `.github/ISSUE_TEMPLATE/` are preserved byte-for-byte.
- [ ] Step 9 summary includes the stable Issue Form status block.
- [ ] Skipped states record actionable gaps when the canonical template cannot be read or the target cannot be written.

---

## Phase 3: Documentation

### T007: Update public README setup and upgrade documentation

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T004, T005, T006
**Acceptance**:
- [ ] First-Time Setup or Unattended Setup documents that `init-config` installs the managed GitHub issue form.
- [ ] Upgrade documentation explains missing/current/differing form reconciliation.
- [ ] Documentation states the approved target path and overwrite behavior.
- [ ] Documentation states unrelated issue templates are preserved.
- [ ] Skills reference table reflects issue-form setup behavior where relevant.

### T008: Add changelog entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T004, T005, T006, T007
**Acceptance**:
- [ ] `[Unreleased]` includes a concise entry for issue #135.
- [ ] Entry mentions the managed GitHub issue form, setup installation, upgrade reconciliation, and explicit target-path overwrite behavior.
- [ ] Entry follows existing changelog style.

---

## Phase 4: Testing

### T009: Add static issue-form contract tests

**File(s)**: `scripts/__tests__/issue-form-contract.test.mjs`
**Type**: Create
**Depends**: T001, T002, T004, T005, T006, T007
**Acceptance**:
- [ ] Tests assert the canonical issue form exists at `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- [ ] Tests assert the YAML contains required GitHub Issue Form top-level keys and non-empty `body`.
- [ ] Tests assert required draft-issue fields are present and marked required.
- [ ] Tests assert ids and labels are unique.
- [ ] Tests assert boolean-like dropdown options are quoted in source text.
- [ ] Tests assert `init-config` and `upgrade-project` reference the shared issue-form contract.
- [ ] Tests assert README describes generated issue-form behavior.

### T010: Add fixture exercise coverage for init installation

**File(s)**: `scripts/__tests__/exercise-issue-form.test.mjs`
**Type**: Create
**Depends**: T001, T002, T004
**Acceptance**:
- [ ] Disposable-project exercise confirms missing form creation.
- [ ] Exercise confirms current form rerun is idempotent.
- [ ] Exercise confirms differing target-path form is overwritten.
- [ ] Exercise confirms unrelated issue templates are preserved byte-for-byte.
- [ ] Exercise confirms the returned status uses the stable Issue Form status shape.

### T011: Add fixture exercise coverage for upgrade reconciliation

**File(s)**: `scripts/__tests__/exercise-issue-form.test.mjs`
**Type**: Modify
**Depends**: T005, T006, T010
**Acceptance**:
- [ ] Upgrade-style fixture confirms missing form is reported and created.
- [ ] Upgrade-style fixture confirms differing target-path form is reported as overwritten.
- [ ] Upgrade-style fixture confirms already-current form is reported as already present.
- [ ] Upgrade-style fixture confirms unrelated issue templates and unrelated workflows are untouched.

### T012: Run inventory, compatibility, unit, and whitespace validation

**File(s)**: `scripts/skill-inventory.baseline.json`, `scripts/__tests__/issue-form-contract.test.mjs`, `scripts/__tests__/exercise-issue-form.test.mjs`
**Type**: Modify
**Depends**: T003, T009, T010, T011
**Acceptance**:
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes.
- [ ] `npm --prefix scripts test -- --runInBand` passes or any unrelated failure is documented.
- [ ] `npm --prefix scripts run compat` passes.
- [ ] `git diff --check` passes.
- [ ] Verification evidence maps every acceptance criterion to implementation or test evidence.

---

## Dependency Graph

```text
T001 --> T002 --> T003
T002 --> T004
T002 --> T005 --> T006
T004 --> T007
T005 --> T007
T006 --> T007 --> T008
T001 --> T009
T002 --> T009
T004 --> T009
T005 --> T009
T006 --> T009
T004 --> T010
T005 --> T011
T006 --> T011
T009 --> T012
T010 --> T012
T011 --> T012
```

Critical path: T001 -> T002 -> T005 -> T006 -> T011 -> T012.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #135 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] All tasks map to actual project paths
- [x] Dependencies are identified
- [x] Each acceptance criterion has a corresponding Gherkin scenario
- [x] Testing tasks include BDD/exercise coverage
- [x] Documentation tasks cover public behavior changes
- [x] Skill-bundled file edits are flagged for `$skill-creator` routing
