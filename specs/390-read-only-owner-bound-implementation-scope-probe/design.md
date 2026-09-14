# Root Cause Analysis: Read-only owner-bound implementation scope probe

**Issue**: #390
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/383-reject-missing-near-miss-or-duplicate-delivery-file-declarations/

---

## Root Cause

`inspectPublicationScope()` conflates workflow inputs with mutation authority. It unconditionally seeds implementation scope with the four Approved spec documents and then expands task paths into one flat array. Consumers cannot distinguish tracked deliverables, explicitly untracked evidence, task provenance, or read-only context.

Owner binding is separately conflated with mutation. `bind` enters the controller lease and calls `resolveRecoveryOwner()`, which may persist a new owner or planned subject. That behavior is correct for publication, but unsafe as a pre-edit probe. The resolver reads the actual Git branch but does not expose run/owner branch disagreement; an old `run.json.branch` can remain invisible while the state-changing command binds against another branch.

## Design

### Structured scope

`inspectPublicationScope()` returns one object with exactly these keys:

```json
{
  "trackedWritablePaths": ["scripts/example.mjs"],
  "untrackedEvidencePaths": ["artifacts/example.json"],
  "taskOperations": [
    {
      "taskId": "T001",
      "operations": [
        {
          "path": "scripts/example.mjs",
          "operation": "Modify",
          "provenance": {
            "label": "File(s)",
            "line": 24,
            "declaration": "`scripts/example.mjs` (Modify)"
          }
        }
      ]
    }
  ],
  "readOnlyPaths": ["specs/390-slug/tasks.md"],
  "allowedPaths": ["scripts/example.mjs"]
}
```

The four exact spec documents begin in `readOnlyPaths`, never in a writable collection. `allowedPaths` is the sorted union of `trackedWritablePaths` and `untrackedEvidencePaths`.

Writable operations are `Create`, `Modify`, and `Delete`. Explicit untracked evidence operations are `Download untracked` and `Generate untracked`. A path-level parenthetical operation wins over a task-level single `**Type**` operation. Existing non-operation notes remain notes; a declaration that purports to specify an operation but is unsupported fails closed. Task operations retain every occurrence and source line. Aggregate reduction de-duplicates paths; any writable declaration removes the same path from aggregate read-only inputs. Create followed by Modify remains one tracked allowed path while both operations remain in provenance.

`**Read-only**` values contribute only valid repository-relative backtick paths. `**Acquire**` contributes repository-relative file inputs named in the command; inputs that are also separately writable are removed from aggregate `readOnlyPaths`. These labels never grant mutation authority.

### Read-only owner binding

Export `probePublicationScope({ cwd, issue, step, spec, controllerRunId, run })`. It requires `step === 'implement'` and no recovery, session, prior-incomplete, or branch parameter. It:

1. Resolves the canonical root and actual attached Git branch.
2. Reads and validates `.omp/sdlc/run.json` as a regular file.
3. Requires the supplied controller id to equal `runId`, the project root and active issue/step to match, and the issue to belong to the run.
4. Reads `.omp/sdlc/safe-recoveries.json` without creating directories or files.
5. Requires exactly one incomplete owner matching canonical root, issue, actual branch, implement step, and controller/owner id.
6. Builds structured task scope.
7. Returns `{ passed: true, ownerId, binding, scope }`, where `binding` contains actual branch, selected run state, selected recovery-owner tuple, and structured discrepancies. A stale `run.json.branch` is a reported discrepancy, not silently trusted or repaired.

The `probe` CLI accepts exactly `--issue`, `--step implement`, `--spec`, and `--controller-run-id`. It bypasses `enterControllerLease()` entirely. Unknown, repeated, absent, or empty options return usage failure; binding failures return stable reason codes and no JSON success payload.

### State-changing publication

`bind` and `reconcile` continue to enter/release the controller lease and may use the existing mutation-capable owner resolver. They call structured scope inspection and pass only `scope.allowedPaths` to publication enforcement. Their JSON contains `scope` instead of a duplicate top-level flat allowlist.

The execute controller remains the owner-creation boundary. Before an implement worker is dispatched from the actual issue branch, it establishes/reuses the incomplete owner under its existing controller lease. The worker then runs the read-only probe before edits. Later subject-bound `bind` remains state-changing and may persist the planned subject.

### Consumer migration

- Execute preflight validates structured inspection and creates the implement owner only at the branch-bound dispatch boundary.
- Write-code runs `probe` before edits and reads only `scope.allowedPaths` for mutation authorization.
- Apply-review and delivery mergeability paths pass `inspectPublicationScope(...).allowedPaths`.
- Bind/reconcile pass only structured `scope.allowedPaths` to publication checks.
- Parse-only spec and upgrade consumers retain `parseDeliveryTaskFileLines()` because they validate canonical path grammar rather than mutation authorization.

## Failure Modes

| Condition | Result |
|-----------|--------|
| Detached or unreadable Git branch | `recovery_owner_unreadable` |
| Invalid/missing run checkpoint | `recovery_owner_unreadable` |
| Run id, root, issue, or step mismatch | `recovery_owner_ambiguous` |
| Zero matching owner | `recovery_owner_missing` |
| Multiple matching owners or conflicting id | `recovery_owner_ambiguous` |
| Unsafe run/recovery path | Existing unsafe-path reason |
| Missing/duplicate/near-miss task declaration | Located `publication_scope_unproven` |
| Unsupported operation annotation | Located `publication_scope_unproven` |
| Stale run branch only | Success plus branch discrepancy |

## Verification Strategy

1. Focused Jest coverage for parser reduction, exact PathCast fixture counts, consumer extraction, CLI option rejection, owner ambiguity, no lock, and byte-identical observed files.
2. Disposable real Git exercise using the exact PathCast T001-T004 task text and stale branch state.
3. Plugin surface, current/stability, contribution evidence, version synchronization, and `git diff --check`.
4. Workflow bundle validation through the resolved `skill-creator` validator.

## Security and Portability

All filesystem paths stay repository-relative and are validated through the existing publication path rules. Git commands use argument arrays. Root, state files, and owner tuples are validated without following state-file symlinks. The probe uses Node built-ins only and performs bounded synchronous startup reads appropriate for a one-shot CLI.

## Alternatives Rejected

| Alternative | Reason |
|-------------|--------|
| Add `--dry-run` to `bind` but still enter the lease | A dry-run that locks or can recover state is not read-only |
| Keep flat array and filter `specs/` in each consumer | Repeats policy and loses operation/provenance distinctions |
| Trust `run.json.branch` | Hides the grounded stale-branch defect |
| Repair stale branch during probe | Violates read-only behavior and seizes controller authority |
| Infer arbitrary untracked paths from Git status | Broadens authority beyond explicit Download/Generate declarations |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #390 | 2026-09-13 | Initial approved design |
