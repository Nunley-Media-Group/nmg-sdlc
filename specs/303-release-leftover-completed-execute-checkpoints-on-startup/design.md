# Design: Release Leftover Completed Execute Checkpoints on Startup

**Issue**: #303
**Date**: 2026-08-27
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/299-remove-completed-execute-runtime-checkpoints/

---

## Overview

`runExecute` currently compares the requested issue list with the persisted checkpoint before applying the completed-run cleanup introduced by issue #299. A terminal checkpoint with a different frozen list therefore reaches the identity-mismatch return even though it has no resumable work.

Startup will reuse the existing `completedRunState` ownership predicate and `cleanupCompletedRun` deletion boundary. When a persisted checkpoint is terminal and the requested issue list differs, the controller will release that checkpoint before the identity gate, then continue through normal new-run initialization. Cleanup failure remains fail-closed. Nonterminal checkpoints keep the existing identity behavior and exact stderr.

---

## Architecture

### Startup Data Flow

```text
read persisted checkpoint
        |
resolve requested eligible issue list
        |
requested list differs?
   | no                  | yes
resume existing run      |
                         v
               checkpoint fully completed?
                  | no              | yes
                  v                 v
       identity mismatch       owned cleanup
                                     |
                                     v
                              initialize new run
```

The implementation remains in `scripts/sdlc-execute.mjs`; regression coverage remains in `scripts/__tests__/sdlc-execute.test.mjs`.

---

## Interface Changes

No public command or data-schema change. The existing `/sdlc-execute` startup behavior changes only for a fully completed terminal checkpoint with a different requested issue list.

| Condition | Result |
|-----------|--------|
| Completed terminal checkpoint, different list | Release owned runtime and start the requested list |
| In-progress, blocked, failed, malformed, or cleanup-failing checkpoint, different list | Exit status 1 with `Run checkpoint identity mismatch` |
| Matching checkpoint | Resume existing behavior |

---

## Safety and Ownership

- Reuse `completedRunState` rather than introducing a second terminal-state definition.
- Reuse `cleanupCompletedRun` so lock, revision, identity, project-root, and symlink checks remain authoritative.
- Delete only handoffs and worker-provenance files owned by the completed run.
- Treat cleanup failure as an identity mismatch; never proceed while the old checkpoint remains.

---

## Alternatives Considered

| Option | Description | Decision |
|--------|-------------|----------|
| Ignore identity for any different list | Start a new queue regardless of checkpoint state | Rejected: discards resumable ownership evidence. |
| Delete `run.json` directly at startup | Remove only the checkpoint before comparison | Rejected: bypasses ownership checks and leaves run-owned artifacts. |
| Reuse completed cleanup before identity failure | Apply the issue #299 predicate and deletion boundary to terminal leftovers | Selected: one terminal-state and cleanup contract. |

---

## Testing Strategy

| Contract | Coverage |
|----------|----------|
| AC1 | Seed a completed terminal checkpoint and owned artifacts, request a different issue, assert cleanup and new worker start. |
| AC2 | Parameterize in-progress, failed, and blocked/nonterminal checkpoints; assert exact mismatch stderr, unchanged bytes, retained artifacts, and no worker start. |
| AC3 | Preserve the existing same-invocation completion-followed-by-new-run regression. |
| Cleanup failure | Make an owned artifact undeletable and assert startup fails closed without starting a worker. |

Run the focused execute-controller suite, the full Jest suite, and the repository verification command declared by steering.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Misclassifying a resumable run as completed | Loss of recovery state | Require all issues to contain every valid step and require cleared current fields, failure, and remediation. |
| Racing checkpoint mutation during cleanup | Removing another controller's state | Preserve lock, revision, and identity comparisons in `cleanupCompletedRun`. |
| Partial artifact deletion | Ambiguous runtime ownership | Fail closed through the existing cleanup error contract. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #303 | 2026-08-27 | Initial defect design |
