# Defect Report: Fix Canonical Umbrella Rejection of Issue Scope Manifests

**Issue**: #173
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. Use a canonical cumulative multi-issue feature spec containing `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`, and a regular `issue-scope.json`.
2. Run `node scripts/umbrella-spec-status.mjs --project <consumer> --parent-issue <parent> --json` against a refreshed default branch.
3. Observe `status = unverifiable`, `reasonCode = default_spec_invalid`, and an `unexpected_spec_entry` gap naming the manifest.
4. Reproduce against PathCast parent #108 on `main` commit `45d9341c6dc0a7bec3e13c4ff6172fffde2f1002`.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS; behavior is Git-tree and Node.js based and is expected to be platform-independent |
| **Version / Commit** | nmg-sdlc 2.0.8 at `21bbc5659b9dc54f4585309f5e9edfebe9a331a5` |
| **Browser / Runtime** | Node.js 26.7.0; gh 2.96.0; Git 2.50.1 |
| **Configuration** | PathCast `main` at `45d9341c6dc0a7bec3e13c4ff6172fffde2f1002`, canonical parent #108 |

### Frequency

Always when a candidate canonical umbrella tree contains the lifecycle-required regular `issue-scope.json` sidecar.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Parent, publication, and audit modes accept the exact lifecycle-owned regular `issue-scope.json` sidecar, retain its bytes in exact Git-tree identity, and continue rejecting every unrecognized or unsafe entry. |
| **Actual** | `validateTreeEntries()` rejects the required manifest as `unexpected_spec_entry`, so canonical parent evidence becomes unverifiable and blocks child lifecycle entry. |

### Error Output

```text
status: unverifiable
reasonCode: default_spec_invalid
gap: unexpected_spec_entry:specs/<feature>/issue-scope.json
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Accept Lifecycle Scope Manifests

**Given** a canonical feature-spec tree contains all four required authoring artifacts and a regular `issue-scope.json`
**When** parent, publication, or audit mode validates the tree
**Then** the scope manifest is accepted as an explicitly recognized lifecycle artifact
**And** the helper reaches the status supported by the remaining canonical evidence

### AC2: Preserve Exact Tree Identity

**Given** source and default trees differ only in `issue-scope.json` content
**When** publication identity is compared
**Then** the helper reports divergent tree identity
**And** it does not ignore or normalize the manifest bytes

### AC3: Preserve Strict Entry Validation

**Given** a candidate is missing a required authoring file or contains an unknown entry, directory, symlink, unsafe path, or unsupported object type
**When** any helper mode validates it
**Then** validation fails closed with the existing stable path-specific diagnostic
**And** recognizing `issue-scope.json` does not broaden acceptance to arbitrary sidecars

### AC4: Preserve Component Responsibilities

**Given** a regular `issue-scope.json` is present
**When** canonical tree validation runs
**Then** the helper validates only its recognized regular-blob shape and exact tree participation
**And** semantic scope-manifest validation remains owned by `scripts/issue-spec-scope.mjs`

### AC5: Prove the Consumer Regression and Read-Only Boundary

**Given** the fixed source is exercised against the PathCast #108 default-branch tree
**When** parent mode runs
**Then** it returns `canonical` or `canonical_marker_lost` rather than `unexpected_spec_entry`
**And** the helper does not change the worktree, index, local branches, refs, remote state, or GitHub

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Recognize only the exact regular `issue-scope.json` entry alongside existing allowed files. | Must |
| FR2 | Keep the manifest inside exact source/default Git-tree identity. | Must |
| FR3 | Add deterministic parent, publication, audit, divergence, and fail-closed regression coverage. | Must |
| FR4 | Verify the fixed helper against the real PathCast #108 canonical tree. | Must |

---

## Out of Scope

- Editing the PathCast backlog, issue graph, or canonical specification
- Parsing or semantically validating the manifest inside the canonical helper
- Allowing arbitrary JSON, Markdown, directories, or other sidecar entries
- Redesigning canonical publication, recovery, or epic identity semantics

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #173 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal -- no feature work mixed in
- [x] Out of scope is defined
