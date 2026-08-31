# Design: Add explicit recovery for confirmed stale controller leases

**Issue**: #328
**Date**: 2026-08-30
**Status**: Approved
**Author**: NMG
**Related Spec**: Existing controller lease and worker ownership contract

---

## Overview

Add one explicit, opt-in recovery path to the execute controller. `/sdlc-execute --recover-stale [#N ...]` may reclaim the lease for the current checkpoint run only after two independent observations both prove that the recorded controller is gone: the recorded PID is absent and a successful, structurally valid Herdr agent listing contains no agent in the exact recorded controller pane. Recovery is never inferred from elapsed time, a failed observation, a malformed record, a name prefix, or a foreign run identity.

The recovery path runs after the existing read-only execute preflight and before ordinary lease acquisition. When its evidence gate passes, it removes only the exact stale lease snapshot and then allows the normal controller to acquire the same run lease. When any evidence is live, unknown, malformed, or mismatched, it returns the existing `controller_lease_held` failure and leaves all protected state untouched. No new lease schema or worker-ownership model is introduced.

---

## Steering Alignment

- Product steering requires `/sdlc-execute` to remain the automated Herdr delivery entrypoint and keeps workers free of interactive questions.
- Technical steering requires Node 20 ESM, cross-platform process/path handling, exact ownership, and fail-closed controller coordination.
- Structure steering keeps lease and execute behavior in `scripts/`, executable workflow contracts in `workflows/`, synchronized file-command text in `commands/`, and public behavior in `README.md`.

---

## Architecture

```text
/sdlc-execute [--recover-stale] [--retain-worker] [#N ...]
                  |
                  v
       parse flags and issue tokens
                  |
                  v
       existing read-only execute preflight
                  |
                  v
       current checkpoint run identity
                  |
                  v
       read exact controller lease snapshot
                  |
        +---------+---------+
        |                   |
   no lease          lease for another run,
        |             malformed lease, or
        |             mismatched checkpoint
        |                   |
        v                   v
 normal acquire       controller_lease_held

       same-run lease
              |
              v
       prove PID absent
              |
              v
  successful complete Herdr listing
  proves exact controller pane absent
              |
        +-----+-----+
        |           |
      both false   either live/unknown
        |           |
        v           v
 atomic snapshot   controller_lease_held
 reclaim + acquire   (lease unchanged)
        |
        v
 normal execute lifecycle
```

The recovery branch is controller-only. It does not close panes, kill processes, alter worker records, modify checkpoints, or bypass any later execute gate.

---

## Data Flow

1. Parse the optional `--recover-stale` flag once among the existing issue tokens; preserve normal token order, deduplication, and default-backlog selection.
2. Complete the existing read-only preflight, including current checkpoint identity checks, before attempting recovery.
3. Resolve the canonical project root and read the current lease's raw bytes and validated record.
4. Reject a missing, malformed, unreadable, or foreign-run lease as held without Herdr inspection.
5. Probe the recorded PID. Only a definite absent result is acceptable; live or unknown results preserve the lease.
6. Run `herdr agent list`. Only a successful listing with valid pane identities for every listed agent is authoritative. The exact recorded pane must be absent; a name prefix or incomplete listing is not sufficient.
7. Re-read and compare the lease snapshot immediately before reclaim. If the bytes or record changed, fail closed.
8. Remove the exact stale snapshot with a no-clobber atomic sequence. If another lease appears during the sequence, preserve the new lease and do not overwrite it during restoration.
9. Acquire the normal controller lease for the same checkpoint run and continue through the existing execute lifecycle.

---

## API / Interface Changes

### Execute command

```text
/sdlc-execute [--retain-worker] [--recover-stale] [#N ...]
```

`--recover-stale` is optional and accepted at most once. It may appear before, between, or after issue tokens, just like the existing retention flag. Repeated or unknown flags retain the stable usage failure. The option is passed through the empty-selection contract when the command has no explicit issue tokens.

### Recovery result and failures

| Result | Contract |
|--------|----------|
| Confirmed stale same-run lease | Reclaim the lease, print `Recovered stale controller lease.`, then start the normal controller. |
| Live PID or exact pane present | Return status 1 with `controller_lease_held`; preserve the lease. |
| Unknown PID, failed/unknown Herdr listing, or malformed listed agent | Return status 1 with `controller_lease_held`; preserve the lease. |
| Foreign run or checkpoint identity mismatch | Return the existing held/identity-mismatch failure before pane inspection; preserve protected artifacts. |
| Lease changed or appeared during recovery | Return status 1 with `controller_lease_held`; preserve the latest lease bytes. |
| No `--recover-stale` | Do not inspect stale ownership evidence; retain ordinary existing-lease rejection. |

No public JavaScript export or external storage format changes beyond the existing lease helper interface are required.

---

## Lease Recovery Contract

### Identity gate

Recovery requires all of the following:

- The current checkpoint is a valid run identity for the canonical project.
- The current checkpoint issue selection matches the requested issue selection under existing execute rules.
- The lease record is valid for the same canonical project.
- The lease `runId` equals the current checkpoint `runId`.
- The raw lease bytes and parsed lease record used for recovery are the same snapshot at the final reclaim boundary.

A foreign lease is never inspected for process or pane liveness. A malformed lease is treated as held rather than repaired or deleted.

### Process evidence

Use the existing platform-neutral process probe. Its outcomes are classified as:

| Probe result | Meaning for recovery |
|--------------|----------------------|
| `false` | PID is definitely absent; continue to pane evidence. |
| `true` | PID is live; preserve lease and fail held. |
| `null` or any unknown/error outcome | PID status is uncertain; preserve lease and fail held. |

The PID probe is repeated at the final ownership check so a process that reappears cannot be reclaimed based on an older observation.

### Pane evidence

Call the existing Herdr agent listing through the controller's Herdr adapter. The listing is authoritative only when the command succeeds, the response has a recognized agent array, and each listed agent has a non-empty pane identity. Compare pane IDs exactly after string normalization. The recorded pane is absent only when no listed agent has that exact pane ID.

A present exact pane, a failed command, an unrecognized response, a malformed agent row, or an unknown pane identity is held evidence. Agent names are not used as a substitute for pane identity, and prefix-matched names do not establish absence or ownership.

The pane probe is repeated at the final ownership check when needed by the shared reclaim callback.

### Atomic reclaim

The lease helper receives the expected raw bytes and parsed record. It must:

1. Read the current lease bytes and reject any mismatch with the expected snapshot.
2. Validate the current record, same-run identity, and both definite-absence observations.
3. Rename the lease to a unique stale path on the same filesystem.
4. Re-read the moved bytes and verify they still equal the expected snapshot.
5. Require that the original lease path is still absent before deleting the stale snapshot.
6. If every check succeeds, delete only the moved expected snapshot.
7. If any later step fails, restore the old snapshot with an atomic no-clobber operation. If a new lease already occupies the original path, leave that lease untouched and discard only the old stale snapshot when safe; otherwise retain the stale copy for evidence.

The recovery operation never writes a replacement lease over an existing path. A changed or newly-created lease therefore wins the race and remains intact.

---

## Storage Changes

### Schema

No schema migration. The existing `.omp/sdlc/controller.lock` JSON record remains:

```json
{
  "schemaVersion": 1,
  "projectRoot": "<canonical project root>",
  "runId": "<current checkpoint run id>",
  "controllerPaneId": "<recorded Herdr controller pane>",
  "pid": 12345,
  "startedAt": "<ISO timestamp>"
}
```

Recovery deletes only a confirmed-dead record for the current run. It does not add a stale marker, rewrite a malformed lease, or modify `.omp/sdlc/run.json`, handoffs, verification evidence, branches, or worker records.

---

## State Transitions

```text
No lease
  └── normal acquisition ──▶ owned current-run lease

Same-run lease + PID absent + exact pane absent
  └── --recover-stale atomic reclaim ──▶ no lease
                                      └── normal acquisition ──▶ owned current-run lease

Same-run lease + any live/unknown/malformed evidence
  └── --recover-stale ──▶ controller_lease_held; same lease bytes

Foreign/malformed lease
  └── --recover-stale ──▶ controller_lease_held; same lease bytes

Lease changed/new during reclaim
  └── atomic comparison ──▶ controller_lease_held; latest lease wins

Any existing lease without --recover-stale
  └── normal acquisition ──▶ controller_lease_held; no evidence inspection
```

`--retain-worker` remains an independent lifecycle option. It still controls whether controller-owned worker panes are intentionally kept after terminal stops and does not authorize stale lease recovery.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Silent stale cleanup | Delete a lease whenever its owner appears old or absent | Simple recovery | Unsafe under partial process or pane observations; changes default behavior | Rejected |
| PID-only recovery | Reclaim after the recorded process disappears | Works without Herdr inspection | PID reuse and unavailable process probes cannot prove controller absence | Rejected |
| Pane-only recovery | Reclaim after the recorded pane disappears | Uses the controller's runtime identity | Pane listing can be unavailable or incomplete; process may still be alive | Rejected |
| Replace-in-place recovery | Write a new lease over the old file | Short implementation | Can clobber a lease acquired between observations | Rejected |
| Explicit dual-evidence recovery | Require `--recover-stale`, same run, absent PID, absent exact pane, and atomic snapshot protection | Preserves fail-closed defaults and protects concurrent owners | Requires two observations and may leave an uncertain lease for manual diagnosis | **Selected** |

---

## Security and Safety Considerations

- Lease ownership is not inferred from names, age, or a single liveness signal.
- Foreign and malformed lease records remain protected and are not normalized or deleted.
- Exact pane identity prevents unrelated agents with similar names from being treated as the recorded controller.
- Unknown process or Herdr outcomes fail closed.
- Snapshot comparison and no-clobber restoration protect a new controller that wins a race.
- Recovery performs no process termination or pane closure, limiting its side effects to the confirmed stale lease.
- Existing canonical-root validation remains authoritative; symlink or foreign-root tricks do not broaden the recovery scope.

---

## Performance Considerations

Recovery is opt-in and runs once during controller startup. It adds one lease read, a bounded process probe, and one Herdr agent listing (with a final recheck as required by the atomic reclaim callback). Normal execution without `--recover-stale` retains its existing startup path and does not inspect owner evidence.

---

## Testing Strategy

| Layer | Location | Coverage |
|-------|----------|----------|
| Lease helper | `scripts/__tests__/sdlc-controller-lease.test.mjs` | Same-run stale reclaim, live/foreign preservation, malformed input, snapshot comparison, and no-clobber restoration when a new lease appears. |
| Execute argument contract | `scripts/__tests__/sdlc-execute.test.mjs` | Single flag parsing, duplicate rejection, issue-token preservation, and interaction with `--retain-worker`. |
| Execute recovery | `scripts/__tests__/sdlc-execute.test.mjs` | Confirmed-dead PID and absent exact pane success; live and unknown PID; live, unknown, and malformed Herdr listing; foreign run; checkpoint mismatch; changed lease; and final liveness rechecks. |
| Default regression | `scripts/__tests__/sdlc-execute.test.mjs` | No flag preserves held-lease behavior without pane inspection and leaves worker starts/mutations empty. |
| Active command contracts | `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`, `commands/sdlc-execute.md`, `README.md` | Public and generated invocation text documents both flags, explicit recovery, and unchanged defaults. |
| Integration | execute controller smoke | Successful recovery proceeds into the ordinary controller acquisition and lifecycle rather than a special recovery-only path. |

Every acceptance criterion maps to one or more deterministic Jest scenarios in the existing controller test suites. No new dependency or external service is required for unit coverage; Herdr responses are supplied through the existing adapter fixtures.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A live controller is reclaimed after a transient probe failure | Low | High | Require definite absence from both probes; unknown outcomes remain held; repeat probes before reclaim. |
| A different agent is mistaken for the controller | Low | High | Compare the exact recorded pane ID and reject malformed listings. |
| A new controller lease is clobbered during recovery | Med | High | Compare raw snapshot bytes, rename to a unique path, check no replacement path, and restore no-clobber. |
| Recovery changes ordinary execute semantics | Low | Med | Keep all recovery work behind the explicit flag and assert no-flag tests do not inspect owner evidence. |
| Retained worker cleanup becomes coupled to lease recovery | Low | Med | Keep `--retain-worker` as a separate option and do not close panes in the recovery helper. |
| Cross-platform PID or Herdr behavior differs | Med | Med | Use existing process adapter and Herdr adapter contracts; classify unsupported/unknown results as held. |

---

## Open Questions

None. The recovery boundary, evidence requirements, atomicity rule, default behavior, and retention interaction are specified by the issue acceptance criteria.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #328 | 2026-08-30 | Initial feature spec |

---

## Validation Checklist

- [x] Architecture follows existing project patterns (per `structure.md`)
- [x] Interface change and error outcomes are documented
- [x] Existing lease storage remains unchanged; no migration is needed
- [x] State transitions and default behavior are explicit
- [x] Safety considerations address process, pane, malformed, foreign, and race evidence
- [x] Performance impact is bounded and opt-in
- [x] Testing strategy covers every acceptance criterion
- [x] Alternatives were considered and the explicit dual-evidence path selected
- [x] Risks identified with mitigations
