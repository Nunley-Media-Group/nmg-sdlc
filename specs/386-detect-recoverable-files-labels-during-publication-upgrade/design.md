# Root Cause Analysis: Detect recoverable Files labels during publication upgrade

**Issue**: #386
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/383-reject-missing-near-miss-or-duplicate-delivery-file-declarations/

---

## Root Cause

`publicationFilesUpgrade()` enters admitted `### TNNN:` blocks but matches only `**File(s)**:`. An exact `**Files**:` near miss is invisible to the detector, even when its value independently satisfies the existing publication grammar. The fail-closed delivery parser from #383 correctly rejects that same task, leaving no digest-bound upgrade action capable of producing the canonical label.

The detector must reason about declaration cardinality before proposing a rewrite. Rewriting each matching line independently would be unsafe because duplicate near misses, mixed canonical and near-miss declarations, or other file-like metadata could make task authority ambiguous.

## Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-upgrade.mjs` | Publication declaration discovery, safe recovery plan, digest binding, and apply |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | PathCast-shaped pre/post exercise and unsafe-boundary regressions |
| `CHANGELOG.md` | Pending release record for the issue-owned defect fix |

## Fix Strategy

Scan each admitted task as one block and collect canonical `**File(s)**:` lines plus the one supported exact near miss, `**Files**:`. At the task boundary and end of file:

1. preserve a single valid canonical declaration, including existing value normalization behavior;
2. recover a single valid `**Files**:` declaration only when no canonical declaration or second file-like declaration exists;
3. rewrite the exact label prefix to `**File(s)**:` while normalizing the value through the existing recovery helper only when needed;
4. retain located findings for malformed or ambiguous file-like declarations;
5. produce no authority-establishing rewrite for missing, duplicate, mixed, hidden, or unsupported labels.

The existing package source digest and aggregate `publication-files:<digest>` identity remain the approval boundary. `applyPublicationFiles()` continues checking both the source digest and exact original line before mutation.

`parseDeliveryTaskFileLines()` is not changed. Before apply it rejects `**Files**:` as `publication_scope_unproven`; after apply it accepts only the canonical result.

## Invariants

- Only lines inside admitted `### TNNN:` blocks are considered.
- Only exact visible `**File(s)**:` and `**Files**:` labels participate in recovery.
- Every authority-establishing rewrite is based on exactly one file-like declaration in its task.
- Declaration values pass the existing canonical parser or the existing conservative recovery helper.
- Digest-bound stale-plan rejection remains unchanged.
- Missing declarations are never invented.

## Blast Radius

- **Direct**: publication upgrade detection, its focused Jest suite, and the pending changelog.
- **Unaffected**: delivery parsing, path grammar, dependency graph collection, spec admission, controller dispatch, workflow prompts, plugin surface, PathCast state.
- **Risk**: an insufficiently task-aware scan could canonicalize one declaration while leaving a duplicate or mixed declaration. Per-task cardinality tests prevent this.

## Alternatives Considered

| Option | Rejected because |
|--------|------------------|
| Accept `**Files**:` in `parseDeliveryTaskFileLines()` | Violates #383 and broadens the public delivery grammar instead of repairing the spec |
| Globally replace `**Files**:` | Ignores task boundaries, cardinality, hidden content, value validity, and plan binding |
| Treat every File-like label as recoverable | Makes ambiguous metadata authoritative |
| Couple the fix to dependency-graph collection | Expands scope and makes an isolated publication repair depend on unrelated GitHub graph readability |

## Change History

| Issue | Date | Summary |
|---|---|---|
| #386 | 2026-09-13 | Initial approved root cause analysis |
