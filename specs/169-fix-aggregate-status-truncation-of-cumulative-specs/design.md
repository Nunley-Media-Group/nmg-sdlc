# Root Cause Analysis: Fix Aggregate Status Truncation of Cumulative Specs

**Issue**: #169
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

`scripts/sdlc-status.mjs:93` defines `readBounded` with a 65,536-byte default. That default is appropriate for status metadata and verification-report reads, but the active-scope integration at `scripts/sdlc-status.mjs:835-845` injects the same default reader into `inspectIssueSpecScope`. The adapter returns a successful, truncated UTF-8 string rather than a read failure, so the resolver cannot distinguish the incomplete document from a complete one.

`scripts/issue-spec-scope.mjs:16` and `:539-549` independently define and enforce a 262,144-byte Markdown limit before parsing identifiers. A direct invocation uses `readFileSync` and therefore reads every byte after the size check. Aggregate status overrides that reader with the narrower adapter, creating two different effective contracts for the same resolver. A mapped task after byte 65,536 is consequently absent only from aggregate inventory, which produces `scope_mapping_invalid` and a false repair route.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-status.mjs` | 24, 93-102, 835-845 | Imports the scope resolver, owns the general 65,536-byte bounded reader, and injects its default into aggregate scope inspection. |
| `scripts/issue-spec-scope.mjs` | 16, 500-575 | Owns the canonical scope-document size checks and direct read contract. |
| `scripts/__tests__/sdlc-status.test.mjs` | 78-100, 330-358 | Builds disposable status repositories and exercises cumulative scope integration, but only with small documents. |

### Triggering Conditions

- Aggregate status resolves an active cumulative spec and invokes `inspectIssueSpecScope` with its custom `readFile` adapter.
- At least one canonical Markdown document exceeds 65,536 bytes but does not exceed 262,144 bytes.
- A manifest-mapped identifier occurs after byte 65,536, so truncation changes the resolver inventory.
- Existing fixtures remain below 65,536 bytes, leaving adapter parity untested.

---

## Fix Strategy

### Approach

Make the resolver's existing Markdown limit the single internal source of truth by exporting a descriptively named constant from `scripts/issue-spec-scope.mjs`. Import that constant in `scripts/sdlc-status.mjs` and pass it as the explicit third argument only in the `readFile` adapter supplied to `inspectIssueSpecScope`.

Keep `readBounded`'s 65,536-byte default and the 32,768-byte discovery override unchanged. This preserves every unrelated caller while allowing the scope resolver to receive the complete content it has already validated. The resolver retains its pre-read regular-file, symlink, and 262,144-byte checks, so the broader adapter cannot authorize an oversized document.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/issue-spec-scope.mjs` | Export the existing 262,144-byte Markdown limit under an issue-scope-specific name and use that constant for the unchanged size diagnostic. | Prevents aggregate and direct readers from drifting to different effective limits without changing the resolver maximum. |
| `scripts/sdlc-status.mjs` | Import the scope Markdown limit and pass it only to the active-scope `readBounded` adapter. | Reads the complete resolver-valid document while preserving the default bound for verification reports and other status evidence. |
| `scripts/__tests__/sdlc-status.test.mjs` | Extend a disposable cumulative fixture beyond 65,536 bytes, map a late task to issue #20, compare direct and aggregate results, assert `$nmg-sdlc:write-code #20`, and then exceed 262,144 bytes to verify fail-closed behavior. | Reproduces the original lifecycle regression and pins both the lower adapter boundary and the upper resolver boundary. |
| `scripts/__tests__/issue-scope-contract.test.mjs` | Require status to import both the scope resolver and its canonical Markdown-limit constant. | Keeps the static integration contract aligned with the new single source of truth. |

### Blast Radius

- **Direct impact**: one exported constant, one status import, one explicit adapter bound, one deterministic regression test, and one updated static import contract.
- **Indirect impact**: status scope inventory and lifecycle inference become correct for resolver-valid documents between 65,537 and 262,144 bytes.
- **Unchanged paths**: spec discovery keeps its 32,768-byte requirements read; verification reports and other default readers remain at 65,536 bytes; direct resolver validation, schemas, reason codes, and output shapes remain unchanged.
- **Risk level**: Low. The larger allocation occurs only once per canonical scope document after the resolver's bounded file-size and path checks.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The shared `readBounded` default is accidentally broadened for verification or discovery. | Low | Pass the exported limit only at the `inspectIssueSpecScope` adapter call and assert unchanged call sites during review. |
| Aggregate status accepts a document above the resolver maximum. | Low | The resolver checks `lstat.size` before calling the adapter; the regression overwrites the fixture above 262,144 bytes and requires `spec_read_failed` with the existing size gap. |
| Direct and aggregate scope results still diverge on late identifiers. | Medium without coverage | Compare the complete normalized result objects and require the mapped late task in both inventories and delivery slices. |
| Large synthetic fixture content slows the suite or pollutes the repository. | Low | Generate padding only inside the existing disposable temporary repository and remove it through the test's current `afterEach` cleanup. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Raise `readBounded`'s default to 262,144 bytes | Broaden every default caller. | Violates AC2 and needlessly expands unrelated reads. |
| Remove the status read adapter | Let the resolver use its direct filesystem reader. | Breaks the status collector's injected-filesystem testability and duplicates adapter ownership assumptions. |
| Duplicate `256 * 1024` at the status call site | Pass a literal without exporting the resolver constant. | Fixes the current value but preserves the drift mechanism that caused the defect. |
| Split or rewrite consumer specs | Keep every document below 65,536 bytes. | Pushes an implementation defect onto users and is explicitly out of scope. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #169 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

- [x] Root cause identifies the narrower injected adapter and the resolver's canonical size check
- [x] Fix exports one source-of-truth constant without changing its value
- [x] Scope-specific adapter change is isolated from every unrelated bounded read
- [x] Blast radius and allocation behavior remain bounded
- [x] Regression covers direct parity, late identifiers, lifecycle action, and oversized failure
- [x] No unrelated refactoring, public schema change, or runtime dependency is introduced
