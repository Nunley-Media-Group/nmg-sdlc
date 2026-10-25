# Root Cause Analysis: Non-issue legacy dependency references abort upgrade detection

**Issue**: #485
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Root Cause

1. `parseLegacyDependencyEvidence` in `scripts/issue-dependencies.mjs` accepts any line that matches `\b(blocked by|depends on|requires|after|precursor)\b.*#N` and has exactly one `#N` reference as a `blockedBy` edge. It does not recognize `PR #N` / `pull request #N`, references qualified by another project or repository (`PennyScan issue #102`, `owner/repo#N`), or markdown table rows such as `| **Version / Commit** | Main after merged PR #307 |`.
2. `detectIssueDependencyUpgrade` in `scripts/sdlc-upgrade.mjs` passes every candidate to `preflightBlockedByEdges`. That function throws `dependency_dangling` when either endpoint is not a node in the repository issue graph, which contains issues only, never pull requests. The throw is not caught, so one bad candidate fails the whole `detect` / `apply` report.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/issue-dependencies.mjs` | `parseLegacyDependencyEvidence`, `stripIgnoredProse` | Produces false candidates |
| `scripts/sdlc-upgrade.mjs` | `detectIssueDependencyUpgrade` | Sends every candidate to the strict preflight |
| `scripts/issue-dependencies.mjs` | `preflightBlockedByEdges`, `validateDependencyGraph` | Strict validation (unchanged) |
| `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/v3-detectors.md` | Issue-dependencies detection prose | Says dangling targets fail closed before proposal |

## Fix Strategy

- **Parser (`scripts/issue-dependencies.mjs`):**
  - Skip a line whose first non-space character is `|`.
  - Collect `#N` matches with their index. Drop a match when the text before it matches one of these:
    1. `/\b(?:PR|pull request|pull)\s*$/i`;
    2. `/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/` (no whitespace before `#`);
    3. `/\b([A-Za-z0-9][\w.-]*)\s+issue\s*$/i`, where the captured word starts with an uppercase letter or contains `-`, `.`, or `_`, and its lowercase form is not one of `after`, `blocked`, `depends`, `requires`, `precursor`, `blocks`, `the`, `this`, `that`, `same`, `an`, `a`, `each`, `every`, `its`, `our`, `see`, `github`.
  - Apply the existing rules (field lines take every remaining reference; clause lines need exactly one) to the remaining references only. Exclude dropped references from the count, so `Requires #10 and #11` stays an `ambiguous_dependency_evidence` finding. When no reference remains after dropping, emit neither an edge nor a finding for that line.
  - For a clause line, match the relation keyword against the line as today; the `#N` capture comes from the filtered references.
- **Detector (`scripts/sdlc-upgrade.mjs`):** after building `evidenceByEdge`, split edges by whether both `issue` and `blockedBy` are numbers in `graph.nodes`.
  - Send only the edges inside the graph to `preflightBlockedByEdges`.
  - Turn each other edge into a finding `{ issue, line: source, reason: 'dependency_dangling_candidate', edge: { issue, blockedBy } }`, where `issue` is the issue whose body supplied the evidence.
  - `findings` keeps its current ordering: parser findings first, then dangling-candidate findings in edge-key order.
  - The `id`, `digest`, and `additionsDigest` derivation is unchanged, and so is `actionable = additions.length > 0`.
- **Unchanged:** `preflightBlockedByEdges`, `validateDependencyGraph`, `readDependencyGraph`, `applyIssueDependencyUpgrade`, and the approved-edge preflight in the apply path. An existing official edge to a missing target, or a dangling approved edge at apply, still throws `dependency_dangling`.
- **Docs:** update the issue-dependencies wording in `workflows/upgrade-project/WORKFLOW.md` (step 7), `references/detection.md` (item 6), and `references/v3-detectors.md` (item 7). They must say that table rows and PR, other-project, and other-repository references are ignored, that a legacy candidate with a non-issue endpoint is a report-only `dependency_dangling_candidate` finding, and that existing official edges with dangling targets and open cycles still fail closed. Edit these workflow-bundled files after invoking the `skill-creator` skill. Add a CHANGELOG `[Unreleased]` `### Fixed` entry.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/issue-dependencies.mjs` | Table-row skip and qualified-reference filter | AC1, AC2, AC4, FR1 |
| `scripts/sdlc-upgrade.mjs` | Dangling-candidate partition into findings | AC3, AC4, FR2 |
| upgrade-project workflow references | Report-only dangling candidates | FR4 |
| `CHANGELOG.md` | Fixed entry | User-facing behavior |

## Blast Radius

- `parseLegacyDependencyEvidence` is used only by upgrade detection, as migration evidence. Draft-issue and execute do not call it.
- `detectIssueDependencyUpgrade` is also called live by `applyIssueDependencyUpgrade`, so apply no longer aborts on dangling legacy candidates. Approved additions still pass through the strict preflight.
- Existing official-edge validation in `sdlc-execute` (`validateDependencyGraph`) is untouched (AC5, FR3).

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Catch `dependency_dangling` from `preflightBlockedByEdges` and drop all additions | Rejected | It would hide every valid edge because of one bad candidate |
| Make `preflightBlockedByEdges` tolerant of dangling edges | Rejected | Approved and official edges must keep failing closed (FR3) |
| Treat every `<word> issue #N` as qualified | Rejected | It would drop genuine clauses such as `After issue #394` |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #485 | 2026-10-25 | Initial defect report |
