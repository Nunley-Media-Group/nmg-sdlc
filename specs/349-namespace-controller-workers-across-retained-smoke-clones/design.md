# Root Cause Analysis: Namespace controller workers across retained smoke clones

**Issue**: #349
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/
---

## Root Cause

`runExecute` in `scripts/sdlc-execute.mjs` snapshots `existingAgents` via `firstAgentList(herdrApi.listAgents())` and, per issue, treats any name starting with `s${issue}-` as that issue's agents. Exact live lookup and new starts use `` `s${issue}-${step}` ``. Remediation uses exported `remAgentName(issue, step)` → `` `r${issue}-${step}` ``. Those strings are unique only within one Herdr inventory, not per project root or `runId`.

Mutable smoke (`steering/extensions/nmg-sdlc-smoke.mjs`) clones into a fresh tempdir per attempt and retains failed clones. The later clone creates a new `.omp/sdlc/run.json` with a new `runId` and `projectRoot`, then hits `if (step && !live && issueAgents.length > 0)` and `stopResult` `retained_worker_mismatch` against the earlier clone's `s39-start`. Ownership matching cannot save the later run: it never owned that pane.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-execute.mjs` | `remAgentName` (~758) | Legacy rem name `r${issue}-${step}` |
| `scripts/sdlc-execute.mjs` | new-run init (~1538) | Creates `runId` but no worker namespace |
| `scripts/sdlc-execute.mjs` | issue agent filter (~1919) | `startsWith(\`s${issue}-\`)` across the whole inventory |
| `scripts/sdlc-execute.mjs` | live/start/rem lookups (~1941, ~2038, ~2101, ~2333) | Exact `s${issue}-${step}` / `remAgentName(issue, step)` |

### Triggering Conditions

- Two execute controllers for the same issue number run in different `projectRoot`s under one Herdr.
- The earlier run still has a live `s{issue}-*` (or `r{issue}-*`) agent.
- The later run's next step looks up agents by issue prefix rather than run identity.
- Tests previously asserted that a fresh `#42` run stops on leftover `s42-verify`, so the global-prefix collision was treated as correct.

---

## Fix Strategy

### Approach

Keep ownership matching (`matchingWorkerOwnership`) and `retained_worker_mismatch` for **this run's** workers. Change only how worker **names** and **discovery prefixes** are computed so two runs cannot share a Herdr agent name.

Persist an optional checkpoint field `workerNamespace`. New checkpoints (the `if (!runState)` initializer that sets `runId: controllerRunId`) set `workerNamespace` to `createHash('sha256').update(runId, 'utf8').digest('hex').slice(0, 8)`. Resume of a checkpoint that already has a valid `workerNamespace` reuses that string (do not re-hash on each restart). A valid identity checkpoint **without** the field is legacy: keep `s${issue}-${step}` / `r${issue}-${step}` for that run only. Never write `workerNamespace` onto a legacy checkpoint during resume. Never add `workerNamespace` to `validRunIdentity` / `RUN_IDENTITY_FIELDS` (legacy checkpoints must still load).

Herdr names remain `^[a-z][a-z0-9_-]{0,31}$`. Namespaced forms are `s{ns}-{issue}-{step}` and `r{ns}-{issue}-{step}`. With 8-hex `ns` and step `implement` (10), issue numbers up to 11 digits still fit; if a constructed name fails the regex, `stopResult` `invalid_worker_name` and start nothing. If `workerNamespace` is present and not exactly `/^[0-9a-f]{8}$/`, `stopResult` `invalid_worker_namespace` before discovery/start.

Discovery: replace `startsWith(\`s${issue}-\`)` with this-run prefix `s${ns}-${issue}-` when `ns` is set, else the legacy `s${issue}-` prefix. Exact live and rem lookups use `stepAgentName` / `remAgentName` with the same `ns`. A namespaced run therefore ignores leftover `s39-start` from another clone. Same-run wrong-step prefix hits still `retained_worker_mismatch`. Unrelated panes stay open; do not close or prompt names that are not this run's constructed name.

Handoff paths, lease identity, and `--retain-worker` stay unchanged.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Import `createHash` beside `randomUUID`. Export `workerNamespaceForRunId(runId)`, `stepAgentName(issue, step, workerNamespace = null)`, and extend `remAgentName(issue, step, workerNamespace = null)`. | Single construction path; no second copy of the string template |
| `scripts/sdlc-execute.mjs` | New runState includes `workerNamespace: workerNamespaceForRunId(controllerRunId)`. | Stable per persisted `runId` |
| `scripts/sdlc-execute.mjs` | All `s${issue}-${step}` / `remAgentName(issue, step)` construction and the `s${issue}-` filter take resolved namespace from current `runState`. | Standard, review, rem, and deliver share the identity |
| `scripts/__tests__/sdlc-execute.test.mjs` | Fresh-run assertions use namespaced names; seeded checkpoints without the field keep `s42-*` / `r42-*`; add two-root inventory tests. | Lock the smoke-retry behavior |

### Blast Radius

- **Direct impact**: `scripts/sdlc-execute.mjs` worker naming, `run.json` optional `workerNamespace`, execute Jest fixtures that assume global `s42-*` on a **new** checkpoint.
- **Indirect impact**: any live resume of a namespaced run; smoke provider retries that share Herdr with a retained clone. Handoff files, GitHub, and pane-split direction are unchanged.
- **Risk level**: Medium — many tests hardcode `s42-*`, but seeded identity checkpoints stay on the legacy name path.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fresh run still prefix-matches leftover `s{issue}-*` | High without filter change | Namespaced discovery uses `s{ns}-{issue}-` only |
| Same-clone restart starts a second worker under a new name | Med | Persist `workerNamespace`; do not re-hash when the field exists |
| Legacy resume looks for namespaced names while `sN-step` is live | Med | Missing field ⇒ legacy names; do not backfill the field |
| Rem workers keep un-namespaced `rN-step` and collide | Med | `remAgentName` takes the same namespace |
| Name exceeds 32 characters | Low | Fail `invalid_worker_name`; 8-hex ns fits GitHub issue ids |
| Foreign pane closed during later clone start | Low | Close/prompt only this run's constructed agent name |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Hash `projectRoot` instead of `runId` | Unique per clone path | Two sequential runs in the same clone would collide if an old worker remained; issue requires identity per persisted run |
| UUID in the agent name | Full `runId` in the Herdr name | Exceeds the 32-character Herdr name contract from spec #194 |
| Auto-migrate legacy checkpoints by writing `workerNamespace` on resume | Force all resumes onto new names | Live legacy agents would be abandoned and possibly still prefix-matched; issue requires explicit fail-closed or safe resume |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
