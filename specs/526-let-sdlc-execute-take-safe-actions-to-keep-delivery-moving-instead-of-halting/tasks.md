# Tasks: Let /sdlc-execute take safe actions to keep delivery moving instead of halting

**Issue**: #526
**Date**: 2026-10-26
**Status**: Approved
**Author**: Rich Nunley
**Related Spec**: specs/491-make-the-sdlc-execute-session-an-opus-supervisor-that-inspects-and-steers-every-worker-stage/

## Implementation Tasks

### T001: Let the execute supervisor take any safe, reversible, progressing action

**File(s)**: `workflows/execute/WORKFLOW.md`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `### Environmental verify failures` is replaced by `### Safe actions`, which authorizes, at start, implement, verify, and deliver and after non-report controller exits, any action that is safe, reversible, and moves the issue toward delivery of its spec, without asking the person and whether or not it is listed (FR1, AC1)
- The section defines safe and reversible as changing no tracked repository file, losing no work or data that cannot be regenerated, and touching no shared or production system (AC1)
- The section gives every AC2 example and states the examples are illustrative, not exhaustive (AC2)
- The section tells the supervisor to continue after an action with `prompt` for a live worker, `redispatch` with guidance naming the fix, or a rerun of `supervise` for an exited controller (AC1)
- The output table's "Anything else" row tells the supervisor to remediate a transient or remediable controller exit and rerun `supervise` from the project root, and otherwise stop with its exit code (FR2)
- The `halt` decision row is limited to the four AC3 cases (FR3, AC3)
- The workflow still forbids editing product code, specs, or other tracked repository files, committing, pushing, opening PRs, bypassing branch protection or required checks, and `herdr server stop`, and still requires the full-green registered gate at the exact source head (FR4, AC4)
- A `### Hung worker processes` section tells the supervisor, when a check-in shows no progress while a worker-started process has used about 0% CPU for several minutes, to check process activity and either stop the hung process or `prompt` the worker with the diagnosis instead of choosing `continue` again (FR5, AC5)
- Decision commands, the decision set, and the report output contract are unchanged

### T002: Document stage-independent remediation

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- The README execute supervision text describes safe remediation at every stage and the narrowed `halt` cases instead of verify-only environment repair
- `CHANGELOG.md` `[Unreleased]` has a bullet describing the change that ends with `(#526)`

### T003: Cover the rendered execute workflow with a contract test

**File(s)**: `scripts/__tests__/execute-safe-remediation-contract.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- Renders the workflow with `renderInteractiveWorkflow('sdlc-execute', repoRoot, '')` from `src/sdlc-commands.mjs` (FR6)
- AC1: asserts the Safe actions section authorizes any safe, reversible action that moves toward delivery without asking, names start, implement, verify, deliver, and non-report controller exits, gives the safe-and-reversible definition, and names the `prompt`, `redispatch`, and rerun-`supervise` continuations; asserts `### Environmental verify failures` is absent
- AC2: asserts the examples are stated as not exhaustive and each of the nine examples appears (including `rdctl`, `.git/info/exclude`, project root, and regenerable caches)
- AC3: asserts the `halt` row contains the four limited cases and no longer contains "No worker can fix it"
- AC4: asserts the prohibitions (product code, specs or other tracked repository files, commit, push, PRs, branch protection or required checks, `herdr server stop`) and the full-green registered gate at the exact source head remain
- AC5: asserts the hung-process guidance (about 0% CPU, check process activity, stop the process or `prompt`, not `continue` again)
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #526 | 2026-10-26 | Initial feature tasks |
