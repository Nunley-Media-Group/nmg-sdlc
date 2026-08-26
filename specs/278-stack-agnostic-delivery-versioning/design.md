# Root Cause Analysis: Make delivery version synchronization stack-agnostic

**Issue**: #278
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Root Cause

The v3 controller moved delivery decisions into `scripts/sdlc-deliver.mjs`, but its version synchronization retained an nmg-sdlc-specific Node layout. `synchronizeVersion` always reads and parses `package.json`; `hasSynchronizedDeliveryState` always requires `package.json` in the delivery commit. Those hard-coded assumptions bypass the manifest-registered technical steering that already declares each project's version mirrors.

V2 correctly treated the technical steering version table as the source of stack-specific artifact paths and field locators. The correction reuses that artifact contract inside the v3 automated controller rather than restoring the v2 interactive workflow.

## Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-deliver.mjs` | Discovers, updates, commits, and validates release artifacts. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Exercises delivery behavior across repository layouts. |
| `workflows/open-pr/references/version-bump.md` | Describes the controller-owned release artifact contract. |
| `references/versioning.md` | Defines shared versioning invariants. |
| `steering/snippets/project-tech.md` | Declares this repository's configured version artifacts. |
| `README.md` | Documents stack-agnostic delivery behavior. |
| `CHANGELOG.md` | Records the user-visible defect correction. |

## Fix Strategy

### Artifact discovery

Parse the `## Versioning` Markdown table in the manifest-registered `project.tech` snippet into ordered `{ path, field }` declarations. Require `VERSION` to remain the source of truth. Treat `CHANGELOG.md` as the v3 release log. Every other declared row is a stack-specific mirror; `package.json` has no special status.

Reject absolute paths, traversal, duplicates with conflicting fields, missing declared files, and empty field locators before mutation.

### Artifact synchronization

Use the declared field locator according to file type:

- JSON: parse the document, traverse the dot-separated field, require its value to equal the current version, update only that property, and serialize valid JSON.
- TOML: resolve the dot-separated locator to a table and key, require exactly one matching scalar assignment with the current version, and replace its value while preserving surrounding text.
- Other text: require exactly one line containing both the declared locator and current version, then replace that version on the line.

`VERSION` and the changelog release entry retain their v3 behavior. A declared mirror that cannot be updated fails closed before git commit or PR creation.

### Resume validation

Build the expected release path set from `VERSION`, `CHANGELOG.md`, and the steering declarations. A previous delivery commit is reusable only when every expected path is present and the working tree matches the commit for exactly those paths.

## Steering Alignment

- Product steering: keeps automated issue-to-merge delivery while allowing supported projects to use their native stack metadata.
- Technical steering: restores steering as the authority for stack-specific details and keeps the controller zero-dependency and fail-closed.
- Structure steering: keeps deterministic runtime behavior in `scripts/` and shared/workflow guidance in existing reference files.

## Failure Behavior

Invalid or missing version declarations, path traversal, missing files, field mismatches, ambiguous text assignments, malformed JSON, or unsupported TOML shapes produce a failed delivery handoff through the existing v3 error boundary. The controller does not create substitute metadata or continue with a partial artifact set.

## Verification

- Focused Jest delivery-controller tests for Python, Node, missing, mismatched, and resume artifact sets.
- Full Jest contract suite.
- Skill-creator validation for the changed `open-pr` workflow bundle and shared reference.
- Plugin surface, current-spec, contribution, live smoke, and git-hygiene gates as applicable.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #278 | 2026-08-26 | Initial bug-fix design |
