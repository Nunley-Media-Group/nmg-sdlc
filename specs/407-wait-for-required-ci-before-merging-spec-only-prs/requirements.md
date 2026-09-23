# Defect Report: Wait for required CI before merging spec-only PRs

**Issue**: #407
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG

## Reproduction

An approved spec-only PR is opened while GitHub required CI is registering. `scripts/publish-approved-spec.mjs merge` immediately invokes `gh pr merge`; PR #170 for MileDar #169 at b632517dd99e8ac6368b29a8d8bfc31ead10bc00 was rejected because a required status check was expected, even though contribution evidence later succeeded. Closed #400 fixed implementation delivery, not this helper.

## Acceptance Criteria

### AC1: Observe exact-head required CI
**Given** a newly created or existing approved spec-only PR at head H
**When** required checks are absent, queued, pending, or in progress
**Then** publication keeps observing that PR and H without issuing a merge
**And** absent or unreported check evidence is never interpreted as success.

### AC2: Fail closed on terminal failure or policy blocker
**Given** a required check fails or a fresh PR snapshot proves a non-CI blocker
**When** publication observes it
**Then** it returns a distinct actionable failure with PR, head, and check or blocker evidence
**And** does not issue a merge or mark the publication merged.

### AC3: Merge only fresh successful clean exact head
**Given** every required check for H reports terminal success and the fresh PR snapshot is CLEAN
**When** publication performs its final recheck
**Then** it squash-merges with `--match-head-commit H` exactly once
**And** checkout, fast-forward pull, spec-created label, existing-PR reuse, and post-merge failure results retain their semantics.

## Out of Scope
Implementation delivery controller, workflow prompts, MileDar branch or PR, auto-merge, and broad CI framework changes.
