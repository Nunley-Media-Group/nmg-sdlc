# Design: Migrate completed legacy execute checkpoints before identity enforcement

**Issue**: #321
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/303-release-leftover-completed-execute-checkpoints-on-startup/
---

## Overview

Keep schema version 1 and the existing `/sdlc-execute` startup order. Split terminal workflow validation from identity classification so both current identity-bound cleanup and the released pre-identity shape share one strict completion predicate. A checkpoint is legacy-migratable only when all terminal workflow evidence is present and none of `projectRoot`, `runId`, `issue`, `branch`, `head`, or `revision` exists. Any partial identity tuple is mismatch evidence and cannot use either bind-in-place or legacy cleanup.

Capture the parsed checkpoint and its exact UTF-8 bytes from one read before controller lease acquisition. For a different requested issue list, pass those bytes into the existing `cleanupCompletedRun` boundary only for a fully unbound terminal checkpoint. Cleanup acquires the existing `run.json.lock`, rereads the checkpoint, requires byte equality and the same legacy terminal classification, performs the existing canonical-directory and link checks, deletes only exact run-owned artifacts, and deletes `run.json` last. Successful cleanup then falls through to the unchanged fresh-run initializer, which creates a new project/run/issue/branch/head identity and revision.

Identity-bound completion continues through the current `validRunIdentity`, `sameRunIdentity`, and revision checks. The controller lease is acquired before classification/cleanup and is never part of completed-run deletion. Extract its exact serialized-byte ownership check for use before and after cleanup and before fresh checkpoint persistence, then reuse the same predicate in `releaseControllerLease`. A foreign, missing, or changed lease therefore cannot authorize cleanup, fresh identity creation, or successful finalization. No command, schema version, handoff format, or public extension interface changes.

## Steering Alignment

- Product steering requires OS-agnostic behavior, evidence-backed delivery, and fail-closed execute sequencing.
- Technical steering requires Node 20 ESM, `node:` built-ins, `node:path`, argument arrays, deterministic Jest coverage, and no symlink traversal at deletion boundaries.
- Structure steering keeps execute state and cleanup logic in `scripts/sdlc-execute.mjs`, contract coverage in `scripts/__tests__/`, and native CI in `.github/workflows/`.

## Architecture

```text
readRunSnapshotAt(RUN_FILE, cwd)
  -> { runData, bytes }
          |
          v
acquireControllerLease(canonical cwd, existing runId or fresh UUID)
          |
          v
different requested issue list and run.json observed?
  | no                              | yes
  v                                 v
existing resume/fresh path     completed workflow state?
                                  | no -> exact identity mismatch
                                  v
                         identity classification
                         | complete valid identity
                         | no identity fields
                         | any partial/invalid identity -> mismatch
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
       bound cleanup contract           legacy cleanup contract
       exact identity + revision         exact snapshot bytes + no identity
                 +----------------+----------------+
                                  |
                                  v
                         exact owned deletion
                         run.json deleted last
                                  |
                                  v
                     unchanged fresh-run initializer
```

## Checkpoint Classification Contract

Use one identity field inventory in `scripts/sdlc-execute.mjs`:

```js
const RUN_IDENTITY_FIELDS = ['projectRoot', 'runId', 'issue', 'branch', 'head', 'revision'];
```

Replace the current all-fields `hasRunIdentity` helper with:

```js
function hasAnyRunIdentity(runData)
```

It returns true only when `runData` is an object and at least one listed field is an own property. Update both existing call sites: `writeRunAt` bind-in-place eligibility and `runExecute` unbound-resume eligibility. This clean cutover makes every partial tuple fail `identity_mismatch` / `Run checkpoint identity mismatch` instead of being rebound. `validRunIdentity` remains the complete typed identity predicate.

Extract the workflow-only terminal rules into:

```js
function completedWorkflowState(runData, { requireReleasedCurrentIssue = false } = {})
```

It requires schema version 1; a non-empty array of positive safe-integer issues; `currentStep === null`; `failed === null`; `remediation == null`; every `VALID_STEPS` member in every issue's completed list; and, when requested, `currentIssue === null`. Keep the two identity-specific wrappers:

```js
function completedRunState(runData, options)
function legacyCompletedRunState(runData, options)
```

`completedRunState` requires `validRunIdentity(runData)` plus `completedWorkflowState`. `legacyCompletedRunState` requires `!hasAnyRunIdentity(runData)` plus `completedWorkflowState`. Do not accept missing completion arrays, empty/invalid issue lists, current/failure/remediation state, partial identity fields, or schema versions other than 1.

| Checkpoint | Different requested list |
|------------|--------------------------|
| Complete valid identity and terminal workflow state | Existing identity-bound guarded cleanup, then fresh run |
| No identity fields and terminal workflow state | Exact-byte legacy guarded cleanup, then fresh run |
| Any non-empty proper identity subset | Status 1, exact identity-mismatch stderr, no mutation |
| Invalid complete identity | Status 1, exact identity-mismatch stderr, no mutation |
| Incomplete, active, failed, remediating, malformed, or non-v1 | Status 1, exact identity-mismatch stderr, no mutation |

## Snapshot and Cleanup Contract

Add one private snapshot reader; no equivalent currently returns parsed state and the exact bytes from one filesystem read:

```js
function readRunSnapshotAt(runFile, root = process.cwd())
// -> { runData: object | null, bytes: string | null }
```

It retains `readRunAt`'s canonical-root confinement. Missing or unreadable input yields `runData: null`; a successfully read file retains its UTF-8 `bytes` even when parsing or schema validation returns `runData: null`. `readRunAt` delegates and returns only `runData`, preserving its exported signature. `runExecute` uses the snapshot directly and treats a checkpoint observed in the snapshot, or present on the later existence check, as existing so removal or replacement during startup cannot silently become a fresh create.

Extend the exported cleanup signature without changing existing two-argument callers:

```js
export function cleanupCompletedRun(
  runData,
  root = process.cwd(),
  { expectedLegacyBytes, controllerLease } = {},
)
```

Behavior:

1. Resolve `canonicalRoot = realpathSync(root)` once. Bound mode requires `completedRunState(..., { requireReleasedCurrentIssue: true })` and `runData.projectRoot === canonicalRoot`. Legacy mode is selected only by a string `expectedLegacyBytes`, requires `legacyCompletedRunState(..., { requireReleasedCurrentIssue: true })`, and requires the current controller lease option.
2. Construct `.omp`, `.omp/sdlc`, handoff, provenance, checkpoint, lock, and temporary paths from `canonicalRoot` with host-native `node:path` functions. Run the existing `lstatSync` directory checks before deletion; symbolic links, Windows junctions reported as links, or non-directories fail.
3. When `controllerLease` is supplied, require the exact serialized lease bytes before acquiring `${runPath}.lock` and again after exact deletion. Acquire only `${runPath}.lock` with `openSync(..., 'wx')`; never steal an existing lock and never delete `controller.lock`. Legacy mode fails when the lease option is absent.
4. Reread `run.json` as UTF-8 while holding the lock. Bound mode retains the exact `completedRunState(existing)`, revision equality, and `sameRunIdentity(existing, runData)` checks. Legacy mode requires exact byte equality with `expectedLegacyBytes`, reparses those bytes, requires `legacyCompletedRunState(existing)`, and requires the parsed state to equal the classified `runData`; any changed bytes or classification fail before deletion.
5. Delete only `<issue>-<step>.json` handoffs for each listed issue and `VALID_STEPS`, `worker-<step>.json` prompt-provenance files, `run.json.tmp`, and finally `run.json`. Missing exact files are tolerated; directories are never recursively removed; unrelated runtime and `controller.lock` remain.
6. Close the acquired descriptor and unlink only the lock created by this attempt. Normalize validation, locking, path, parse, comparison, deletion, close, or owned-lock unlink failure to `Error('completed_cleanup_failed')`.

At the different-list startup branch, compute bound-terminal and legacy-terminal classification separately. Reject if neither is true. Call bound cleanup with the existing two arguments; call legacy cleanup with `{ expectedLegacyBytes: existingSnapshot.bytes }`. On success set the in-memory checkpoint and snapshot bytes to null and continue through the current dirty-tree check and fresh-run initialization. Cleanup exceptions keep exact stderr `Run checkpoint identity mismatch
`. The final successful-queue call at the current `cleanupCompletedRun(runState, cwd)` remains bound mode.

## Controller and Identity Invariants

Add one exported predicate in `scripts/sdlc-controller-lease.mjs`; no equivalent currently exposes the exact serialized ownership check:

```js
export function ownsControllerLease(lease)
```

It returns true only when the lease handle has a path and serialized value and the current file bytes equal `lease.serialized`; missing, unreadable, foreign, or changed bytes return false. Refactor `releaseControllerLease` to close its descriptor, call this predicate, and unlink only on true. `runExecute` passes the acquired lease through cleanup and checks it again immediately before fresh `persistRunState`.

- `acquireControllerLease` remains before runtime cleanup. A pre-existing foreign lease returns `controller_lease_held` before checkpoint or handoff mutation.
- The prospective fresh `controllerRunId` is generated once when the legacy checkpoint has no valid identity; successful cleanup and fresh checkpoint creation use that same id.
- `releaseControllerLease` continues comparing exact serialized lease bytes before unlink. A changed or foreign lease is preserved.
- `writeRunAt` still requires complete typed identity, `revision === expectedRevision + 1`, canonical project root, frozen issue list, same run/issue/branch/head, and atomic temporary-file rename.
- Partial identity tuples fail bind-in-place because `hasAnyRunIdentity` is true. Stale revision and branch/head drift leave checkpoint bytes unchanged.
- Cleanup never derives a project root, branch, head, or revision from legacy state. Fresh identity comes only from `realpathSync(cwd)`, `randomUUID()`, requested issues, and the existing argument-array git snapshots.

## Cross-Platform Verification Design

Extend `scripts/__tests__/sdlc-execute.test.mjs` with Node-only fixtures:

1. Add `legacyCompletedRunData(fields = {})` for the exact released issue-6 payload and a serializer that emits either LF or CRLF without shell utilities.
2. Generate all 62 non-empty proper subsets of `RUN_IDENTITY_FIELDS` in test code. Cross LF/CRLF with `path.posix` root `/consumer/project` and `path.win32` root `C:\consumer\project`; assign path-form values when `projectRoot` is present. Every partial subset returns exact mismatch stderr, preserves bytes, and starts no issue-19 worker. Repeat the fully unbound candidate in the same matrix and assert identical eligibility independent of newline or foreign path syntax labels.
3. Add an issue-6 to issue-19 controller regression that creates every exact owned handoff/provenance/temp file plus unrelated runtime with `fs`, starts with the unbound payload, and asserts owned removal, unrelated preservation, no mismatch stderr, worker start, and a complete fresh identity whose `projectRoot === fs.realpathSync(tempRoot)`.
4. Add changed-byte and changed-lease coverage by mutating the checkpoint or serialized controller lease through the controller fixture's mocked command seam after the initial snapshot/acquisition and before locked cleanup. Assert exact mismatch, preserved changed bytes, and no worker. Direct cleanup coverage also passes captured `expectedLegacyBytes`, changes only whitespace/newlines or workflow bytes, and expects `completed_cleanup_failed`.
5. Keep the existing held `run.json.lock`, deletion failure, and identity-bound cleanup cases. Add native unsafe-directory coverage: POSIX uses `fs.symlinkSync(..., 'dir')`; Windows always tests `fs.symlinkSync(..., 'junction')` and separately tests a directory symbolic link, marking only that symbolic-link case skipped when creation fails with an explicit privilege-denied code.
6. Expand CAS coverage so stale revision plus branch and head drift each throw the existing error and preserve exact bytes. Keep the existing foreign controller-lease test; add exact ownership checks proving a changed serialized lease blocks cleanup/fresh persistence, `ownsControllerLease` returns false, `releaseControllerLease` returns false, and the foreign/changed lease file remains.
7. Use `fs.mkdtempSync(path.join(os.tmpdir(), ...))`, `path.join` / `resolve` / `relative`, `path.posix`, `path.win32`, `process.execPath`, and child-process argument arrays. Do not add `rm`, `mkdir`, `ln`, `chmod`, shell scripts, shebang/executable-bit fixtures, slash concatenation, or newline assumptions.

Add a separate `checkpoint-portability` job to `.github/workflows/nmg-sdlc-verify.yml` without changing the existing `verify` job:

```yaml
checkpoint-portability:
  name: Checkpoint portability (${{ matrix.os }})
  strategy:
    fail-fast: false
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  runs-on: ${{ matrix.os }}
```

Its steps use `actions/checkout@v4`, `actions/setup-node@v4` with Node 20 and `scripts/package-lock.json` caching, `npm ci --no-audit --no-fund` in `scripts`, and `npm test -- --runInBand __tests__/sdlc-execute.test.mjs` in `scripts`. This native matrix is the required host evidence; simulated `path.posix` / `path.win32` fixtures do not substitute for it.

## Testing Strategy

| Layer | Location | Coverage |
|-------|----------|----------|
| Classification and byte boundary | `scripts/__tests__/sdlc-execute.test.mjs` | Exact released payload, LF/CRLF, POSIX/Windows path-form values, all 62 partial identity subsets, malformed/nonterminal states, and changed bytes. |
| Cleanup ownership | `scripts/__tests__/sdlc-execute.test.mjs` | Exact issue-step and worker-step deletion, temporary/checkpoint-last behavior, unrelated runtime preservation, lock and deletion failures. |
| Identity regression | `scripts/__tests__/sdlc-execute.test.mjs` | Bound cleanup, stale revision, branch/head drift, fresh complete identity, foreign/changed controller lease preservation. |
| Link boundary | `scripts/__tests__/sdlc-execute.test.mjs` | POSIX symbolic links; Windows mandatory junction and privilege-conditional symbolic link. |
| Native hosts | `.github/workflows/nmg-sdlc-verify.yml` | Focused execute suite on Ubuntu, macOS, and Windows with identical observable decisions. |
| Repository gates | steering manifest and existing workflow | Full Jest suite and mandatory `repository.nmg-sdlc-smoke` remain required during implementation verification. |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #321 | 2026-08-28 | Initial feature spec |

## Validation Checklist

- [x] Legacy eligibility is narrower than current identity-bound eligibility and shares one terminal workflow predicate.
- [x] Partial identity can neither bind nor migrate.
- [x] Exact bytes, lock ownership, canonical path confinement, link rejection, CAS, exact head, and controller lease ownership remain fail-closed.
- [x] Existing two-argument cleanup callers remain valid and every changed call site is enumerated.
- [x] Every acceptance criterion has deterministic Jest coverage and native cross-platform evidence.
