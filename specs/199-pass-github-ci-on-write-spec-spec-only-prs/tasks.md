# Tasks: Pass GitHub CI on write-spec spec-only PRs

**Issue**: #199
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/125-add-github-actions-contribution-gates-to-project-setup/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add spec-only reduced mode and bump managed gate to version 6 | [ ] |
| T002 | Allow extra approved spec packages in `verify-current-specs.mjs` | [ ] |
| T003 | Add regression tests for AC1–AC4 | [ ] |

---

### T001: Add spec-only reduced mode (managed version 6)

**File(s)**: `references/contribution-gate.md`, `.github/workflows/nmg-sdlc-contribution-gate.yml`, `references/contribution-guide.md`, `CONTRIBUTING.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Managed marker version is `6` in the constants table, embedded template, and live workflow
- [ ] Live workflow bytes equal the fenced yaml template plus a trailing newline
- [ ] `writeSpecOnlyEligible` matches the design predicate exactly
- [ ] `reducedMode` can be `spec-only`; that mode skips steering-alignment and specific-verification failures only
- [ ] Missing steering artifact files and missing `CONTRIBUTING.md` still fail
- [ ] `docs-only` still fails when any changed path is spec or source
- [ ] Guide tables in `references/contribution-guide.md` and `CONTRIBUTING.md` include the spec-only row

**Notes**: Follow the Fix Strategy in design.md. Do not classify spec paths as documentation.

### T002: Allow extra approved spec packages

**File(s)**: `scripts/verify-current-specs.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `verifySpecArchive` is exported and used by `verifyCurrentSpecs`
- [ ] Extra well-formed approved `specs/{N}-{slug}/` directories do not fail the archive check
- [ ] Missing `CURRENT_SPEC_DIRECTORIES` entries still fail
- [ ] `feature.gherkin` accepts `**Issue**: #N` or `# Issue: #N`
- [ ] `CURRENT_SPEC_DIRECTORIES` length remains 16; do not add this package to that allowlist

**Notes**: A write-spec PR cannot update the allowlist.

### T003: Add regression tests

**File(s)**: `scripts/__tests__/exercise-contribution-gate.test.mjs`, `scripts/__tests__/contribution-gate-contract.test.mjs`, `scripts/__tests__/current-specs.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] `CURRENT_VERSION` and version-string assertions are `6`
- [ ] Evaluator test: title `docs: approve spec for #42`, body exactly `Approved specification package for #42.\n\nThis pull request publishes the spec only.`, changed paths the four files under `specs/42-add-x/`, no steering/verification text → `errors` empty and info contains `validated spec-only reduced-evidence contract`
- [ ] Evaluator test: same spec-only paths with `SDLC-Exception: docs-only — publish the spec` → still contains `Invalid docs-only exception` and `invalidating paths` naming a spec path
- [ ] Evaluator test: `normalScenario()` with verification stripped (`verification: ''` and no report) still contains `Missing specific verification`
- [ ] `verifySpecArchive` temp-dir test: required `1-foo` plus extra `199-bar` both four-file Approved with gherkin `**Issue**: #199` → `[]`
- [ ] `verifySpecArchive` temp-dir test: extra `199-bar` missing `tasks.md` → error `Missing 199-bar/tasks.md`
- [ ] `verifySpecArchive` temp-dir test: archive gherkin `# Issue: #1` still passes identity
- [ ] `cd scripts && npm test` exits 0

---

## Validation Checklist

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
