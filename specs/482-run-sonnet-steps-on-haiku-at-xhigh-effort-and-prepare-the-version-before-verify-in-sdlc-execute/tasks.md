# Tasks: Run Sonnet steps on Haiku at xhigh effort and prepare the version before verify in /sdlc-execute

**Issue**: #482
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## Implementation Tasks

### T001: Model and effort tables

**File(s)**: `src/host-events.mjs`, `src/host-events.d.mts`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1: implement, deliver, and `sdlc-open-pr` map to `haiku`, and `SDLC_EFFORTS` maps them to `xhigh`

### T002: Stage worker effort

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC2/FR2: `stageEffort`, and `workerAgentArgs`/`agentStart` add `--effort` for implement and deliver only, never for a repair

### T003: Command file and agent frontmatter

**File(s)**: `src/sdlc-commands.mjs`, `commands/sdlc-open-pr.md`, `agents/spec-implementer.md`, `agents/deliverer.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC3: generated command frontmatter carries `effort: xhigh` for `/sdlc-open-pr` only
- AC4: both agents declare `model: haiku` and `effort: xhigh`

### T004: Controller version preparation

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC5/FR3/FR4: `prepare-version` runs before verify and deliver on a clean, published branch with no open PR, even when the merged spec PR shares the branch name. A changed head is verified first, a repeat makes no second commit, and a failure stops the run

### T005: Delivery backstop

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC6: an unprepared version fails `version_not_prepared` before any pull request is created

### T006: Tests

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/plugin-commands.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`
**Type**: Modify
**Depends**: T001–T005
**Acceptance**:
- Every AC1–AC6 behavior has a test that fails without the change

### T007: Documentation

**File(s)**: `README.md`, `CONTRIBUTING.md`, `steering/snippets/project-tech.md`, `steering/snippets/project-structure.md`, `workflows/open-pr/WORKFLOW.md`, `references/execute-implementable-requirements.md`, `specs/464-run-each-sdlc-step-on-its-assigned-claude-code-model/`
**Type**: Modify
**Depends**: T001–T005
**Acceptance**:
- AC7: docs and the #464 contract state the new models, efforts, and version-preparation order

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #482 | 2026-10-24 | Initial feature tasks |
