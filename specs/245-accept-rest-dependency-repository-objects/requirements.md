# Defect Report: Accept REST dependency repository objects

**Issue**: #245
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/236-adopt-github-blocked-by-as-the-only-issue-dependency-type/

---

## Reproduction

1. In a repository whose official blocked-by edges were created successfully, run the upgrade detector against valid same-repository blockers.
2. Have `readBlockedBy` normalize a blocker whose REST payload includes `id`, `number`, open or closed `state`, `repository: { full_name: "<selected-repo>" }`, and a matching `repository_url`.
3. Observe `normalizeIssue` throw `IssueDependencyError: Invalid dependency metadata` with `reasonCode: dependency_dangling` and `edgeTarget` set to that blocker number.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Repository identity normalizes to a canonical `owner/repo` string for GraphQL `repository.nameWithOwner`, REST `repository.full_name`, string-valued `repository`, `repository_url`, and the selected-repository fallback. Same-repository open or closed blockers are accepted. Cross-repository identities still fail closed. `dependency_dangling` remains for genuine dangling targets. |
| **Actual** | REST expanded `repository` objects are compared directly to the selected repository string. Valid same-repository blockers raise `dependency_dangling`. `sdlc-upgrade.mjs detect` cannot finish discovery, and post-apply detection can report `postDetectError.reasonCode: dependency_dangling`. |

## Acceptance Criteria

### AC1: Accept REST dependency repository objects

**Given** a dependency record with a positive issue ID and number, valid open or closed state, `repository.full_name` matching the selected repository, and a matching `repository_url`
**When** `readBlockedBy` normalizes the record
**Then** it returns the dependency instead of raising `dependency_dangling`

### AC2: Preserve GraphQL compatibility

**Given** a dependency record whose repository identity is supplied through `repository.nameWithOwner`
**When** the record is normalized
**Then** its repository identity is accepted exactly as before

### AC3: Preserve string and URL compatibility

**Given** supported records using a string-valued `repository` or a valid `repository_url`
**When** each record is normalized
**Then** the matching repository is accepted

### AC4: Reject cross-repository dependencies

**Given** any supported metadata shape that resolves to a repository other than the selected repository
**When** the record is normalized
**Then** normalization fails closed with the existing appropriate dependency error

### AC5: Detector completes with existing dependencies

**Given** a repository containing valid blocked-by edges whose REST payloads include expanded repository objects
**When** `detectIssueDependencyUpgrade` / `sdlc-upgrade.mjs detect` runs
**Then** dependency discovery completes without falsely reporting those targets as dangling

### AC6: Apply post-detection remains usable

**Given** the upgrade helper has successfully added issue dependency edges
**When** its post-apply detection runs
**Then** the added edges do not cause `postDetectError.reasonCode: dependency_dangling`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Normalize repository identity to a canonical `owner/repo` string before comparison. | Must |
| FR2 | Support `repository.nameWithOwner`, `repository.full_name`, string-valued `repository`, and `repository_url`. | Must |
| FR3 | Never compare a repository object directly with the canonical repository string. | Must |
| FR4 | Preserve strict same-repository validation. | Must |
| FR5 | Add focused regression tests for REST expanded repository objects and every existing supported metadata shape. | Must |
| FR6 | Add an integration-level detector regression covering a valid blocked-by response after dependency application. | Must |
| FR7 | Do not special-case issue #8 or the PennyScan repository. | Must |
| FR8 | Do not suppress `dependency_dangling`; fix repository identity normalization at its source. | Must |

## Out of Scope

- Rewriting GitHub issue bodies
- Removing valid dependency edges
- PennyScan repository changes
- Weakening cycle, dangling-target, or cross-repository checks
- Changing the public upgrade approval contract
- Broad GitHub client refactoring unrelated to repository identity normalization

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #245 | 2026-08-24 | Initial defect report |
