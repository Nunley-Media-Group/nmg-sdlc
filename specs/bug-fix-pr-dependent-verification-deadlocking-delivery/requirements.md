# Defect Report: Fix PR-Dependent Verification Deadlocking Delivery

**Issue**: #171
**Date**: 2026-08-14
**Status**: Investigating
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: `specs/feature-open-pr-skill/`

---

## Reproduction

### Steps to Reproduce

1. Implement an issue whose acceptance criteria require a named pull-request check and proof that missing or failing required checks block merge.
2. Complete the active issue scope, implementation tasks, local tests, and every applicable local verification gate.
3. Run `$nmg-sdlc:verify-code #N` before a pull request exists.
4. Observe that the unavailable PR-only evidence keeps the report non-Pass.
5. Run `$nmg-sdlc:open-pr #N` and observe that delivery rejects the non-Pass report before it can create the pull request needed to produce the remaining evidence.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS, Codex plugin workflow, GitHub pull requests |
| **Version / Commit** | nmg-sdlc 2.0.7 at `45a0230ba3aea9080e16f30fee464975b0171fb7` |
| **Browser / Runtime** | Codex, Node.js 20+, authenticated GitHub CLI |
| **Observed Consumer** | Nunley-Media-Group/pathcast issue #122 |

### Frequency

Always when full verification requires evidence that cannot exist until a pull request and its exact head-SHA checks exist.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Locally complete, issue-scoped work with only explicitly qualified PR-only evidence pending enters a controlled draft pull request. The lifecycle gathers exact-SHA evidence, reruns verification, checks the final pushed SHA, and marks the PR review-ready only after full verification succeeds. |
| **Actual** | Verification cannot report Pass without the PR-only evidence, while delivery refuses every non-Pass report before creating a PR. The lifecycle deadlocks or requires an unsafe manual bypass. |

### Error Output

```text
verify-code: Implementation Status: Partial
Remaining evidence: required pull-request check and merge-blocking proof
open-pr: verification status is not Pass — delivery blocked
```

---

## Acceptance Criteria

### AC1: Represent PR-Dependent Readiness Explicitly

**Given** the active issue scope, implementation tasks, acceptance behavior, local tests, regression obligations, and every applicable local verification gate pass
**And** the only remaining evidence is an enumerated GitHub result that cannot exist before a pull request
**When** verification records the current lifecycle state
**Then** it emits a distinct machine-readable `pr_evidence_pending` readiness state
**And** it records the exact pending evidence without labeling generic Partial work as ready

### AC2: Preserve Fail-Closed Local Verification

**Given** any implementation task, acceptance criterion, regression obligation, scope marker, local test, or applicable steering gate fails or is incomplete
**When** `verify-code`, `status`, or `open-pr` evaluates readiness
**Then** the work remains Partial, Incomplete, Fail, stale, mismatched, or otherwise non-deliverable
**And** no draft-pull-request exception is inferred from prose or a generic non-Pass status

### AC3: Restrict Qualifying Evidence to GitHub-Only Results

**Given** a verification report names pending evidence
**When** the PR-dependent readiness state is validated
**Then** only bounded `required_check`, `check_run`, or `merge_blocking` evidence that is impossible before pull-request creation can qualify
**And** arbitrary project-declared exceptions, deferred local work, unknown evidence kinds, and unrecognized marker fields fail closed

### AC4: Keep Lifecycle Consumers Consistent

**Given** a current scoped verification report contains valid PR-dependent readiness
**When** `$nmg-sdlc:status` inspects the project
**Then** it reports local verification as complete and delivery validation as pending
**And** it recommends the controlled `$nmg-sdlc:open-pr #N` transition without claiming full Pass or completed delivery

### AC5: Create a Controlled Draft Pull Request

**Given** PR-dependent readiness is valid
**When** `$nmg-sdlc:open-pr` prepares delivery
**Then** existing scope, versioning, commit, rebase, safe-push, and pushed-state checks remain mandatory
**And** the workflow creates or reuses only an exact matching draft pull request
**And** the pull request is not treated as review-ready or merge-ready at that boundary

### AC6: Capture Exact Pull-Request Evidence

**Given** the controlled draft pull request exists
**When** its required workflows and repository protections are evaluated
**Then** the lifecycle records the exact head SHA, required check names, conclusions, evidence links, and declared merge-blocking observations
**And** stale, mismatched, absent, failed, cancelled, unknown, or timed-out evidence cannot satisfy a pending requirement

### AC7: Reverify the Final Delivery State

**Given** the required PR-only evidence succeeds for the draft head
**When** verification reruns against that draft pull request
**Then** it produces current issue-scoped Pass evidence tied to the observed head SHA
**And** any verification-report update is committed and pushed
**And** all required checks are evaluated again for the resulting final head SHA before readiness advances

### AC8: Preserve Review and Merge Safety

**Given** final verification and final-head-SHA checks pass
**When** delivery advances beyond the draft boundary
**Then** the pull request may be marked ready for review
**And** existing automated-review, required-check, mergeability, `mergeStateStatus == CLEAN`, explicit merge-choice, and cleanup gates remain in force
**And** repository or organization protection is never weakened or bypassed

### AC9: Recover Safely From Delivery Validation Failure

**Given** a check fails, times out, disappears, changes identity, conflicts with the recorded scope, or produces malformed evidence
**When** the two-phase delivery flow stops
**Then** the feature branch and draft pull request remain available for correction
**And** no merge, branch deletion, false Pass report, ready-for-review transition, or protection mutation occurs

### AC10: Exercise the Deadlock and Regression Boundary

**Given** a deterministic fixture reproduces the PathCast #122 PR-dependent evidence boundary
**And** companion fixtures contain generic Partial, failed-gate, stale-scope, and ordinary Pass reports
**When** the complete verification-to-delivery contract is exercised
**Then** only the qualified PR-dependent case advances to controlled draft delivery
**And** ordinary Pass delivery behavior and every fail-closed regression remain intact

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Define one shared, schema-versioned PR-dependent verification contract consumed by `verify-code`, `status`, and `open-pr`. | Must |
| FR2 | Validate the report marker deterministically against the active issue-scope marker, complete local evidence, all-pass local gates, bounded fields, and an allowlist of GitHub-only evidence kinds. | Must |
| FR3 | Preserve generic non-Pass reports, local failures, failed or incomplete gates, stale evidence, malformed markers, and scope mismatches as delivery blockers. | Must |
| FR4 | Add a controlled draft creation/reuse path that gathers exact-SHA evidence, reverifies, pushes any report update, rechecks the final SHA, records final evidence, and marks the PR ready only on success. | Must |
| FR5 | Extend read-only lifecycle status to distinguish local verification completion from pending delivery validation and to expose draft/head evidence without mutation. | Must |
| FR6 | Add deterministic contract, status, delivery, and regression fixtures plus public workflow documentation. | Must |

---

## Out of Scope

- Fixing PathCast issue #122 implementation, Tilt, bounded-I/O, BDD ownership, or product-spec gaps
- Allowing arbitrary project-defined evidence, deferred local work, or prose to bypass verification
- Treating generic Partial, Incomplete, or Fail as draft-deliverable
- Weakening, deleting, or bypassing repository or organization rulesets and required checks
- Changing GitHub's required-check, draft-review, mergeability, or ruleset semantics
- Automatically merging before final verification and the existing explicit review/merge gates
- Adding non-GitHub delivery providers or multi-repository orchestration

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #171 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction identifies the circular verification-to-delivery dependency
- [x] Expected and actual behavior distinguish controlled draft delivery from a generic non-Pass bypass
- [x] Severity reflects a deterministic blocker for otherwise complete delivery
- [x] All ten acceptance criteria preserve the issue's approved scope and use Given/When/Then form
- [x] Qualifying remote evidence kinds and fail-closed local boundaries are explicit
- [x] Exact-SHA reverification, final-SHA checks, review safety, and failure preservation are specified
- [x] Regression coverage requires qualified pending, generic non-Pass, failed-gate, stale-scope, and ordinary Pass fixtures
- [x] Out-of-scope boundaries exclude consumer fixes, protection changes, and non-GitHub providers
