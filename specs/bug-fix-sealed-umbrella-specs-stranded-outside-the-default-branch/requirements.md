# Defect Report: Fix Sealed Umbrella Specs Stranded Outside the Default Branch

**Issue**: #157
**Date**: 2026-08-13
**Status**: Investigating
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. Start an epic or other multi-PR issue on a feature branch and complete all `$nmg-sdlc:write-spec` review gates.
2. Approve the Seal-Spec Flow and observe that the spec-only seal commit is pushed only to the current feature branch.
3. Return to the repository default branch and run `$nmg-sdlc:start-issue #CHILD`, which creates an independent child branch from that default branch.
4. Run `$nmg-sdlc:write-spec #CHILD` or `$nmg-sdlc:write-code #CHILD`.
5. Observe that the child worktree cannot resolve the parent specification unless an unrelated later pull request has already carried it to the default branch.
6. If that later pull request is squash-merged, observe that the files may exist on the default branch even though the original `docs: seal umbrella spec for #N` commit is absent from its ancestry.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | Platform-independent Git and GitHub workflow; reproduced on macOS |
| **Version / Commit** | nmg-sdlc 2.0.0 at `d675722dcba22d8f399cfbd1de709bccd6bfab19` |
| **Browser / Runtime** | Codex, GitHub CLI `gh issue develop`, and GitHub pull requests with squash merge enabled |
| **Configuration** | Multi-PR umbrella specification with child branches created independently from the repository default branch |

### Frequency

Always when child work starts from a default branch that does not yet contain the sealed parent specification; history-only seal detection also fails whenever the publication merge does not preserve the original seal commit as an ancestor.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Sealing delivers the exact approved umbrella specification through a spec-only pull request without a version bump. Child work stays blocked until refreshed remote state proves the merged default branch contains the canonical parent spec. Canonical provenance survives squash and rebase history, and initialized projects can preview and explicitly recover safe stranded states. |
| **Actual** | Sealing commits and pushes only the current feature branch, immediately recommends child work, and identifies prior sealing only by exact commit-message ancestry. Independent child branches cannot reliably read the parent spec, squash merges erase the history marker, and `$nmg-sdlc:upgrade-project` cannot audit or recover affected projects. |

### Error Output

No stack trace is produced. The failure appears as a missing-parent-spec diagnostic in child workflows, premature child-work guidance after sealing, duplicate seal/publication attempts after history rewriting, or the absence of an upgrade finding for stranded specs.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Publish Sealed Specs Canonically Before Child Work

**Given** a user has approved all specification review gates for an umbrella issue whose design triggers the multi-PR Seal-Spec Flow
**When** the user approves sealing and transition
**Then** nmg-sdlc delivers the exact approved spec directory through a spec-only pull request targeting the repository default branch
**And** the publication changes no `VERSION`, `CHANGELOG.md`, plugin manifest, marketplace file, or unrelated working-tree path
**And** child branch, child specification, and child implementation work remain blocked until refreshed remote state proves the merged default branch contains the canonical parent spec

### AC2: Fail Closed When a Child's Parent Spec Is Not Canonical

**Given** a child issue is related to an umbrella through supported body cross-references or GitHub parent/sub-issue metadata
**When** `$nmg-sdlc:start-issue`, `$nmg-sdlc:write-spec`, or `$nmg-sdlc:write-code` would begin child work
**Then** the workflow verifies the parent spec against refreshed default-branch state instead of relying only on the current worktree
**And** missing or unpublished parent state stops before branch, spec, or code mutation with an actionable publication or recovery message

### AC3: Preserve Seal Identity Across History Rewrites

**Given** a sealed umbrella specification has been merged through squash, rebase, or another history-shaping strategy that does not retain the original seal commit as an ancestor
**When** nmg-sdlc checks whether the specification is sealed and canonical
**Then** it recognizes the valid merged state without relying solely on the exact original commit message in `HEAD` ancestry
**And** rerunning the seal transition creates neither a duplicate seal nor a duplicate publication pull request

### AC4: Audit Existing Projects for Affected Seal State

**Given** an initialized consumer project runs `$nmg-sdlc:upgrade-project`
**When** the skill analyzes specification and Git state
**Then** it previews each relevant seal as canonical, canonical with history marker lost, stranded but unambiguously recoverable, divergent from a same-path default-branch spec, or ambiguous/unrecoverable
**And** each finding identifies the exact spec path and available Git evidence without reading or changing unrelated project content
**And** no recovery mutation occurs before explicit approval

### AC5: Recover an Unambiguous Stranded Spec Safely

**Given** the upgrade audit finds a sealed spec that is absent from the default branch and has one unambiguous recoverable source
**When** the user explicitly approves that exact recovery finding
**Then** `$nmg-sdlc:upgrade-project` prepares only the missing canonical specification content for normal spec-only delivery
**And** it preserves unrelated dirty files, project-authored content, release artifacts, and GitHub state

### AC6: Preserve Main When Sealed and Canonical Copies Diverge

**Given** the default branch already contains a spec at the same canonical path as a differing sealed-branch copy
**When** `$nmg-sdlc:upgrade-project` analyzes or applies cleanup
**Then** the default-branch copy remains canonical and is not overwritten
**And** the differing sealed ref is reported as noncanonical with enough evidence for manual follow-up
**And** cleanup does not automatically delete local or remote branches

### AC7: Make Publication and Cleanup Idempotent and Exercised

**Given** disposable repositories cover independent child branches, default-branch publication, squash-merge marker loss, recoverable stranded specs, divergent specs, ambiguous evidence, and already-clean projects
**When** the changed skill contracts and exercises run
**Then** canonical states proceed, unsafe or ambiguous states fail closed, and recovery changes remain exactly scoped
**And** a second seal/publication or `$nmg-sdlc:upgrade-project` run produces no additional diff or duplicate publication
**And** existing single-PR specification, managed-asset upgrade, legacy-layout migration, and explicit human-gate behavior continue to work

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Publish sealed umbrella specs to the default branch through a no-version-bump spec-only pull request before child work begins. | Must |
| FR2 | Preserve exact spec-directory staging and exclude version, changelog, manifest, marketplace, and unrelated dirty-tree paths from seal publication. | Must |
| FR3 | Represent canonical seal provenance in a form that survives squash merges and rebases instead of depending solely on commit-message ancestry. | Must |
| FR4 | Enforce refreshed default-branch parent-spec readiness at child branch, child spec, and child implementation entry points. | Must |
| FR5 | Add previewed affected-project seal classification and recovery to `$nmg-sdlc:upgrade-project`. | Must |
| FR6 | Recover only unambiguous missing specs and only after explicit approval. | Must |
| FR7 | Preserve the default-branch spec whenever a same-path sealed copy diverges, while reporting the noncanonical evidence. | Must |
| FR8 | Preserve project-authored content and unrelated dirty changes, avoid automatic branch deletion, and make cleanup idempotent. | Must |
| FR9 | Add static and disposable-repository exercises for forward publication, independent children, squash merging, recovery classifications, and repeated cleanup. | Must |

---

## Out of Scope

- Stacked child branches or making children permanently depend on an umbrella feature branch
- Keeping all children on the sealing branch as the permanent delivery model
- Automatically approving or merging pull requests without the user's normal merge authority
- Automatically deleting local or remote branches during cleanup
- Overwriting a divergent default-branch spec with a sealed-branch copy
- Reworking unrelated runner-artifact, legacy-layout, or managed-repository-asset migrations

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #157 | 2026-08-13 | Initial defect report |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal -- no feature work mixed in
- [x] Out of scope is defined
