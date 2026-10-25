# Defect Report: Non-issue legacy dependency references abort upgrade detection

**Issue**: #485
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Reproduction

1. Use a repository with a closed issue whose body contains the table row `| **Version / Commit** | Main after merged PR #307 |`, where #307 is a pull request.
2. Run `node scripts/sdlc-upgrade.mjs detect --root .`.
3. Observe the output.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | PR references, references qualified with another project or repository, and markdown table rows are not proposed as edges. Any other legacy candidate whose endpoint is not a repository issue is left out of the proposed additions and reported as a finding. `detect` and `apply` complete and evaluate every other upgrade category. Dangling endpoints in existing official edges still fail closed. |
| **Actual** | `detect` prints `ERROR {"reasonCode":"dependency_dangling",...,"message":"Proposed dependency edge is dangling"}` and returns no report. `apply` fails the same way before applying any approved category. |

## Acceptance Criteria

### AC1: Pull-request and table-row references create no candidate

**Given** an issue body line `| **Version / Commit** | Main after merged PR #307 |` or a sentence `requires the fix after PR #307`
**When** `parseLegacyDependencyEvidence` parses the body
**Then** it returns no edge for `#307`

### AC2: References qualified with another project or repository create no candidate

**Given** issue body lines `PennyScan issue #102 therefore fails` and `depends on Other-Org/other-repo#12`
**When** `parseLegacyDependencyEvidence` parses the body
**Then** it returns no edge for `#102` or `#12`

### AC3: A dangling legacy candidate becomes a finding and detection completes

**Given** a repository issue graph and a legacy candidate edge whose endpoint is not a repository issue
**When** `detectIssueDependencyUpgrade` runs
**Then** the candidate is absent from `additions`, it appears in `findings` with reason `dependency_dangling_candidate` and its source line, and the overall `detect` report contains every other detected category

### AC4: Genuine sequencing clauses and field lines are preserved

**Given** issue bodies containing `After issue #394 resumes a consumed dispatch` and `Depends on: #10, #11`, where #394, #10 and #11 are repository issues
**When** detection runs
**Then** the edges `blockedBy #394`, `blockedBy #10`, and `blockedBy #11` are still proposed

### AC5: Dangling existing official edges still fail closed

**Given** an existing official blocked-by edge whose target is not readable as a repository issue
**When** detection or `sdlc-execute` graph validation runs
**Then** it still reports `dependency_dangling` exactly as before

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `parseLegacyDependencyEvidence` ignores markdown table rows and `#N` references immediately qualified as a pull request or by another project or repository name | Must |
| FR2 | `detectIssueDependencyUpgrade` excludes legacy candidates with a non-issue endpoint from `additions` and reports each as a `dependency_dangling_candidate` finding instead of throwing | Must |
| FR3 | Existing official-edge validation (`validateDependencyGraph`, and `preflightBlockedByEdges` for approved edges at apply) keeps failing closed on dangling targets | Must |
| FR4 | The upgrade-project detection references describe dangling legacy candidates as report-only findings | Should |

## Out of Scope

- Changing how `/sdlc-draft-issue` or `/sdlc-execute` derive or validate dependency edges
- Partial (subset) approval of proposed dependency edge sets

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #485 | 2026-10-25 | Initial defect report |
