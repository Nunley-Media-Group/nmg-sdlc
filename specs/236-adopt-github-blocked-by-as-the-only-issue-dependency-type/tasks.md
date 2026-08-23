# Tasks: GitHub blocked-by as the sole issue dependency

**Issue**: #236
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Graph core | 2 | [ ] |
| Workflow integration | 4 | [ ] |
| Verification | 2 | [ ] |
| **Total** | 8 | |

---

### T001: Build official blocked-by client

**File(s)**: `scripts/issue-dependencies.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Reads complete paginated `dependencies/blocked_by` responses through explicit `gh api` argv
- [ ] Normalizes positive database ids, issue numbers, states, and active-repository identity
- [ ] POSTs numeric `issue_id` values and fails closed on transport, parse, pagination, or repository mismatch
- [ ] Supports injected runners without live GitHub mutation in tests

### T002: Implement graph validation and edge application

**File(s)**: `scripts/issue-dependencies.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Recursively loads blockers, treats closed blockers as satisfied, and keeps independent issues eligible
- [ ] Rejects dangling targets and deterministic open-issue cycles with stable evidence
- [ ] Preflights merged current/proposed graphs before the first write
- [ ] Applies idempotently and rolls back only newly added edges on partial failure

### T003: Migrate draft-issue to official edges

**File(s)**: `workflows/draft-issue/WORKFLOW.md`, `workflows/draft-issue/references/multi-issue.md`, issue templates and creation helpers/tests
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Approved plan entries carry stable plan ids and explicit blockedBy references
- [ ] Split topology and clearly named existing precursors produce official edges without another ask
- [ ] Issue creation resolves returned numbers/database ids, preflights, then applies edges
- [ ] New issue bodies contain no generated `Depends on:` or `Blocks:` lines

### T004: Add full-repository upgrade reconciliation

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/WORKFLOW.md`, upgrade references/tests
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Upgrade screens every open and closed issue plus every official blocked-by list
- [ ] Closed legacy grammar yields proposed official edges; ambiguous prose yields findings only
- [ ] Combined graph is validated before proposal and rechecked by digest before apply
- [ ] Existing body text is preserved and no edge is written before approved apply

### T005: Filter execute selection and explicit runs

**File(s)**: `scripts/sdlc-execute.mjs`, execute workflow and tests
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] No-argument picker contains only unblocked, acyclic, readable, non-Done `spec-created` issues
- [ ] Zero eligible issues print `No open spec-created issues.` and show no picker
- [ ] Dependency read failure stops before a picker
- [ ] Explicit issue validation occurs before run-state or worker mutation
- [ ] Serial lifecycle, approval gate, and lowest-number backlog ordering stay unchanged

### T006: Migrate start and status to shared evidence

**File(s)**: `scripts/start-issue.mjs`, `scripts/sdlc-status.mjs`, controller/status tests
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Start refuses open, dangling, cyclic, or unreadable graphs before Git/project mutation
- [ ] Status reports the same blocked/unknown reason and evidence
- [ ] Neither path parses `Depends on:` or `Blocks:` for runtime decisions

### T007: Remove dual dependency contracts

**File(s)**: `scripts/epic-relationships.mjs`, `README.md`, `CONTRIBUTING.md`, `steering/*.md`, draft/onboard/upgrade references, fixtures
**Type**: Modify
**Depends**: T003-T006
**Acceptance**:
- [ ] Body relation parser is removed from production runtime consumers and is legacy-upgrade-only if retained
- [ ] Current product documentation names official blocked-by as the sole dependency type
- [ ] Spike, epic, sub-issue, and body-edge language is removed as current sequencing guidance
- [ ] CHANGELOG Unreleased records the user-visible cutover

### T008: Run full regression and adapter smoke

**File(s)**: `scripts/__tests__/issue-dependencies.test.mjs` and affected suites
**Type**: Create/Modify
**Depends**: T007
**Acceptance**:
- [ ] Full scripts Jest suite and plugin-surface verification pass
- [ ] Injected GitHub fixtures cover pagination, cycles, dangling targets, closed blockers, unreadable evidence, rollback, and plan drift
- [ ] Draft, upgrade, execute, start, and status exercise one shared graph contract
- [ ] Production search finds no body-derived dependency decision outside the legacy upgrade detector

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #236 | 2026-08-23 | Initial feature spec |
