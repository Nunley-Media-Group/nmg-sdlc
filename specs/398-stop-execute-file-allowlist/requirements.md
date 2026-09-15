# Defect Report: Stop execute File(s) allowlisting

**Issue**: #398
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG

---

## Reproduction

1. Run PathCast issue #81 at the `fix1` apply-review stage with an Approved spec whose task `**File(s)**` declarations name only the initially anticipated product paths.
2. Leave additional required tests and `specs/81-stale-displayroute-error/verification-report.md` dirty after applying review findings.
3. Publish the applied review.
4. Observe `apply_review_failed` with `Review fixes exceed approved task scope`, even though the extra files are valid evidence or product paths required to satisfy the Approved outcomes.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Implement and fix workers may publish every valid, non-denied product, test, and current-issue verification-report path needed to satisfy Acceptance. Task `**File(s)**` declarations remain optional planning hints. |
| **Actual** | Execute treats parsed task `**File(s)**` as a closed mutation allowlist, so incomplete or missing declarations block dispatch and publication independently of the Approved outcomes. |

## Acceptance Criteria

### AC1: Outcome-based implement and fix scope

**Given** a singular Approved spec whose tasks omit `**File(s)**` or list only a subset of later changes
**When** implement dispatch or `inspectPublicationScope({ step: 'implement' | 'fix1' | 'fix2' })` evaluates the spec
**Then** missing or incomplete task file hints do not cause `publication_scope_unproven`
**And** scope uses outcome mutation policy while retaining any parsed paths as optional hints

### AC2: Apply-review publishes required valid paths

**Given** an applied review dirties additional valid product or test paths and the current issue `verification-report.md`
**When** apply-review publishes with `--applied`
**Then** it commits every observed non-denied path and reconciles against that observed set
**And** the failure summary `Review fixes exceed approved task scope` no longer exists

### AC3: Denied paths still fail closed

**Given** a publication contains one of the current spec's four inputs, another `specs/` path, an `.omp/` path, or any path rejected by `validPublicationPath`
**When** implement or fix publication is inspected
**Then** publication fails closed and identifies the denied path
**And** only the current spec's `verification-report.md` is exempt from the general `specs/` denial

### AC4: Scope JSON distinguishes policy from hints

**Given** implement, fix1, or fix2 publication scope
**When** scope inspection or the owner-bound probe succeeds
**Then** scope includes `mutationPolicy: "outcome"`
**And** `allowedPaths` is the optional parsed hint union or `[]`, never a mutation ceiling
**And** `readOnlyPaths` always contains the four current spec inputs

### AC5: Reconciliation proves observed publication

**Given** implement, fix1, or fix2 creates an ahead commit
**When** `reconcileStagePublication` validates it
**Then** every commit path is valid, non-denied, and present in the observed stage path set supplied as `allowedPaths`
**And** recorded evidence `allowedPaths` equals the observed commit path set
**And** verify remains closed to the current verification report while deliver retains explicit artifact lists

### AC6: Worker and public contracts follow outcomes

**Given** an Approved spec and its Acceptance criteria
**When** write-code, write-spec, or public execute documentation describes mutation scope
**Then** write-code may mutate any required non-denied path, never a `readOnlyPaths` entry
**And** write-spec may emit canonical `**File(s)**` hints but does not require them for executability
**And** `/sdlc-upgrade-project` publication-files rewriting may continue canonicalizing optional hints without becoming an execute gate

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Classify denied publication paths centrally with spec and read-only context | Must |
| FR2 | Return outcome mutation policy and optional parsed task hints for implement and fix steps | Must |
| FR3 | Publish and reconcile applied-review changes from observed non-denied paths | Must |
| FR4 | Accept missing task File(s) during execute preflight and repaired-publication probing | Must |
| FR5 | Preserve verify, deliver, and review-isolation closed path contracts | Must |
| FR6 | Document File(s) as optional hints and outcome mutation as deny-list constrained | Must |
| FR7 | Keep historical specs #379, #383, and #390 unchanged on disk | Must |

## Out of Scope

- Changing review-isolation slice assignments derived from git diffs
- Changing `validPublicationPath`
- Removing the upgrade publication-files canonicalization detector
- Editing or executing PathCast issue #81
- Rewriting historical specs #379, #383, or #390

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #398 | 2026-09-14 | Initial approved defect report |
