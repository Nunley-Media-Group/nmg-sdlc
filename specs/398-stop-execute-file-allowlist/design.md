# Design: Stop execute File(s) allowlisting

**Issue**: #398
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG

---

## Root Cause

`inspectPublicationScope()` reduces task `**File(s)**` declarations into `allowedPaths`, and downstream implement/fix consumers interpret that array as a closed mutation ceiling. Specs thereby prescribe anticipated file operations rather than required outcomes. Review fixes, additional tests, and current-issue verification evidence can be valid and necessary yet fail publication solely because the task hints were incomplete.

## Decisions

### Central denied-path classifier

Export `publicationPathDenied(file, { spec, readOnlyPaths })` next to `validPublicationPath` in `scripts/sdlc-safe-recoveries.mjs`. It returns true when:

1. `validPublicationPath(file)` is false;
2. `readOnlyPaths.includes(file)` is true; or
3. `file === 'specs' || file.startsWith('specs/')`, unless `file === `${spec}/verification-report.md``.

`validPublicationPath` itself remains unchanged, including its rejection of `.omp/`, URLs, and parent traversal.

### Outcome scope inspection

For `implement`, `fix1`, and `fix2`, `inspectPublicationScope` still requires a singular Approved spec and an `inspectIssueSpecScope` status of `scoped` or `implicit_single_issue`. It does not use `parseDeliveryTaskFileLines` as a throwing gate. Parsing is wrapped in `try/catch`:

- successful parsing populates `taskOperations`, hint `trackedWritablePaths`, hint `untrackedEvidencePaths`, and their union in `allowedPaths`;
- `publication_scope_unproven` or missing `**File(s)**` produces empty arrays while scope still passes;
- `mutationPolicy` is always `outcome`;
- `readOnlyPaths` always contains `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` for the current spec;
- spec paths are never added to writable hint sets except that the current verification report is publishable under the deny classifier even when omitted from task hints;
- empty hint `allowedPaths` never throws `publication_scope_unproven`.

For `verify`, the existing closed `allowedPaths: [`${spec}/verification-report.md`]` remains unchanged and `mutationPolicy` is omitted or `closed`.

### Publication and reconciliation

The safe-recoveries CLI `bind` flow inspects porcelain paths. When porcelain is nonempty, it rejects any path for which `publicationPathDenied` is true and passes the remaining observed paths to `reconcileStagePublication` as `allowedPaths`. When porcelain is empty, reconciliation uses the existing HEAD commit paths after the same deny-check.

For implement/fix1/fix2, `reconcileStagePublication` continues requiring a nonempty `allowedPaths` array of valid publication paths. These are now the observed stage paths, not task hints. Every ahead-commit path must be non-denied and present in the observed set; the observed set must equal the commit paths. Evidence stores `allowedPaths` as that observed set. `Publication commit exceeds approved scope` remains only for a denied commit path or a mismatch against the observed set.

Verify and deliver continue using their closed artifact lists. `sdlc-finalize-verification.mjs` remains unchanged with `[reportPath]`.

### Apply-review

`runApplyReviewUnlocked` retains `inspectPublicationScope` for spec identity and `readOnlyPaths`. It replaces `paths.some((path) => !allowedPaths.includes(path))` with `publicationPathDenied`. A denied path produces `apply_review_failed` naming the path, such as `Review fixes include denied path <path>`. The exact summary `Review fixes exceed approved task scope` is deleted.

On `--applied`, apply-review commits all observed porcelain paths after the deny check and passes that observed set to reconciliation. On a clean identity reconcile, it passes the HEAD commit paths. Existing skip behavior remains when porcelain is empty and identity/reconciliation already match.

### Execute and delivery consumers

Execute preflight and `probePublicationScope` continue calling `inspectPublicationScope` and succeed when `**File(s)**` is absent.

`inspectRepairedPublicationIntervention` no longer requires nonempty `probe.scope.allowedPaths`. It requires `probe.passed`, owner and branch agreement, `mutationPolicy === 'outcome'`, and all four current spec inputs in `readOnlyPaths`. Dirty-path workspace authority uses `readOnlyPaths` plus observed tracked files; any tracked non-denied path is implementation scope, including the current verification report. Empty hint paths do not mean no implementation paths exist.

Delivery mergeability still calls `inspectPublicationScope`. Under outcome policy, conflict paths may be any non-denied path; `outside` is computed with `publicationPathDenied(file, { spec, readOnlyPaths })` rather than task hint membership.

Review isolation `allowedPaths` derived from git-diff slices remains unchanged.

### Worker and documentation contracts

Write-code requires a passing owner-bound probe, treats `**File(s)**` as hints, and may edit any non-denied path needed for Acceptance. It never edits `readOnlyPaths`. Skill-bundled paths still require `skill://skill-creator`. Publication stages the actual non-runtime dirty set and reconciles with that observed set.

Write-spec keeps canonical `**File(s)**` grammar when hints are present but makes the field optional and not an executability requirement. README describes outcome policy, deny rules, and the non-authoritative nature of `allowedPaths` hints.

The upgrade-project publication-files rewrite remains available for optional hint canonicalization and is not an execute gate.

## Compatibility and Archive

Historical specs #379, #383, and #390 remain on disk as truthful records. Runtime, tests, and current documentation implement issue #398 and supersede their allowlist acceptance criteria. No compatibility alias or hidden allowlist is retained.

## Failure Modes

| Condition | Result |
|-----------|--------|
| Singular Approved spec cannot be established | Existing scope/identity failure |
| Current spec input is dirty | Denied publication failure naming the path |
| Other `specs/` path is dirty | Denied publication failure naming the path |
| `.omp/`, URL-like, parent-traversal, or otherwise invalid path appears | Existing invalid/denied publication failure |
| Observed paths differ from ahead-commit paths | `Publication commit exceeds approved scope` |
| Verify attempts any path except current verification report | Existing closed-scope failure |
| Deliver attempts a path outside its explicit artifacts | Existing closed-scope failure |

## Verification Strategy

1. Focused Jest coverage for apply-review, safe recoveries, execute, and deliver.
2. Disposable Git reproduction with absent/incomplete task File(s), extra product file, current verification report, and denied current design input.
3. `git diff --check`.
4. Workflow contract review after the required skill-creator procedure.
5. Committed verification report correlating commands and outcomes to AC1-AC6.

## Security and Portability

The deny classifier reuses repository-relative `validPublicationPath` checks and adds immutable spec/read-only boundaries. Git commands continue using argument arrays and ESM Node built-ins. No platform-specific path separator or dependency is introduced.

## Alternatives Rejected

| Alternative | Reason |
|-------------|--------|
| Expand task File(s) automatically after review | Preserves the wrong mutation-ceiling model and mutates Approved inputs |
| Add the current verification report to every task | Still blocks unanticipated valid product and test paths |
| Remove scope inspection entirely | Loses singular Approved spec identity and fail-closed denied paths |
| Treat all `specs/` paths as writable | Allows workers to rewrite approval inputs or unrelated issue contracts |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #398 | 2026-09-14 | Initial approved design |
