# Tasks: Fix nmg-sdlc steering and skill-contract documentation drift

**Issue**: #142
**Date**: 2026-07-31
**Status**: Investigating
**Author**: Rich Nunley
**Related Spec**: `specs/feature-setup-steering-skill/`

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Correct repo steering contracts | [ ] |
| T002 | Add steering drift regression coverage | [ ] |
| T003 | Verify documentation and contract consistency | [ ] |

---

### T001: Correct Repo Steering Contracts

**File(s)**: `steering/product.md`, `steering/tech.md`, `steering/structure.md`
**Type**: Modify
**Depends**: None
**Acceptance**:

- [ ] `steering/product.md` identifies the product as `nmg-sdlc` in its heading and mission.
- [ ] `steering/tech.md` identifies this repository as `nmg-sdlc` in its heading and self-references.
- [ ] `steering/tech.md` describes active SKILL.md frontmatter and reusable agent prompt contracts without claiming `allowedTools` or unsupported execution-control fields.
- [ ] The unfilled database standards section is removed from `steering/tech.md`.
- [ ] `steering/structure.md` identifies this repository as `nmg-sdlc` and uses the standalone repository URL in its manifest example.
- [ ] The unfilled UI/design-token section is removed from `steering/structure.md`.
- [ ] Intentional `nmg-plugins` marketplace, installed-cache, and legacy-layout references remain unchanged.
- [ ] Generic onboarding templates and historical specs remain unchanged.
- [ ] No unrelated documentation or runtime changes are included.

**Notes**: Use `.codex-plugin/plugin.json`, active `skills/*/SKILL.md`, active `agents/*.md`, and shared Codex tooling references as the evidence for each corrected claim. Do not edit skill-bundled files under this task.

### T002: Add Steering Drift Regression Coverage

**File(s)**: `scripts/__tests__/steering-contract.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:

- [ ] The test follows the existing ESM/Jest contract-test pattern and uses only Node.js built-ins.
- [ ] Assertions verify that repo-specific steering uses the standalone `nmg-sdlc` identity and manifest repository URL.
- [ ] Assertions reject unresolved repo-specific placeholder markers and the inapplicable database and UI/design-token sections.
- [ ] Assertions reject inactive `allowedTools` and unsupported reusable-agent execution-control claims.
- [ ] Assertions preserve intentional marketplace and legacy references by avoiding a repository-wide ban on `nmg-plugins`.
- [ ] The test passes with T001 applied and fails when any protected stale claim is reintroduced.
- [ ] The three scenarios in `feature.gherkin` remain tagged `@regression` and map one-to-one to AC1-AC3.

### T003: Verify Documentation and Contract Consistency

**File(s)**: `README.md`, `AGENTS.md`, `.codex-plugin/plugin.json`, `steering/*.md`, `skills/*/SKILL.md`, `agents/*.md`, `references/*.md`, `scripts/__tests__/steering-contract.test.mjs`
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:

- [ ] `npm --prefix scripts test -- --runInBand scripts/__tests__/steering-contract.test.mjs` passes.
- [ ] `npm --prefix scripts test -- --runInBand` passes.
- [ ] `node scripts/skill-inventory-audit.mjs` passes.
- [ ] `git diff --check` passes.
- [ ] A contextual reference sweep confirms that remaining `nmg-plugins` occurrences are intentional marketplace, installed-cache, legacy-layout, test-fixture, or historical references.
- [ ] Active skill frontmatter contains the documented fields and does not contain `allowedTools`.
- [ ] Active reusable agent prompt contracts match the corrected steering guidance.
- [ ] Each acceptance criterion has a passing `@regression` Gherkin scenario and executable contract-test coverage.
- [ ] No side effects exist outside the blast radius documented in `design.md`.

---

## Validation Checklist

- [x] Tasks are focused on the defect
- [x] Executable regression coverage is included
- [x] Each task has verifiable acceptance criteria
- [x] Dependencies form the linear T001 -> T002 -> T003 path
- [x] No scope creep beyond the approved requirements and design
- [x] File paths reference the current repository structure

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #142 | 2026-07-31 | Initial defect report |
