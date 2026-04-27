# Verification Report: Add Managed GitHub Issue Form for SDLC-Ready Issues

**Issue**: #135
**Date**: 2026-04-27
**Status**: Pass
**Verifier**: Codex

---

## Executive Summary

Implementation passes verification for issue #135. The repository now includes the canonical SDLC-ready GitHub Issue Form, lifecycle skill instructions install or reconcile it through the shared issue-form contract, docs describe setup/upgrade/overwrite behavior, and both init and upgrade paths were exercised against disposable projects.

No verification findings required fixes.

---

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC1 Repository Issue Form Exists | Pass | `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` exists with required `name`, `description`, and `body` keys. |
| AC2 Draft-Issue Expectations Are Captured | Pass | Required form fields cover issue type, user story or bug/spike context, Given/When/Then ACs, FRs, scope, priority, and automation suitability. |
| AC3 Submitted Issue Body Is Spec-Ready | Pass | Field labels map to recognizable GitHub issue body sections, and AC placeholder text preserves one-to-one Gherkin structure. |
| AC4 Init Config Installs the Managed Form | Pass | `skills/init-config/SKILL.md` reads `../../references/issue-form.md`; disposable `codex exec` exercise created the form and emitted `Form: created`. |
| AC5 Upgrade Project Reconciles the Managed Form | Pass | `skills/upgrade-project/SKILL.md` and `upgrade-procedures.md` analyze/apply issue-form findings; disposable exercise replaced stale target content. |
| AC6 Existing Target-Path Templates Are Overwritten | Pass | Contract and upgrade exercise report `Form: overwritten` when the approved target path differs from canonical content. |
| AC7 Unrelated Issue Templates Are Preserved | Pass | Fixture and `codex exec` upgrade exercise preserved unrelated issue template and workflow bytes. |
| AC8 Public Docs Describe the Managed Issue Form | Pass | `README.md` and `CHANGELOG.md` document managed form installation, reconciliation, and overwrite behavior. |
| AC9 Install Paths Are Exercised | Pass | Jest fixture exercise and live disposable `codex exec` runs covered init creation and upgrade overwrite/preservation paths. |
| AC10 GitHub Form Schema Remains Valid | Pass | Static contract tests cover required top-level keys, supported field types, unique ids/labels/options, required validations, and quoted boolean-like dropdown values. |

---

## Architecture Review

| Area | Score | Notes |
|------|-------|-------|
| SOLID Principles | 4 | Shared `references/issue-form.md` keeps the managed-artifact contract centralized; lifecycle skills consume it without duplicating rules. |
| Security | 5 | Form collects public planning data only, explicitly avoids secrets, and uses local file copies without new network or credential behavior. |
| Performance | 5 | Setup and upgrade read/write one small YAML artifact with targeted path checks; no broad scans or dependencies added. |
| Testability | 5 | Static contract tests, fixture exercise tests, Gherkin scenarios, and live disposable Codex exercises cover the behavior. |
| Error Handling | 4 | Contract defines skipped states for missing canonical template and write failures with actionable gaps. |

Average architecture score: 4.6/5.

---

## Test Coverage

- BDD scenarios: 10/10 acceptance criteria covered in `feature.gherkin`.
- Step definitions: Not applicable; this plugin uses Gherkin as verification criteria plus Jest/fixture exercises for executable coverage.
- Test execution: Pass.

Commands run:

```bash
npm --prefix scripts test -- --runInBand
node scripts/skill-inventory-audit.mjs --check
npm --prefix scripts run compat
git diff --check
```

Results:

- Jest: 15 passed suites, 3 skipped suites, 389 passed tests, 17 skipped tests.
- Skill inventory audit: clean, 550 items mapped.
- Codex compatibility check: passed.
- Whitespace diff check: passed.

---

## Exercise Test Results

Plugin changes were detected in `skills/init-config/SKILL.md` and `skills/upgrade-project/SKILL.md`, so exercise verification was required.

| Exercise | Status | Evidence |
|----------|--------|----------|
| Init config setup | Pass | Disposable `codex exec` run created `sdlc-config.json`, `.gitignore`, `.github/workflows/nmg-sdlc-contribution-gate.yml`, and `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`; Issue Form status was `created`, gaps `none`. |
| Upgrade reconciliation | Pass | Disposable `codex exec` run replaced stale `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` with the canonical template; Issue Form status was `overwritten`, gaps `none`. |
| Preservation boundary | Pass | Upgrade exercise preserved `.github/ISSUE_TEMPLATE/question.yml` and `.github/workflows/project-ci.yml` byte-for-byte. |

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| SDLC runner tests | Pass | `npm --prefix scripts test -- --runInBand` exited 0. |
| Skill exercise test | Pass | Changed skills were exercised via disposable `codex exec` runs. |
| Skill inventory audit | Pass | `node scripts/skill-inventory-audit.mjs --check` exited 0. |
| Prompt quality review | Pass | Changed skill instructions use Codex-native references, maintain unattended branches, and preserve downstream output contracts. |
| Behavioral contract review | Pass | Managed issue-form path, overwrite boundary, preservation rules, and setup/upgrade postconditions are documented and exercised. |

Gate summary: 5/5 passed, 0 failed, 0 incomplete.

---

## Fixes Applied

None.

---

## Remaining Issues

None.

---

## Recommendation

Ready for PR.
