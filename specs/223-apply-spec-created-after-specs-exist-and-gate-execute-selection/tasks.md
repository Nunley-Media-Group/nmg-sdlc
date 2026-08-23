# Tasks: Apply spec-created after specs exist and gate execute selection

**Issue**: #223
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Label helper | 2 | [ ] |
| Write-spec | 2 | [ ] |
| Execute | 3 | [ ] |
| Onboard / upgrade | 2 | [ ] |
| Verification | 2 | [ ] |
| **Total** | 11 | |

---

### T001: Add spec-created label module

**File(s)**: `scripts/spec-created-label.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Exports `SPEC_CREATED_LABEL`, `issueHasSpecCreatedLabel`, `listIssueOwnedSpecNumbers`, `ensureRepoLabel`, `applySpecCreatedLabel`, `backfillSpecCreatedLabels`
- [ ] CLI `apply --issue N` and `backfill [--root <dir>]` print one JSON object
- [ ] Label name is exactly `spec-created`; create description is `Has an nmg-sdlc spec package`
- [ ] `gh` is invoked with program + argv only (no `sh -c`)

### T002: Cover the label helper

**File(s)**: `scripts/__tests__/spec-created-label.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Tests cover string/`{ name }` labels, unique complete packages, incomplete/ambiguous dirs, create-if-missing, idempotent add, backfill continue-on-failure

### T003: Apply the label at the end of write-spec merge

**File(s)**: `scripts/publish-approved-spec.mjs`, `workflows/write-spec/references/publish.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `mergeSpec` calls `applySpecCreatedLabel` only after default-branch checkout + ff-only pull succeed
- [ ] Success JSON includes `labeled: true`
- [ ] Label failure uses `reasonCode: spec_created_label_failed` and does not unmerge
- [ ] `prepare` / `commit-push` still do not touch labels

### T004: Extend publish merge tests and gh stub

**File(s)**: `scripts/__tests__/publish-approved-spec.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Stub `gh` accepts `label list`, `label create`, `issue view` (labels), and `issue edit --add-label spec-created`
- [ ] Successful merge test expects `labeled: true` and logs `issue edit 42 --add-label spec-created`
- [ ] New test covers post-merge label failure

### T005: Parse comma lists and add list-specified

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `parseArgs` splits on `/[\s,]+/`; empty still `{ issues: [], defaultBacklog: true }`
- [ ] `list-specified` prints open `--label spec-created` issues sorted by number
- [ ] `runExecute` no longer calls `selectBacklog` on empty args
- [ ] `backlog` CLI subcommand remains

### T006: Gate runExecute on spec-created

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] Empty args + no run.json + no labeled issues → `No open spec-created issues.\n`, no workers
- [ ] Empty args + no run.json + labeled issues exist → usage status 2, no workers
- [ ] Empty args + existing `run.json` issues → resume that list
- [ ] Mixed explicit list names each unlabeled issue and starts zero workers
- [ ] All-labeled explicit list keeps listed order and first-occurrence dedupe
- [ ] Unapproved labeled issue still prints `Run /sdlc-write-spec #N`

### T007: Empty-args picker reference and compact execute workflow

**File(s)**: `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`, `commands/sdlc-execute.md`
**Type**: Create or Modify
**Depends**: T005
**Acceptance**:
- [ ] `WORKFLOW.md` points at `references/selection.md` for empty args and does not contain `ask`
- [ ] Execute automated body UTF-8 size stays `<= 1040`
- [ ] `commands/sdlc-execute.md` equals `renderAutomatedCommandMarkdown('sdlc-execute', 'execute', 'Run automated SDLC delivery')`
- [ ] `selection.md` lists every open labeled issue in the question, max three chips + `Cancel — start nothing`, `multi: true`, then `run` with selected `#N` tokens
- [ ] Read `skill://skill-creator` before editing these workflow-bundled files

### T008: Upgrade always backfills spec-created

**File(s)**: `scripts/sdlc-upgrade.mjs`, `workflows/upgrade-project/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `applyUpgrade` always runs `backfillSpecCreatedLabels` after approved items
- [ ] No per-issue ask; not a declineable category
- [ ] Issues without a unique complete package are not labeled

### T009: Onboard backfills after writing packages

**File(s)**: `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/brownfield.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Approved brownfield/source-backfill execution runs `node scripts/spec-created-label.mjs backfill`
- [ ] Greenfield empty `specs/` still runs backfill and adds no labels
- [ ] Already-initialized onboard that does not mutate specs does not backfill

### T010: Extend execute and upgrade tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, upgrade test file that covers `applyUpgrade`
**Type**: Modify
**Depends**: T002, T006, T008
**Acceptance**:
- [ ] Fixture default `gh issue view --json …labels` returns `spec-created` for #42
- [ ] New parseArgs comma tests and runExecute cases from the design Testing section pass
- [ ] `applyUpgrade([])` still backfills a unique complete package

### T011: Run focused contract and helper tests

**File(s)**: tests listed in Verification
**Type**: Modify
**Depends**: T004, T007, T009, T010
**Acceptance**:
- [ ] Focused Jest commands in Verification exit 0
- [ ] `sdlc-execute` rendered-prompt ceiling still holds
- [ ] File-command sync test still holds

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #223 | 2026-08-23 | Initial feature spec |
