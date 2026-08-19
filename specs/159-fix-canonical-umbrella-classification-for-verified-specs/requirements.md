# Defect Report: Fix Canonical Umbrella Classification for Verified Specs

**Issue**: #159
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: specs/feature-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/

---

## Reproduction

### Steps to Reproduce

1. On a refreshed default branch, create or use a multi-PR feature spec containing `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`, and a regular `verification-report.md`.
2. Run `scripts/umbrella-spec-status.mjs` in parent mode or publication mode against that spec.
3. Observe `unverifiable` with `default_spec_invalid` or `source_spec_invalid` and an `unexpected_spec_entry` reason naming `verification-report.md`.
4. Query a different parent whose own evidence does not reference that spec, or run the repository-wide `--all --json` audit.
5. Observe the targeted lookup or complete audit fail with `candidate_scan_failed` because candidate collection validates an unrelated tree before applying the requested parent filter or retaining per-spec findings.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS 26.5.2; behavior is Git-tree and Node.js based and is expected to be platform-independent |
| **Version / Commit** | nmg-sdlc 2.0.1 at `aa98ce66fd77d389eaac90b5f90d8fe62e2feb4b` |
| **Browser / Runtime** | Node.js 26.7.0; gh 2.96.0; Git 2.50.1 |
| **Configuration** | Canonical multi-PR umbrella spec with a committed lifecycle-owned `verification-report.md` |

### Frequency

Always when a candidate tree contains a regular `verification-report.md`; the unrelated-candidate poisoning path occurs whenever that candidate is scanned before the requested parent or repository-wide findings are finalized.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A regular lifecycle-owned `verification-report.md` is accepted alongside the four required authoring artifacts and participates in exact tree identity. Parent and publication modes return the status supported by the requested umbrella's evidence. Repository audit retains valid per-spec findings while reporting candidate-specific validation gaps. |
| **Actual** | Tree validation treats the required authoring set as an exclusive whitelist, rejects `verification-report.md`, and lets one invalid candidate abort targeted parent lookup or the entire repository audit before requested-parent filtering or per-spec result isolation occurs. |

### Error Output

```text
unexpected_spec_entry:.../verification-report.md
default_spec_invalid | source_spec_invalid | candidate_scan_failed
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Accept Verified Umbrella Specs

**Given** a multi-PR feature-spec tree contains the four required regular authoring blobs plus a regular `verification-report.md`
**When** parent, publication, or audit mode validates that tree
**Then** the report is not classified as an unexpected entry
**And** the helper reaches the evidence-supported canonical status
**And** exact tree identity includes the recognized verification evidence

### AC2: Preserve Strict Tree Validation

**Given** a spec tree is missing a required authoring file, contains a symlink, or contains an unrecognized or unsafe entry
**When** any classifier mode validates the tree
**Then** it fails closed with a stable, path-specific reason
**And** it does not follow the entry or mutate the worktree, index, refs, remote state, or GitHub

### AC3: Isolate Targeted Parent Lookups

**Given** a bounded ref contains an invalid candidate unrelated to the requested parent
**When** parent mode queries a different parent issue
**Then** the unrelated candidate does not change or suppress the requested parent's result
**And** malformed or ambiguous evidence that actually claims the requested parent still fails closed with scoped diagnostics

### AC4: Preserve Valid Audit Findings

**Given** repository refs contain a mixture of valid, invalid, canonical, stranded, divergent, and ambiguous umbrella candidates
**When** `--all --json` runs
**Then** it retains the valid per-spec findings
**And** it reports candidate-specific validation gaps without aborting the entire audit
**And** genuinely systemic Git, default-branch, or bounded-ref failures may still make the overall audit unverifiable

### AC5: Complete Child Work Without Resealing

**Given** an umbrella spec is canonical on the refreshed default branch, has already been verified, and a feature child has an approved child-scoped amendment
**When** `$nmg-sdlc:write-spec #CHILD` completes and `$nmg-sdlc:write-code #CHILD` begins
**Then** write-spec creates no child-numbered seal commit and no second umbrella publication pull request
**And** its next-step output points to write-code
**And** the write-code parent gate accepts the canonical parent baseline and loads the child-amended specification
**And** it does not require the child branch tree to equal the parent baseline tree

### AC6: Exercise the Real Lifecycle and Preserve #157 Safety

**Given** the existing #157 canonicality, publication, recovery, divergence, ambiguity, and no-mutation scenarios
**When** regression verification adds the lifecycle sequence seal, canonical merge, implementation verification, later-child amendment, and write-code handoff
**Then** every classifier mode and consumer handoff passes with `verification-report.md` present
**And** exact publication scope, default-branch precedence, idempotency, symlink rejection, and read-only helper behavior continue to pass

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Recognize the plugin-owned verification report without accepting arbitrary spec-directory entries. | Must |
| FR2 | Scope targeted candidate failures to the requested parent and isolate repository-audit diagnostics per spec. | Must |
| FR3 | Preserve canonicality, ambiguity, divergence, exact-tree, symlink, and no-mutation protections. | Must |
| FR4 | Add deterministic classifier and consumer-handoff regression coverage for the verified-umbrella lifecycle. | Must |

---

## Out of Scope

- Cleaning up or delivering the current PathCast `#122` branch
- Deleting, rewriting, or silently regenerating existing verification reports
- Redesigning epic membership or PathCast's issue hierarchy
- Automatically approving or merging specification pull requests
- Broadly allowing arbitrary files, directories, or symlinks inside canonical spec trees

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #159 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal -- no feature work mixed in
- [x] Out of scope is defined
