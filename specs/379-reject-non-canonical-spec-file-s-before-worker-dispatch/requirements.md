# Defect Report: Reject non-canonical spec File(s) before worker dispatch

**Issue**: #379
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

---

## Reproduction

1. Approve a spec whose delivery task declares `**File(s)**: Create \`src/a.ts\``.
2. Treat the issue as spec-created / executable.
3. Run `/sdlc-execute #N` so the implement worker starts.
4. The worker runs `node scripts/sdlc-safe-recoveries.mjs bind --issue N --step implement --spec specs/N-SLUG` before edits.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Invalid **File(s)** is rejected during spec validation and again in execute controller preflight, before any pane or worker is created. The rejection is `publication_scope_unproven` and names the spec path, task ID, line number, exact invalid entry, and accepted syntax. A canonical `**File(s)**: \`src/a.ts\`` binds an allowed-path set containing only that path plus spec-owned paths. `/sdlc-upgrade-project` detects recoverable non-canonical lines in existing packages and, after approval, rewrites them to that grammar. |
| **Actual** | Execute dispatches the implement worker. Bind then fails with stderr `publication_scope_unproven` and no location. `/sdlc-write-spec` can publish the same syntax. Existing packages stay invalid until a human rewrites them. |

## Acceptance Criteria

### AC1: Invalid prose is rejected before workers

**Given** an Approved spec whose delivery task declares `**File(s)**: Create \`src/a.ts\``
**When** spec validation or execute controller preflight runs
**Then** the issue is not treated as executable, no pane or worker is created, and the failure is `publication_scope_unproven` with spec path, task ID, line number, exact invalid entry, and accepted syntax

### AC2: Canonical literal path binds

**Given** an Approved spec whose delivery task declares only `**File(s)**: \`src/a.ts\``
**When** publication scope is bound
**Then** the allowed-path set contains only that path plus spec-owned paths

### AC3: Bounded glob or directory for generated steps

**Given** a documented bounded repository-relative glob or directory declaration for generated BDD step files
**When** publication scope is bound
**Then** matching files under that declaration are authorized and unrelated files remain unauthorized

### AC4: Write-spec cannot emit parser-rejected File(s)

**Given** `/sdlc-write-spec` producing an Approved `tasks.md`
**When** the installed publication File(s) parser reads every delivery-task **File(s)** line
**Then** every declaration is accepted by that parser

### AC5: No regression of valid declarations

**Given** currently valid quoted paths, comma/semicolon lists, supported globs/directories, delivery-owner-only annotations, existing valid specs, and existing safe-recovery publication tests
**When** the grammar is shared and the new gates run
**Then** those cases remain green and authorization stays fail-closed

### AC6: Upgrade rewrites recoverable existing File(s)

**Given** an issue-owned `specs/{N}-{slug}/tasks.md` whose delivery-task **File(s)** line is rejected by `publicationFileEntries` but contains only backtick-quoted valid repository-relative paths plus surrounding prose
**When** `/sdlc-upgrade-project` detects and the operator approves `publication-files:<digest>`
**Then** those lines are rewritten to canonical **File(s)** declarations the shared parser accepts
**And** mixed unsafe quoted spans and unquoted prose-only lines are findings, not silent extracts
**And** a changed tree after approval fails `publication_files_plan_stale` without mutation
**And** the live parser still rejects the original prose without upgrade

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Share one canonical **File(s)** grammar across authoring, validation, publication binding, and upgrade rewrite | Must |
| FR2 | Fail closed: no prose mining in the live parser and no implicit scope broadening | Must |
| FR3 | `/sdlc-write-spec` emits only canonical **File(s)** declarations | Must |
| FR4 | Validate delivery-task **File(s)** before spec-created/executable and again before worker dispatch | Must |
| FR5 | `publication_scope_unproven` reports spec path, task ID, line, exact invalid entry, and accepted syntax | Must |
| FR6 | Preserve compatibility with currently valid quoted paths, lists, globs/directories, and delivery-owner-only annotations | Must |
| FR7 | Deterministic regression coverage listed in the test plan | Must |
| FR8 | Workflow and reference docs state the canonical **File(s)** syntax | Must |
| FR9 | `/sdlc-upgrade-project` detects and, after approval, rewrites recoverable existing **File(s)** lines; unrecoverable lines are findings | Must |

## Out of Scope

- Making invalid prose succeed by extracting embedded paths in the live parser or bind path
- Epic or spike types
- Changing stage-publication reconcile/push ownership beyond shared parse, diagnostics, preflight timing, and the upgrade rewrite
- Rewriting consumer specs during #379 implementation; upgrade after approval is the repair path, including packages such as `specs/81-stale-displayroute-error/`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #379 | 2026-09-13 | Initial defect report |
