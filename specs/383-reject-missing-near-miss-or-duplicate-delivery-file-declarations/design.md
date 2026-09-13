# Root Cause Analysis: Reject missing, near-miss, or duplicate delivery File(s) declarations

**Issue**: #383
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/

---

## Root Cause

`parseDeliveryTaskFileLines()` tracks the current `### TNNN:` heading but acts only when it sees an exact `**File(s)**:` line. It has no end-of-task validation and no per-task declaration count. Therefore an admitted task with no exact line, or a near-miss `**Files**:` line, contributes zero paths without an error. Multiple exact lines append entries without rejecting ambiguous cardinality.

`inspectPublicationScope()` always seeds the result with the four spec files. A zero-declaration parse therefore still returns a non-empty allowed-path set. Existing execute preflight correctly calls this inspection before dispatch, but the parser reports no defect, so pane creation proceeds.

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-safe-recoveries.mjs` | Declaration parsing, located errors, and publication scope authority |
| `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | Parser and bind behavior regressions |
| `scripts/__tests__/sdlc-execute.test.mjs` | Zero-pane preflight regressions |
| `workflows/write-spec/WORKFLOW.md` | Approved-spec authoring contract |
| `README.md` | Public authorization contract |

## Fix Strategy

Track each task block before parsing its contents. For every task ID admitted by `taskIds`, collect exact canonical declarations and File(s)-like metadata labels with their source lines. At a task boundary and end of file:

1. reject zero exact declarations;
2. reject a File(s)-like near-miss label rather than interpreting it;
3. reject more than one exact declaration;
4. parse the one declaration value through unchanged `publicationFileEntries()`.

When `taskIds` is omitted, preserve generic template validation by validating every discovered `TNNN` task. Out-of-task lines and tasks excluded by `taskIds` remain ignored. Diagnostics retain `publication_scope_unproven` and include `spec`, `taskId`, the most useful source `line`, offending `entry` or label where available, and `PUBLICATION_FILE_SYNTAX`, updated to state exactly one declaration.

No execute-controller change is needed: its existing pre-dispatch calls and diagnostic rendering will surface the stronger parser result before `paneSplit`.

## Blast Radius

- **Direct**: approved task parsing, publish validation, execute/bind publication scope, write-spec contract, README.
- **Unaffected**: canonical value grammar, path expansion, task admission, verify-only scope, publication ownership, recovery, reviews, delivery.
- **Risk**: existing Approved specs with admitted tasks lacking exactly one declaration become intentionally non-executable.

## Regression Risk

| Risk | Mitigation |
|------|------------|
| Non-admitted tasks become authoritative | Test taskIds filtering and out-of-task near-miss metadata |
| Valid multi-task specs fail | Test one canonical declaration for each admitted task |
| Diagnostics lose malformed-value location | Keep existing invalid-value regression unchanged |
| Execute creates a start or implement pane first | Assert zero splits, starts, and bind subprocess calls for fresh-run fixtures |
| Template validation stops checking all tasks | Treat every discovered task as admitted when taskIds is absent |

## Alternatives Considered

| Option | Rejected because |
|--------|------------------|
| Accept `**Files**:` as an alias | Adds a second public grammar and hides malformed specs |
| Reject only when no declarations exist globally | Still permits one declared task to mask another undeclared task |
| Add a separate execute validator | Duplicates parser logic and allows publication/bind drift |

## Change History

| Issue | Date | Summary |
|---|---|---|
| #383 | 2026-09-13 | Initial root cause analysis |
