# Defect Report: Prevent Spec-Only Publication from Closing Umbrella Issues

**Issue**: #161
**Date**: 2026-08-14
**Status**: Fixed
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. Create an umbrella issue with planned child implementation work and create its linked sealing branch with GitHub's issue-development flow.
2. Complete the multi-PR Seal-Spec Flow on that linked branch.
3. Open the specification-only publication pull request from the same linked branch with `Refs #N` and the canonical umbrella marker in its body.
4. Merge the publication pull request into the default branch.
5. Inspect the umbrella issue and its timeline while required children remain open.
6. Observe that GitHub records the publication pull request as the closing pull request and closes the umbrella despite the non-closing body wording.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | GitHub pull requests, linked branches, issue closing references, and issue timelines |
| **Version / Commit** | nmg-sdlc 2.0.1 at `aa98ce66fd77d389eaac90b5f90d8fe62e2feb4b` |
| **Reproduction Repository** | Nunley-Media-Group/pathcast, umbrella issue #108 and spec publication PR #125 |
| **Observed Evidence** | PR #125 used `Refs #108`; its `closingIssuesReferences` contained #108 and issue #108 received a `ClosedEvent` whose closer was PR #125 at merge |

### Frequency

Deterministic when the publication pull request uses a branch that GitHub linked to the umbrella issue through the issue-development workflow. Body wording alone does not remove that branch association.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The exact approved umbrella spec is published through a pull request that has no closing relationship to the umbrella. Before merge, the workflow proves the pull request is non-closing. After merge, it proves the umbrella is still open while coordination remains. If a prior publication closed the umbrella, the workflow reports exact pull-request and timeline evidence and offers a narrowly approval-gated reopen. |
| **Actual** | The Seal-Spec Flow opens the publication pull request from the issue-linked sealing branch and trusts `Refs #N`. GitHub can still include the umbrella in `closingIssuesReferences`, close it at merge, and leave the workflow claiming a successful canonical transition while required children remain open. |

### Error Output

No plugin error is currently produced. The defect appears as a closed umbrella issue, a publication pull request that includes the umbrella in `closingIssuesReferences`, and a timeline `ClosedEvent` tied to that pull request.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Publication PRs Are Non-Closing

**Given** an open umbrella has incomplete child work
**When** the workflow creates a specification-only publication pull request
**Then** the pull request is configured so merging it does not close the umbrella

### AC2: The Umbrella Remains Open After Merge

**Given** a specification-only publication pull request for an umbrella
**When** the pull request is merged
**Then** a post-merge check confirms the umbrella remains open while required children are incomplete

### AC3: Unexpected Closure Is Detected

**Given** GitHub nevertheless closes an umbrella during publication
**When** the workflow inspects the merge result
**Then** it reports the unexpected closing relationship as a lifecycle error and does not claim successful coordination state

### AC4: Existing Auto-Closed Umbrellas Can Be Recovered

**Given** an umbrella was previously closed by a specification-only publication
**When** the operator invokes the supported recovery path
**Then** the workflow explains the evidence and offers to reopen the issue only after explicit approval

### AC5: Ordinary Delivery Closure Is Preserved

**Given** a non-umbrella implementation issue is intentionally closed by its delivery pull request
**When** that pull request is merged
**Then** the existing issue-closing behavior remains available and correctly represented

### AC6: Publication Safety Checks Remain Intact

**Given** a publication pull request contains only the approved canonical specification changes
**When** it is prepared and validated
**Then** existing scope, branch, and content safety checks still apply

### AC7: GitHub Closing Semantics Are Exercised

**Given** the plugin's publication workflow
**When** its integration exercise creates and merges an issue-linked specification-only pull request
**Then** the exercise verifies actual issue timeline state rather than only matching body text

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Publish the exact seal commit through a dedicated branch that was not created or linked through GitHub's issue-development flow, then prove the resulting PR does not list the umbrella as a closing issue before it can be merged. | Must |
| FR2 | After a matching publication PR merges, inspect current issue state and chronologically process close/reopen timeline evidence before reporting canonical coordination success. | Must |
| FR3 | Return a lifecycle failure with exact PR, issue, closing-reference, and timeline evidence when publication is or was closing. | Must |
| FR4 | Allow only an explicitly approved reopen when the exact marked spec-only publication PR from the same repository owns the umbrella's currently active closure; historical or later unrelated closures do not qualify. | Must |
| FR5 | Keep ordinary `$nmg-sdlc:open-pr` issue-closing behavior unchanged; the non-closing branch and checks apply only to the exact Seal-Spec publication flow. | Must |
| FR6 | Preserve exact issue/path/tree marker matching, default-branch targeting, allowed-path checks, forbidden release-path checks, idempotent PR reuse, and canonical tree reclassification. | Must |
| FR7 | Add deterministic GitHub-contract tests plus an opt-in live exercise that observes closing references and issue timeline state around merged issue-linked and unlinked publication branches. | Must |

---

## Out of Scope

- Automatically closing umbrellas when the last child merges
- Reopening unrelated closed issues
- Changing the implementation content of publication pull requests
- Replacing GitHub Issues as the coordination system
- Changing ordinary implementation delivery pull-request closure semantics
- Automatically merging a user's real publication pull request as part of `$nmg-sdlc:write-spec`

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #161 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] All seven issue acceptance criteria are retained in Given/When/Then form
- [x] Actual GitHub closing-reference and timeline evidence is named
- [x] Recovery is limited to the exact repository-qualified currently active publication-caused closure and retains an explicit approval gate
- [x] Ordinary delivery closure and existing publication safety are protected
- [x] Out of scope is defined
