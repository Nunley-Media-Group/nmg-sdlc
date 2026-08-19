# Root Cause Analysis: Fix Canonical Umbrella Rejection of Issue Scope Manifests

**Issue**: #173
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

`scripts/umbrella-spec-status.mjs` correctly separates the four required authoring files from optional recognized lifecycle artifacts, but `OPTIONAL_SPEC_FILES` contains only `verification-report.md`. `validateTreeEntries()` rejects every tree entry outside the combined explicit set, so the lifecycle-required `issue-scope.json` manifest is classified as `unexpected_spec_entry` before otherwise canonical evidence can be evaluated.

The cumulative-scope contract intentionally assigns semantic manifest validation to `scripts/issue-spec-scope.mjs`. The canonical helper needs only to recognize the exact filename as a regular Git blob. Because publication identity compares the complete spec tree object, recognizing the manifest preserves its raw bytes in equality and divergence decisions without creating a second JSON-schema authority.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/umbrella-spec-status.mjs` | 21-33, `validateTreeEntries()` | Defines required and optional recognized entries, rejects unsafe objects, and validates the canonical tree shape. |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | `writeSpec()`, `commitSpec()`, classifier-mode tests | Builds deterministic Git fixtures and proves allowed-entry, exact-identity, fail-closed, and read-only behavior. |

### Triggering Conditions

- A canonical multi-PR feature spec uses the cumulative-scope contract and therefore contains `issue-scope.json`.
- Parent, publication, or audit mode validates that complete Git tree.
- The exact manifest filename is absent from `OPTIONAL_SPEC_FILES`, so entry validation stops before canonical classification.

---

## Fix Strategy

### Approach

Add only `issue-scope.json` to `OPTIONAL_SPEC_FILES`. Keep the existing required-file set, exact combined allowlist, recursive Git-tree enumeration, symlink rejection, blob-type check, and full-tree identity comparison unchanged.

Extend the existing test fixture with optional manifest content. Exercise both lifecycle sidecars together in parent, publication, and audit modes, then change only the manifest bytes and require a divergent source/default identity. Continue running the existing missing-file, unknown-entry, symlink, traversal, deterministic, and no-local-ref-mutation tests unchanged. Finally, run the fixed source helper against PathCast parent #108 and compare Git state before and after.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/umbrella-spec-status.mjs` | Add `issue-scope.json` to the explicit optional recognized-file set. | Accepts the lifecycle-owned artifact without broadening the archive to arbitrary entries. |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | Add optional manifest fixture data and acceptance/divergence assertions alongside existing lifecycle and safety coverage. | Proves all modes accept the manifest, exact identity includes its bytes, and strict rejection remains intact. |
| `specs/173-fix-canonical-umbrella-rejection-of-issue-scope-manifests/*` | Record requirements, design, tasks, and regression scenarios for #173. | Preserves issue-to-implementation traceability. |

### Blast Radius

- **Direct impact**: Canonical umbrella parent, publication, and repository-audit tree validation.
- **Indirect impact**: `start-issue`, `write-spec`, `write-code`, and `upgrade-project` gates that consume canonical-helper statuses for cumulative umbrella specs.
- **Unaffected**: Scope ownership/schema validation, ordinary single-issue specs, relationship classification, publication authority, versioning, and GitHub mutation behavior.
- **Risk level**: Low. Runtime behavior changes for one exact filename, while complete tree identity and all safety checks remain shared and unchanged.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Optional-file handling accepts arbitrary sidecars. | Low | Keep a literal filename allowlist and retain the existing `seal.json` rejection test. |
| Manifest content is accepted but excluded from publication identity. | Low | Change only `issue-scope.json` bytes in a fixture and require different tree IDs plus `divergent`. |
| A manifest symlink or non-blob object bypasses safety checks. | Low | Reuse the unchanged object-type and symlink checks; existing fail-closed coverage runs with the new allowlist. |
| The canonical helper starts duplicating semantic scope validation. | Low | Make no parser or schema changes; malformed manifest content remains opaque to this helper and owned by `issue-spec-scope.mjs`. |
| Live verification changes PathCast or remote state. | Low | Snapshot worktree, index, branch, refs, and remote evidence before and after the read-only source-helper invocation. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Parse and validate `issue-scope.json` in both helpers | Duplicate the scope resolver's JSON/schema checks inside canonical validation. | Creates competing authorities and couples publication identity to semantic rules outside this helper's responsibility. |
| Ignore the manifest when comparing trees | Permit the file but compute identity from only the authoring documents. | Makes publication equality blind to committed lifecycle metadata and violates exact-tree identity. |
| Allow every regular JSON sidecar | Accept any `.json` file under a spec directory. | Weakens the fail-closed archive contract and grants ownership to artifacts the lifecycle does not define. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #173 | 2026-08-14 | Initial defect report |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns per `steering/structure.md`
