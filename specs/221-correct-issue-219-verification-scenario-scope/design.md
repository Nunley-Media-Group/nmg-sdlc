# Design: Correct issue 219 verification scenario scope

**Issue**: #221
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG

## Decision

Edit only the stale scenario tracing in `specs/219-harden-execute-against-transient-herdr-lifecycle-races/verification-report.md`. Add SCN009 to the machine-readable regression list and evidence tables, and change scenario totals from eight to nine. Preserve all command outcomes, acceptance results, smoke evidence, scores, and runtime claims.

Add this issue-owned four-file spec so the correction follows the normal issue/spec contribution path. No runtime, workflow, package, version, or changelog change is required.

## Verification

Compare the corrected report against issue #219's approved `feature.gherkin`, run current-spec validation, and run the contribution gate or equivalent repository checks.
