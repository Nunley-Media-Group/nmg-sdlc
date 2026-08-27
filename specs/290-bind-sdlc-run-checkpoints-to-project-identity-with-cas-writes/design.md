# Root Cause Analysis: Bind SDLC run checkpoints to project identity with CAS writes

**Issue**: #290
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/
---

## Root Cause

`readRun()` / `writeRun()` in `scripts/sdlc-execute.mjs` persist schemaVersion 1 workflow fields only (`issues`, `currentIssue`, `currentStep`, `completed`, `failed`, `startedAt`, plus optional `remediation` from #259). `writeRun` mkdir's `.omp/sdlc/` and `handoffs/`, then `writeFileSync`s `.omp/sdlc/run.json` with no identity fields, no revision, no lock, and no compare against the previous bytes. `readRun` accepts any `schemaVersion === 1` JSON from `join(root, '.omp/sdlc/run.json')`.

`runExecute` replaces the in-memory object whenever `JSON.stringify(runState.issues) !== JSON.stringify(issues)` and later `writeRun`s that replacement, so a second helper in the same tree can clobber a failed-at-verify checkpoint with another issue's state. The `write-run` CLI parses argv JSON and calls `writeRun(data)` with the same unconditional overwrite.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-execute.mjs` | `readRun`, `writeRun` (approx. 360–383) | Unconditional schemaVersion 1 read/write of `.omp/sdlc/run.json` |
| `scripts/sdlc-execute.mjs` | `write-run` CLI (approx. 2079–2092) | Overwrites cwd run.json from argv JSON |
| `scripts/sdlc-execute.mjs` | `runExecute` runState init (approx. 1190–1200) and every `writeRun(runState, cwd)` / `stopResult` persist | Replaces or mutates checkpoints without CAS |
| `scripts/__tests__/sdlc-execute.test.mjs` | `writeRun creates run and handoff state…`, `write-run CLI persists run state`, fixture `writeRun({ schemaVersion: 1, … })` helpers | Seeds and asserts the unbound overwrite API |

### Triggering Conditions

- Two helpers (or a helper plus `write-run` / restored bytes) target the same `.omp/sdlc/run.json`.
- The later writer supplies any `schemaVersion: 1` object.
- No expected revision or identity tuple is compared, so the later `writeFileSync` wins.

---

## Fix Strategy

### Approach

Keep `schemaVersion: 1`. Extend the on-disk object with identity and revision, and make `writeRun` the only writer: exclusive lock, compare-and-swap, atomic replace. `writeRun` does not call git; callers snapshot identity. `runExecute` copies identity from the last successful read and never forges a new identity over an existing file.

Exact `writeRun` signature:

```js
export function writeRun(runData, root = process.cwd(), expectedRevision = 0)
```

`expectedRevision` must be an integer `>= 0`. `runData.revision` must be the integer `expectedRevision + 1`. Invalid payload or `schemaVersion !== 1` throws `Error('invalid run schema')` before touching `run.json`.

Required identity fields on every write (top-level, not nested):

| Field | Type | Rule |
|-------|------|------|
| `projectRoot` | non-empty string | Must equal `realpathSync(root)` |
| `runId` | non-empty string | Opaque; create with `randomUUID()` from `node:crypto` |
| `issue` | positive safe integer | Bound issue at first successful write (`currentIssue` at create). Frozen for the file lifetime. Need not equal later `currentIssue` when the same queue advances. |
| `branch` | non-empty string | Frozen snapshot from create (`git branch --show-current`). Not re-read from git on later writes. |
| `head` | non-empty string | Frozen snapshot from create (`git rev-parse HEAD`). Not re-read from git on later writes. |
| `issues` | array of positive safe integers | Frozen; in-place writes must `JSON.stringify` equal the on-disk array. |
| `revision` | positive safe integer | Exactly `expectedRevision + 1` |

Mutable workflow fields (same-identity writes may change): `currentIssue`, `currentStep`, `completed`, `failed`, `startedAt`, `remediation`.

Lock and CAS (no new npm deps):

1. `mkdirSync` `.omp/sdlc` and `handoffs` as today.
2. `openSync(join(root, '.omp/sdlc/run.json.lock'), 'wx')`. `EEXIST` → throw `Error('checkpoint_locked')` without reading or writing `run.json`. Do not unlink a lock this process did not create. Other open errors propagate.
3. With the fd held:
   - If `run.json` is absent: `expectedRevision` must be `0`; write `runData` as revision 1.
   - If `run.json` exists: read existing bytes. On parse failure or missing/invalid identity+revision, throw `Error('identity_mismatch')` and do not write, except the unbound v1 bind-in-place rule below.
   - Bound file: if `existing.revision !== expectedRevision` throw `Error('stale_revision')`. If `projectRoot`, `runId`, `issue`, `branch`, `head`, or `issues` differ from `runData`, throw `Error('identity_mismatch')`. Otherwise accept.
   - Write `JSON.stringify(runData, null, 2) + '\n'` to `join(root, '.omp/sdlc/run.json.tmp')`, then `renameSync` onto `run.json`.
4. `finally`: `closeSync(fd)` and `unlinkSync` the lock path this process created. Leave `run.json` bytes unchanged on any throw before rename.

Unbound schemaVersion 1 file (missing any of `projectRoot`, `runId`, `issue`, `branch`, `head`, `revision`): treat on-disk revision as `0`. Bind-in-place only when `expectedRevision === 0`, payload has full identity with `revision === 1`, and existing `issues` / `currentIssue` (when present) equal the payload. Otherwise `identity_mismatch`. Do not delete the unbound file.

`readRun(root)` stays non-throwing: missing/unreadable/non-v1 → `null`. Valid v1 including unbound v1 still returns the object so resume can bind. Do not treat identity mismatch as missing: a present file that `readRun` cannot use as a new run must still block create via `writeRun` seeing the path.

`runExecute` create vs resume:

- No `run.json`: snapshot `projectRoot = realpathSync(cwd)`, `runId = randomUUID()`, `issue = issues[0]`, `branch` / `head` from `git branch --show-current` and `git rev-parse HEAD` through the existing `run()` helper. Empty branch or head → return status 2, stderr exactly `Run checkpoint identity unreadable\n`, no write. Else `writeRun(runState, cwd, 0)` with `revision: 1`.
- Existing bound checkpoint whose `issues` stringify-equal the requested list: reuse it; copy identity; persist via CAS.
- Existing file whose `issues` differ, or whose identity cannot be bound: do not replace. Return status 1, stderr exactly `Run checkpoint identity mismatch\n`, no `writeRun`.

Shared persist used by `stopResult` and every in-run `writeRun(runState, cwd)`:

```js
function persistRunState(runState, cwd) {
  const expectedRevision = Number.isSafeInteger(runState.revision) ? runState.revision : 0;
  const previous = runState.revision;
  runState.revision = expectedRevision + 1;
  try {
    writeRun(runState, cwd, expectedRevision);
  } catch (error) {
    runState.revision = previous;
    throw error;
  }
}
```

If `persistRunState` throws during `runExecute` / `stopResult`, fail closed (status 1) without retrying the write. Do not increment twice.

`write-run` CLI: require `--expected-revision N` (integer `>= 0`) plus the JSON object as remaining argv joined by spaces, same as today. Missing flag or non-integer → exit 2, stderr `Usage: node sdlc-execute.mjs write-run --expected-revision N <json>\n`. On `writeRun` throw, stderr is the error message plus newline, exit 1.

Test fixtures in `scripts/__tests__/sdlc-execute.test.mjs`: add a local `seedRun(root, fields = {})` that calls `writeRun` with `expectedRevision` 0, `revision` 1, `projectRoot: fs.realpathSync(root)`, `runId: fields.runId ?? 'test-run-id'`, `issue: fields.issue ?? fields.currentIssue ?? 42`, `branch: fields.branch ?? 'issue-branch'`, `head: fields.head ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'`, plus existing workflow fields. Replace every fixture `writeRun({ schemaVersion: 1, … }, root)` and the two unit tests that write only `{ schemaVersion: 1 }` so they go through `seedRun` or an explicit identity payload. Do not add `seedRun` to production.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | CAS `writeRun`, lock, identity validation, `persistRunState`, fail-closed `runExecute` create/resume, `write-run --expected-revision` | Root cause is unconditional overwrite |
| `scripts/__tests__/sdlc-execute.test.mjs` | `seedRun` plus AC1/AC2 regression tests; update fixtures | Prove reject-and-preserve and same-identity advance |

### Blast Radius

- **Direct impact**: `readRun` / `writeRun` / `write-run` / every persist in `runExecute` and `stopResult`.
- **Indirect impact**: execute resume, remediation persists, controller fixtures that seed `run.json`.
- **Risk level**: Medium — every persist must pass expected revision; wrong default would fail all execute tests.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Multi-issue queue cannot persist after `currentIssue` advances | Med | Freeze `issue` as create-time bind; allow `currentIssue` to change |
| Live git HEAD moves during implement and later persists fail | Med | `writeRun` does not re-query git; identity.head/branch are copied from the last checkpoint |
| Unbound in-progress `run.json` after upgrade cannot resume | Med | Bind-in-place when `issues`/`currentIssue` match and `expectedRevision` is 0 |
| Leftover lock blocks execute | Low | Fail `checkpoint_locked`; do not steal locks (out of scope) |
| Two processes both read revision N without the lock | Low | Hold `wx` lock across read-compare-rename |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Bump `schemaVersion` to 2 | New schema, reject v1 | #259 kept v1; resume of in-flight runs would break |
| CAS revision only, no identity tuple | Stale expectedRevision rejects | A second helper that also read N can still clobber with a different issue before the first writes |
| Nested `identity: { … }` object | Group fields | Issue names top-level bind fields; keep them adjacent to existing top-level workflow keys |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
