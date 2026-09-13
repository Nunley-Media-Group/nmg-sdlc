# Tasks: Reject non-canonical spec File(s) before worker dispatch

**Issue**: #379
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Share parser, location errors, empty glob/dir | [ ] |
| T002 | Publish + execute preflight gates | [ ] |
| T003 | Authoring contract, public docs, templates, upgrade rewrite | [ ] |
| T004 | Regression tests for AC1–AC6 | [ ] |
| T005 | Verify recovered smoke delivery by exact invocation proof | [ ] |

---

### T001: Fix the Defect — shared File(s) grammar and diagnostics

**File(s)**: `scripts/sdlc-safe-recoveries.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `publicationFileEntries` remains the only File(s) grammar and still rejects prose without mining paths
- [ ] `parseDeliveryTaskFileLines` and `PUBLICATION_FILE_SYNTAX` are exported
- [ ] Syntax failures include spec, taskId, line, entry, syntax
- [ ] Empty glob/directory expansion is `publication_scope_unproven` even when spec-owned paths exist
- [ ] Bind stderr first line is still the reasonCode; unproven appends location lines
- [ ] Reconcile/push/lease behavior is unchanged

**Notes**: Follow the fix strategy from design.md. Keep changes minimal.

### T002: Gate publish and execute before workers

**File(s)**: `scripts/sdlc-execute.mjs`, `scripts/publish-approved-spec.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] commit-push and merge fail `publication_scope_unproven` with location fields before git add / PR when delivery File(s) are invalid
- [ ] Publish uses parse-only (no git expansion) so missing literal paths are allowed
- [ ] Execute calls `inspectPublicationScope` for implement after Approved check and before any `paneSplit`
- [ ] Preflight failure creates zero Herdr panes and does not call bind

**Notes**: Import inspect/parse from sdlc-safe-recoveries.mjs only.

### T003: Authoring contract, public documentation, and upgrade rewrite

**File(s)**: `README.md`, `scripts/sdlc-upgrade.mjs`, `scripts/spec-created-label.mjs`, `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/templates/tasks.md`, `workflows/upgrade-project/WORKFLOW.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] README states the canonical File(s) grammar, rejects prose-prefixed declarations, and documents the pre-dispatch diagnostic fields
- [ ] Write-spec workflow forbids prose File(s) and requires the shared grammar
- [ ] Every template `**File(s)**:` example value is accepted by `publicationFileEntries`
- [ ] Upgrade detects `publication-files:<digest>` with exact rewrites; apply is stale-safe; mixed unsafe quotes are findings
- [ ] upgrade-project WORKFLOW lists detector 12
- [ ] skill-bundled workflow/template edits go through `skill://skill-creator`

**Notes**: Live parser must not start accepting prose because upgrade exists.

### T004: Add Regression Tests

**File(s)**: `scripts/__tests__/sdlc-safe-recoveries.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/__tests__/sdlc-upgrade.test.mjs`
**Type**: Modify
**Depends**: T001, T002, T003
**Acceptance**:
- [ ] Coverage listed in Verification of this plan exists and fails if the bug returns
- [ ] Existing valid publication-scope and bind cases remain green
- [ ] Execute prose File(s) fixture records zero paneSplit calls
- [ ] Upgrade apply of `Create \`src/a.ts\`` yields canonical quoted path and a second detect is empty

### T005: Preserve proof-first smoke classification

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `scripts/sdlc-execute.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/sdlc-verify-steering.mjs`, `src/sdlc-verification-runtime.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/sdlc-verification-runtime.test.mjs`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- [ ] State is outside the checkout and keyed by stable outer run/project/spec/issue; validation/config/queue/baseline/clone identities are immutable and report dirtiness cannot change lookup
- [ ] Nested verify receives `NMG_SDLC_SMOKE_OWNED=1` plus a separate validated recovery token; bare/mismatched ownership fails
- [ ] Delivery proof carries exact nested runId/issue/PR/head; zero-exit accepts absent post-cleanup run.json but rejects present invalid/mismatched run state
- [ ] Initial nonzero without exact proof remains failed; same-call exact proof or same-run later recovery continues only from the original baseline/clone/invocation
- [ ] Recovered final head binds to the same run/issue/PR, consumed post-merge evidence, passed verified-head artifact, identity-bound recovery session, and expected-head ancestry before bounded remote MERGED/CLOSED proof
- [ ] First success persists cleanup-pending proof before clone cleanup; cleanup failure is incomplete and retries only cleanup; terminal-clean reruns validate remotely without clone/queue recreation
- [ ] Missing, historical, unrelated, newly configured, non-ancestor, or tampered run/PR/head/baseline/config/terminal evidence never passes

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T004)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)

## Change History

| Issue | Date | Summary |
|---|---|---|
| #379 | 2026-09-13 | Initial defect report |
| #379 | 2026-09-13 | Spec revised before delivery: authorized README grammar and pre-dispatch diagnostics documentation in T003 |
| #379 | 2026-09-13 | Pre-delivery review1 scope amendment: authorized spec-created label backfill changes in T003 and clarified retained-worker, bounded-glob, upgrade annotation, ambiguity, invalid-package, and CRLF regressions without changing approved intent |
| #379 | 2026-09-13 | Verification remediation added T005 for the proof-first mutable smoke gate |
