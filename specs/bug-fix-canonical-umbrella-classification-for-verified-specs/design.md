# Root Cause Analysis: Fix Canonical Umbrella Classification for Verified Specs

**Issue**: #159
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

`scripts/umbrella-spec-status.mjs` uses `REQUIRED_SPEC_FILES` for two different contracts: the four files that must exist and the complete set of entries allowed in a canonical specification tree. The lifecycle later adds `verification-report.md`, but `validateTreeEntries()` rejects every entry outside the four-file authoring set. A verified umbrella therefore becomes unverifiable even though its verification evidence is lifecycle-owned and committed.

Candidate discovery also validates each tree before it knows whether the candidate belongs to a requested parent. `collectCandidates()` returns immediately on the first invalid tree and applies `issueFilter` only after the scan. As a result, an unrelated malformed candidate can suppress a valid targeted parent result, and audit mode loses already-valid findings instead of reporting the malformed candidate as a localized gap.

### Affected Code

| File | Role |
|------|------|
| `scripts/umbrella-spec-status.mjs` | Defines the required tree set, validates candidates, applies parent filtering, and aggregates audit results. |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | Covers exact-tree validation and classifier modes but currently treats every fifth entry as invalid and expects audit to abort on one invalid candidate. |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | Exercises umbrella publication but not the post-verification tree or a later child amendment. |
| `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` | Statically protects child gates and no-reseal behavior but does not pair those contracts with the verified-tree classifier path. |

### Triggering Conditions

- A canonical multi-PR specification contains the four required authoring files and a regular `verification-report.md`.
- A targeted lookup scans an invalid candidate before it filters candidates for the requested parent.
- A repository audit encounters any candidate-level validation error before it has returned other valid findings.

---

## Fix Strategy

### Approach

Separate the required-entry contract from the allowed-entry contract. Continue requiring `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`, while allowing only one additional lifecycle-owned regular blob: `verification-report.md`. The report remains part of the Git tree identity, so publication comparison detects any difference in verification evidence. Missing required files, symlinks, directories, unsafe paths, and all other entries continue to fail closed.

Scope targeted parent classification before expensive tree validation. Candidate metadata is read first from the two frontmatter-bearing authoring files. A candidate that unambiguously does not reference the requested parent is skipped before its complete tree is validated. A malformed or ambiguous candidate that claims the requested parent remains relevant and fails closed with path-specific diagnostics.

Change candidate collection to distinguish fatal scan failures from candidate-specific validation gaps. Git/ref/default-branch failures, safety limits, and failures to enumerate candidates remain fatal. In audit mode, an invalid candidate contributes a stable gap while valid candidates continue through classification, allowing the result to retain canonical, stranded, divergent, and ambiguous findings. Parent and publication modes continue to fail closed when their relevant candidate or explicitly requested tree is invalid.

### Classification Rules

| Context | Invalid unrelated candidate | Invalid relevant candidate | Systemic scan failure |
|---------|-----------------------------|----------------------------|-----------------------|
| Targeted parent | Skip after bounded metadata proves it does not claim the parent. | Return `unverifiable` with scoped `candidate_scan_failed` diagnostics. | Return `unverifiable`. |
| Publication | Not scanned for the explicit path/source comparison. | Return `unverifiable` with `source_spec_invalid` or `default_spec_invalid`. | Return `unverifiable`. |
| Repository audit | Preserve valid findings and append a candidate-specific gap. | Preserve other valid findings and append a candidate-specific gap. | Return `unverifiable`. |

### Tree Contract

```text
required regular blobs:
  requirements.md
  design.md
  tasks.md
  feature.gherkin

optional recognized regular blob:
  verification-report.md

all other entries:
  rejected with a stable path-specific reason
```

The exact Git tree object remains the identity used for canonical and publication comparisons. Recognizing `verification-report.md` therefore broadens only the valid lifecycle shape; it does not weaken equality, path, object-type, symlink, or no-mutation guarantees.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/umbrella-spec-status.mjs` | Define separate required and optional recognized files; prefilter targeted candidates by bounded issue metadata; collect candidate-specific audit gaps without suppressing valid findings. | Fixes both verified-tree rejection and cross-candidate poisoning while retaining fail-closed safety. |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | Add verified-tree coverage in parent, publication, and audit modes; retain strict invalid-entry tests; add targeted isolation and mixed audit fixtures. | Provides deterministic proof for AC1-AC4 and the classifier portions of AC6. |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | Extend the disposable lifecycle through canonical merge, verification report creation, later child-scoped amendment, and write-code handoff. | Reproduces the real lifecycle that exposed the defect and proves no child reseal is required. |
| `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` | Assert the child workflow continues to accept the canonical parent baseline while allowing the child-amended tree. | Protects the no-reseal and consumer-handoff contract in AC5. |
| `specs/bug-fix-canonical-umbrella-classification-for-verified-specs/*` | Record approved requirements, design, tasks, and six regression scenarios. | Keeps implementation traceable to issue #159. |

No skill instructions, shared references, README content, or public workflow are changed because their existing contracts already say that a child may amend the canonical parent baseline and must not reseal it.

### Blast Radius

- **Direct impact**: Umbrella parent, publication, and audit classification plus their deterministic tests.
- **Indirect impact**: `write-spec`, `write-code`, and upgrade exercises that consume classifier results; verified umbrella tree identity now includes the report as intended.
- **Unaffected**: Single-PR specs, issue relationship discovery, publication authority, versioning, changelog behavior, PR merge policy, and arbitrary non-spec files.
- **Risk level**: Medium. The classifier gates multiple lifecycle stages, but the implementation is localized and the rejection surface remains explicit.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Optional-file handling accidentally permits arbitrary entries. | Low | Use an explicit recognized filename set and retain object-type and exact-entry rejection tests. |
| Target prefiltering hides malformed evidence that actually refers to the requested parent. | Medium | Treat an exact requested issue claim as relevant before full validation and fail closed on malformed or ambiguous relevant metadata. |
| Audit downgrades a systemic failure into a local finding. | Low | Keep Git/ref/default/limit errors on the fatal path; only validated candidate-path errors become gaps. |
| Valid findings change ordering or schema. | Low | Preserve existing finding construction and deterministic sorting; add mixed valid/invalid snapshots. |
| Later child amendments are incorrectly compared with the parent baseline. | Medium | Exercise the consumer handoff and assert exact-tree equality remains limited to publication mode. |
| The #157 canonicality protections regress. | Low | Run the existing complete classifier, publication, recovery, ambiguity, symlink, and no-mutation suites unchanged alongside the new lifecycle regression. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Ignore `verification-report.md` when computing tree identity | Validate the file but compare only the four authoring files. | Would make publication equality blind to committed lifecycle evidence and violate the exact-tree contract. |
| Allow any regular Markdown file | Treat arbitrary `.md` entries as safe. | Broadens the canonical archive without ownership or lifecycle rules and weakens strict validation. |
| Filter only after all candidates validate | Keep the current ordering and suppress unrelated errors at the end. | Cannot prevent an unrelated early failure from poisoning targeted lookup. |
| Make audit fail on the first invalid candidate | Preserve the current fail-fast behavior. | Loses valid findings and prevents a complete repository repair plan. |
| Change child workflow instructions | Add resealing or force child equality with the parent tree. | Contradicts the approved multi-PR lifecycle and addresses a classifier defect in the wrong layer. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #159 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal and contains no unrelated refactoring
- [x] Required and optional tree entries remain explicit
- [x] Targeted, audit, and systemic failure behavior is defined
- [x] Blast radius and regression risks are documented
- [x] Existing child-workflow contracts remain unchanged
