# Root Cause Analysis: Persist exact-head delivery CAS and isolated session tokens

**Issue**: #293
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/
---

## Root Cause

`scripts/sdlc-deliver.mjs` accepts only `--issue N` plus an optional remediation result. It writes `.omp/sdlc/handoffs/N-deliver.json` directly and does not prove that the caller owns the execute controller lease or an isolated runtime namespace. A standalone delivery for B can therefore use canonical runtime files while A owns the checkout checkpoint.

Delivery discovers an exact-branch PR on each invocation and carries its number/head only in memory and remediation packets. The controlled-draft path intentionally advances H1 to H2 after publishing final verification evidence, but no CAS state records which transition is authorized or which PR/head is now terminally expected. The merged-PR resume path compares the merged PR head to current local HEAD; a later report commit or external head change becomes generic `merge_failed` even when a prior head already merged.

Because no durable reconciliation state exists, a rerun can rediscover live PRs and proceed as a fresh attempt. Process exit and a handoff file are also separable: only the handoff contract proves terminal delivery, but callers can over-trust a successful helper command unless the controller makes exact MERGED+CLOSED proof the sole passed path.

The initial CAS implementation persists an existing PR's H1 before `publishVersionChanges` creates and pushes the version commit. Its next snapshot still expects H1, so a correctly advanced remote H2 is indistinguishable from foreign drift and triggers reconciliation. Existing-PR mocks hid this ordering defect by leaving the mocked remote PR at H1 after `git push`.

Execute also matches a live retained worker's recorded branch/head against the current checkout before calling `restoreActiveIssueBranch`. After an earlier issue's delivered branch is synchronized and removed, the checkout is on the default branch. A live next-issue non-start worker is therefore rejected even though its recorded ownership is exact.

Resumed isolated sessions validate each namespace directory segment, but then `readRunAt` follows a symlinked `run.json` and terminal handoff writes can follow a symlinked `handoffs` directory. A valid token therefore does not by itself preserve the namespace boundary after initialization.
Controller-owned delivery now writes `runState.delivery` through the same checkpoint CAS while execute retains an older in-memory revision. If cancellation closes the worker after that subordinate write, the signal handler deletes ownership from the stale object, `persistRunState` raises `stale_revision`, and the catch suppresses the failure before releasing the lease. The closed worker therefore remains recorded in a nonterminal checkpoint. A related settled-without-handoff path calls `herdr agent wait --until working`, so a worker that is already `idle` or `done` can block cleanup forever waiting for a transition that will never occur.


### Affected Code

| File | Lines / Symbols | Role |
|------|-----------------|------|
| `scripts/sdlc-deliver.mjs` | `publishVersionChanges`, `scopedSnapshot`, `runDeliver` | Must re-read and authorize the controller-owned existing-PR head advance immediately after version push |
| `scripts/sdlc-execute.mjs` | `restoreActiveIssueBranch`, retained-worker ownership matching | Must restore a safe active issue checkout before matching a live non-start worker |
| `workflows/open-pr/WORKFLOW.md` | controller invocation and remediation loop | Invokes delivery with issue only and treats one canonical handoff path as fixed |
| `scripts/__tests__/sdlc-deliver.test.mjs` | delivery controller fixture | Must model remote PR head movement after push and forbid pre-bump merge |
| `scripts/__tests__/sdlc-execute.test.mjs` | multi-issue resume fixture | Must cover default-branch checkout plus an exact live next-issue worker |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | workflow contract | Encodes current invocation and handoff path |
| `scripts/sdlc-deliver.mjs` | `resolveDeliveryNamespace`, `assertSafeSessionArtifacts` | Must reject unsafe isolated-session leaf artifacts before state reads or command invocation |
| `scripts/sdlc-execute.mjs` | signal cleanup, settled worker handling, checkpoint refresh | Must stop owned children, reload subordinate CAS writes, persist terminal cancellation before lease release, and never wait for future work from a settled worker |


### Triggering Conditions

- Standalone delivery starts without execute ownership while canonical run state belongs to another issue.
- PR number/head is selected but not persisted before later GitHub mutations.
- Controlled verification publication or an external actor changes or merges the PR head.
- A rerun has no durable reconciliation state preventing a second PR attempt.
- An existing PR is selected at H1 before delivery publishes its version commit at H2.
- A completed earlier issue leaves a clean multi-issue checkout on the default branch while the next issue's exact non-start worker remains live.
- An initialized isolated session's `run.json` file or `handoffs` directory is replaced by a symlink outside its token namespace before resume.
- A delivery child advances canonical run-state revision while execute waits with an older in-memory checkpoint, then cancellation or missing-handoff handling attempts to persist controller state.
- A worker settles `idle` or `done` without a handoff and execute waits for a future `working` transition.


---

## Fix Strategy

### Approach

Introduce a delivery state namespace abstraction backed by issue #290 CAS. Execute mode requires `--controller-run-id R`, verifies the issue #291 active lease and canonical checkpoint run id, and uses canonical `.omp/sdlc/run.json` plus `.omp/sdlc/handoffs/`. Standalone mode requires `--session-token T` and uses `.omp/sdlc/sessions/T/run.json` plus `.omp/sdlc/sessions/T/handoffs/`. The two options are mutually exclusive and exactly one is required for every mutating delivery invocation.

Add `session-init --issue N`. It generates a UUID token, creates the session directory with exclusive semantics, and writes revision-1 schemaVersion-1 run state bound to `realpathSync(cwd)`, token run id, issue/issues, current branch, and current head. It prints exactly one `NMG_SDLC_SESSION: <token>` line. Tokens must match lowercase UUID syntax and resolve only beneath the canonical sessions directory; symlinked or pre-existing ambiguous targets fail closed. Session creation does not touch canonical run.json or handoffs.

On isolated-session resume, validate the leaf artifacts after validating every directory segment and before calling `readRunAt`: `run.json` must exist as a regular non-symlink file, and `handoffs` must exist as a real non-symlink directory. Any mismatch fails as `unsafe_session_path`; no run state is read and no Git, GitHub, CAS, or handoff mutation begins.

Factor issue #290's run-file CAS core so canonical `writeRun()` retains its exact public signature while an internal/session wrapper can apply the same validation, lock, expected-revision compare, atomic temp rename, and immutable identity checks to an explicit session run path. Handoffs are written beneath the selected namespace. Execute mode continues to emit the canonical marker expected by its controller; session mode emits the session-relative marker and the open-pr workflow validates that exact returned path.

Add mutable `delivery` to the selected run state:

```json
{
  "issue": 42,
  "pullRequest": 77,
  "expectedHead": "40-hex-sha",
  "status": "expected | reconciliation_required | complete",
  "reconciliation": null
}
```

Before readying, polling, or merging a selected/created PR, CAS-persist `issue`, `pullRequest`, and the current authorized `expectedHead`. Intentional controller-owned transitions such as controlled-draft H1 to published-report H2 or a remediation push may update `expectedHead` only after proving the same PR, branch, prior expected head, clean local head, and matching scope; persist the new head with one CAS before further GitHub mutation.

On each entry and each fetched snapshot, if PR number or head differs from persisted expectation outside that authorized transition, or the PR is already MERGED at a different head, CAS-persist `status: reconciliation_required` and expected/observed PR, head, and state under `reconciliation`, then write failed handoff reasonCode `delivery_reconciliation_required`. If that status already exists, return the same failure and artifacts without any git/gh mutation. Never call `existingPullRequest`, `createPullRequest`, `gh pr ready`, push, or merge from reconciliation state.

After `gh pr merge --squash --match-head-commit <expectedHead>`, re-fetch the persisted PR number. CAS-persist `complete` and write a passed handoff only when the PR is `MERGED` at exactly `expectedHead` and the issue is `CLOSED`. Command exit without that handoff remains incomplete.

Immediately after `publishVersionChanges`, an existing-PR path fetches the persisted PR number again through the scoped snapshot boundary. It authorizes and CAS-persists a new expected head only when the PR remains open on the exact issue branch, its head is a valid SHA equal to current local `HEAD`, and the checkout is clean apart from controller runtime state. Any different PR/head remains foreign drift and enters stable reconciliation before ready or merge mutation.

For every non-start execute step, call `restoreActiveIssueBranch` before collision and live-worker ownership matching. The existing restoration contract reads the expected issue branch, refuses to switch away from dirty foreign work, checks out only from a clean different branch, and verifies the resulting branch. Ownership matching then compares the retained worker against the restored branch/head.

`workflows/open-pr/WORKFLOW.md` carries the execute run id supplied by the worker prompt. For standalone `/sdlc-open-pr`, it calls `session-init` once and retains the token through controlled-draft and remediation reruns. It validates only the marker path for the selected namespace. Resolve and follow `skill://skill-creator` before editing this workflow; update README for the public isolated-session behavior.
On every newly-created, retained, and remediation path, a settled `idle` or `done` worker without a valid handoff stops with the observed missing or lost-process reason. Do not invoke the future-transition `--until working` wait unless `hasPastedWorkerPrompt` or `appearsWorking` positively proves a prompt-submission race.

For cancellation, stop or retain only workers whose recorded ownership matches the active run, then reload the latest canonical checkpoint after owned children have stopped. Require the refreshed checkpoint to preserve the same immutable run identity, apply the terminal `controller_cancelled` state and final worker disposition to that revision, and CAS-persist it before releasing the lease. A failed refresh or persist leaves cleanup fail-closed rather than converting it into a released-lease success.


### Interface Contracts

| Interface | Contract |
|-----------|----------|
| `sdlc-deliver.mjs session-init --issue N` | Create one isolated UUID session and print its token; no canonical runtime writes |
| `sdlc-deliver.mjs --issue N --controller-run-id R` | Canonical execute mode; R must match active lease/checkpoint |
| `sdlc-deliver.mjs --issue N --session-token T` | Isolated mode; T must identify a bound session for N/project whose `run.json` is a regular non-symlink file and `handoffs` is a real non-symlink directory |
| `runState.delivery` | CAS-protected expected PR/head and terminal reconciliation/complete state |
| Passed deliver handoff | Exists only after persisted PR/head MERGED identity plus issue CLOSED proof |
| Controller cancellation checkpoint | Latest identity-matching run revision plus `failed.reasonCode: controller_cancelled` and final owned-worker disposition, persisted before lease release |


### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Expose/factor explicit-path CAS internally; pass controller run id to deliver worker; restore non-start issue checkout before retained-worker ownership matching | Connects #290/#291 identity to delivery and prevents false multi-issue ownership mismatch |
| `scripts/sdlc-deliver.mjs` | Scope parsing, session init/namespace, delivery CAS, post-version-push existing-PR rebinding, idempotent reconciliation, exact terminal proof | Fixes all delivery root causes without accepting foreign drift |
| `workflows/open-pr/WORKFLOW.md` | Reuse execute scope or initialize/retain isolated token across every controller rerun | Keeps standalone contribution/open-PR supported safely |
| `README.md` | Document scoped delivery, session tokens, and handoff-only completion | User-visible behavior changed |
| `commands/sdlc-open-pr.md` | Regenerate the packaged file command from its workflow body | Keeps the installed automated command synchronized with the scoped delivery controller |
| `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/open-pr-delivery-contract.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs` | Add CAS, reconciliation, namespace isolation, version-push remote-head, and live multi-issue resume regressions | Proves AC1–AC6 |
| `scripts/sdlc-deliver.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs` | Validate isolated-session leaf artifact types and reject symlinked state/handoff targets before resume | Prevents foreign state reads and redirected terminal handoffs |
| `scripts/sdlc-execute.mjs`, `scripts/__tests__/sdlc-execute.test.mjs` | Stop settled missing-handoff workers without a future-working wait; refresh subordinate CAS writes and persist terminal cancellation before lease release | Prevents live-lock and stale worker ownership after delivery cancellation |


### Blast Radius

- **Direct impact**: every delivery invocation, PR create/resume, controlled-draft transition, remediation rerun, merge proof, and deliver handoff path.
- **Indirect impact**: execute worker prompt identity, public open-pr workflow, runtime cleanup/status readers that encounter session directories.
- **Risk level**: High — delivery is terminal and remote-mutating; every identity mismatch must fail before GitHub mutation.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Normal execute delivery is rejected | Med | Pass checkpoint run id deterministically and cover canonical scope end to end |
| Controlled H1→H2 is mistaken for foreign head drift | Med | Model one explicit authorized transition with prior-head and same-PR CAS checks |
| Remediation push cannot advance expected head | Med | Use the same authorized-transition helper after clean scoped push |
| Session path escapes or aliases canonical state | Low | UUID-only token, realpath containment, no symlink following, exclusive directory creation |
| Rerun opens a follow-up PR after unexpected merge | Low | Check persisted reconciliation before all PR discovery/create and GitHub mutation |
| Session leaf artifact is replaced by a symlink after initialization | Low | `lstat` the run file and handoff directory immediately before the first state read; reject non-regular or symlinked artifacts before commands |
| Passed handoff precedes closure | Low | Single terminal writer after exact persisted MERGED head and CLOSED issue proof |
| Existing-PR version push is mistaken for foreign drift | High | Re-read the persisted PR after push and rebind only to the same branch's clean current local head |
| Earlier delivery leaves live next-issue worker mismatched on default branch | High | Restore the clean expected non-start issue branch before comparing worker ownership |
| Branch restoration overwrites user work | Low | Refuse checkout when a different current branch has dirty work and verify the restored branch |
| Delivery advances checkpoint while controller waits | High | Stop the owned worker, reload the latest identity-matching revision, then persist terminal cancellation before releasing the lease |
| Settled worker has no handoff | High | Classify `missing_handoff` immediately; reserve future-working waits for positively identified prompt-submission races |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Keep live PR discovery and improve error text | No persisted expectation | Reruns can still select or create another PR |
| Store expected PR/head only in handoff | Use failed/passed handoff as state | Handoff is terminal output, not a monotonic in-progress CAS checkpoint |
| Reuse canonical run.json for standalone issue B | Replace issue identity | Violates #290/#291 ownership and can clobber A |
| Accept any merged head and mark complete | Treat remote merge as success | Breaks exact-head evidence and may deliver unverified code |
| Automatically create a follow-up PR | Reconcile by another delivery | Explicitly forbidden; hides unexpected merge and duplicates delivery |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix consumes existing checkpoint/lease contracts rather than redefining them
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
