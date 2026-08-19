# Tasks: Fix Aggregate Status Truncation of Cumulative Specs

**Issue**: #169
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Align the aggregate scope reader with the resolver limit | [x] |
| T002 | Add deterministic aggregate/direct boundary regression coverage | [x] |
| T003 | Verify lifecycle parity and unaffected boundaries | [x] |

---

### T001: Align the Aggregate Scope Reader With the Resolver Limit

**File(s)**: `scripts/issue-spec-scope.mjs`, `scripts/sdlc-status.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] The resolver's existing 262,144-byte Markdown limit is exported as the single internal source of truth without changing its value or diagnostics
- [x] Only the `readFile` adapter passed to `inspectIssueSpecScope` supplies that scope-specific limit to `readBounded`
- [x] The 65,536-byte `readBounded` default and 32,768-byte discovery override remain unchanged
- [x] No public status field, scope schema, reason code, or runtime dependency changes

**Notes**: Address the incorrect injected adapter, not the resolver or user documents. Preserve all existing path, symlink, regular-file, and size validation.

### T002: Add Deterministic Aggregate/Direct Boundary Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__tests__/issue-scope-contract.test.mjs`, `specs/169-fix-aggregate-status-truncation-of-cumulative-specs/feature.gherkin`
**Type**: Modify / Create
**Depends**: T001
**Acceptance**:
- [x] A disposable cumulative fixture grows beyond 65,536 bytes while remaining within 262,144 bytes
- [x] A mapped task identifier occurs after byte 65,536 and appears in both direct and aggregate inventory and delivery results
- [x] The complete normalized direct and aggregate scope results agree with `status: scoped` and no gaps
- [x] Aggregate lifecycle inference recommends `$nmg-sdlc:write-code #20`, not `$nmg-sdlc:write-spec`
- [x] The same disposable document above 262,144 bytes returns `unverifiable` / `spec_read_failed` with the existing inspection-limit diagnostic
- [x] The test would fail when the aggregate adapter falls back to 65,536 bytes
- [x] The static status integration contract requires both `inspectIssueSpecScope` and `ISSUE_SPEC_MARKDOWN_LIMIT_BYTES`

**Notes**: Generate padding only in the temporary repository created by the existing test helper. Do not commit a large fixture artifact.

### T003: Verify Lifecycle Parity and Unaffected Boundaries

**File(s)**: `scripts/__tests__/issue-spec-scope.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `scripts/issue-spec-scope.mjs`, `scripts/sdlc-status.mjs`
**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [x] Focused issue-scope and status suites pass (3 suites, 57 tests)
- [x] The full Jest suite passes without unexpected new skips (33 suites, 323 tests, 12 intentional skips)
- [x] Node syntax checks pass for both changed runtime modules
- [x] Skill inventory remains clean because no active plugin contract surface changed (453 items)
- [x] `git diff --check` passes and the scoped diff contains no unrelated files
- [x] Each AC1-AC3 and FR1-FR3 has direct code or test evidence

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #169 | 2026-08-14 | Initial defect task plan |

---

## Completion Checklist

- [x] T001 complete
- [x] T002 complete
- [x] T003 complete

---

## Validation Checklist

- [x] Tasks are limited to the resolver constant, aggregate adapter, regression, and verification
- [x] Regression coverage is included and tagged `@regression`
- [x] Every task has verifiable acceptance criteria
- [x] Dependencies are linear and acyclic: T001 -> T002 -> T003
- [x] File paths match the current repository structure
- [x] No skill-bundled file requires `$skill-creator`
