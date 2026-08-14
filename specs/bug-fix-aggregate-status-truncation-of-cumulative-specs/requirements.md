# Defect Report: Fix Aggregate Status Truncation of Cumulative Specs

**Issue**: #169
**Date**: 2026-08-14
**Status**: Fixed
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: `specs/feature-add-lifecycle-status-command-for-active-sdlc-work/`

---

## Reproduction

### Steps to Reproduce

1. Use nmg-sdlc 2.0.6 with a cumulative spec whose Markdown document is larger than 65,536 bytes and no larger than 262,144 bytes.
2. Place valid task headings after byte 65,536 and reference those task IDs from `issue-scope.json`.
3. Run `node scripts/issue-spec-scope.mjs --project <project> --spec <spec-path> --issue <N> --json`.
4. Run `node scripts/sdlc-status.mjs --project <project> --json` for the same issue branch.
5. Compare the scope inventory, classification, gaps, and lifecycle next action.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS 26.5.2 |
| **Version / Commit** | nmg-sdlc 2.0.6 at `a48c8573a0c544f064a392e5c97ef7e78b11d01f` |
| **Browser / Runtime** | Node.js v26.7.0; browser not applicable |
| **Reproduction Repository** | Nunley-Media-Group/pathcast, issue #122 |
| **Observed Document** | `tasks.md`, 86,653 bytes, with T057-T062 after the aggregate reader boundary |

### Frequency

Always when a scope manifest references valid identifiers that occur after byte 65,536 in a resolver-valid Markdown document.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Aggregate status supplies complete scope documents within the resolver's 262,144-byte Markdown limit, so its inventory, classification, gaps, and downstream action match direct scope inspection. |
| **Actual** | Aggregate status injects the 65,536-byte default `readBounded` adapter, truncates later identifiers, returns `scope_mapping_invalid`, and incorrectly recommends `$nmg-sdlc:write-spec #N`. |

### Error Output

```text
Direct scope: 62 tasks, scoped, active_issue_scope_resolved
Aggregate status: 56 tasks, scope_mapping_invalid, unknown T057-T062
Next action: $nmg-sdlc:write-spec #122
```

---

## Acceptance Criteria

### AC1: Read Complete Valid Scope Documents

**Given** a cumulative spec document larger than 65,536 bytes and no larger than the resolver's 262,144-byte Markdown limit, with valid identifiers after byte 65,536
**When** aggregate lifecycle status inspects the active issue scope
**Then** it reads every valid identifier
**And** its inventory, classification, gaps, and downstream next action match direct `issue-spec-scope.mjs` inspection

### AC2: Preserve Unrelated Bounded Reads

**Given** verification-report, discovery, and other status reads retain their existing explicit or default bounds
**When** the scope-reader fix is applied
**Then** only the adapter passed to `inspectIssueSpecScope` uses the resolver-compatible 262,144-byte bound
**And** unrelated reads do not inherit a broader global default
**And** documents above the resolver's 262,144-byte limit still fail closed with the existing size diagnostic

### AC3: Prove the Lifecycle Regression

**Given** a deterministic cumulative fixture with a valid task identifier and manifest reference after byte 65,536
**When** direct scope inspection and aggregate status inspect that fixture
**Then** both results include the late identifier and return `scoped`
**And** their inventory, classification, and gaps agree
**And** aggregate status recommends a downstream action other than `$nmg-sdlc:write-spec`
**And** the regression test fails when the aggregate scope adapter uses the 65,536-byte default

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Pass a scope-specific complete, bounded reader to `inspectIssueSpecScope` that matches its 262,144-byte Markdown contract. | Must |
| FR2 | Add deterministic aggregate-status coverage for a valid cumulative spec larger than 65,536 bytes, including a mapped identifier beyond that boundary. | Must |
| FR3 | Preserve the existing default and explicit limits for every unrelated `readBounded` consumer and the resolver's existing oversized-document rejection. | Must |

---

## Out of Scope

- Rewriting or splitting consumer-project specs to remain under 65,536 bytes
- Raising the shared `readBounded` default globally
- Changing the resolver's 262,144-byte Markdown maximum
- Implementing unrelated lifecycle, issue-scope, deliverable, or umbrella behavior changes
- Adding a new runtime dependency or changing the public status schema

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #169 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction steps identify the exact 65,536-byte aggregate boundary and 262,144-byte resolver boundary
- [x] Expected and actual behavior distinguish direct scope inspection from aggregate status
- [x] Severity reflects a deterministic false lifecycle repair route
- [x] All three acceptance criteria use Given/When/Then form
- [x] Regression coverage requires a mapped late identifier and downstream lifecycle action
- [x] Unrelated reader bounds and oversized-document failure remain explicit invariants
- [x] Fix scope is minimal and excludes feature work
