# Root Cause Analysis: Enforce one controller writer and close stale workers

**Issue**: #291
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/290-bind-sdlc-run-checkpoints-to-project-identity-with-cas-writes/
---

## Root Cause

`scripts/sdlc-execute.mjs` reads the global Herdr agent list once and selects the first name that starts with `s${issue}-`. Exact step validation happens only after that prefix candidate has already been selected, so an unrelated `sN-controller` or stale `sN-other-step` blocks or redirects the intended lifecycle. The checkpoint has no durable worker ownership record tying an exact name and pane to the project/run identity introduced by issue #290.

`stopResult()` persists failure and explicitly reports that the worker pane was left open. The in-memory `createdPanes` set is not used as a cleanup authority on terminal stop or process cancellation. A later execute can therefore see a stale pane with no proof that it belongs to the same canonical project, run, checkout identity, or controller.

Finally, `/sdlc-execute`, `/sdlc-verify-code`, and `/sdlc-open-pr` can start independently in the same checkout. Their controllers have no shared exclusive project lease, so they may write run state, handoffs, verification evidence, branches, commits, or pull requests concurrently.

### Pre-Remediation Affected Code

| File | Lines / Symbols | Role |
|------|-----------------|------|
| `scripts/sdlc-execute.mjs` | `parseArgs`, `defaultHerdr`, `stopResult`, `runExecute`, retained-agent selection | Parses no retain option, prefix-matches agents, and leaves stopped panes open |
| `scripts/sdlc-deliver.mjs` | CLI preflight and delivery controller | Allows standalone delivery beside execute |
| `scripts/sdlc-verify-steering.mjs` | CLI preflight and verification runner | Allows standalone verification beside execute |
| `workflows/execute/WORKFLOW.md` | Execution argument contract | Documents issue tokens only |
| `workflows/open-pr/WORKFLOW.md`, `workflows/verify-code/WORKFLOW.md` | Controller command invocation | Must pass execute-scoped run identity when present |
| `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs` | Controller fixtures | Cover current prefix reuse and left-open behavior |
| `src/sdlc-prompt-snippets.mjs`, `src/sdlc-steering-runtime.mjs` | Fragment schema, catalog, registration, and rendering | Before AC4, enforced plugin/builtin `byteBound` values and accepted legacy project bounds; the current schema is unbounded and rejects that key as unknown |
| `scripts/__tests__/rendered-prompt-bytes.test.mjs` | Historical automated-body and worker-prompt quota suite | Removed and replaced by quota-free `rendered-prompt-contract.test.mjs` structural coverage |
| `references/steering-schema.md` | Current prompt-fragment contract | Declares unbounded prompt composition, rejects obsolete `byteBound` keys, and retains structural validation and provenance |

### Triggering Conditions

- More than one controller or standalone mutating phase helper targets the same canonical project.
- A global Herdr agent name merely starts with `s{issue}-`.
- A controller stops or is cancelled after creating a worker pane.
- No exact ownership record or exclusive controller lease rejects the competing path.

---

## Fix Strategy

### Approach

Add a zero-dependency shared controller-lease module used by execute, verification, and delivery. The lease file is `.omp/sdlc/controller.lock`, created with `openSync(path, 'wx')` after read-only preflight and before any run-state, handoff, branch, verification, or delivery mutation. Its JSON record contains `schemaVersion: 1`, `projectRoot: realpathSync(cwd)`, the issue #290 `runId`, `controllerPaneId`, `pid`, and `startedAt`. Existing lease or unreadable/mismatched lease fails `controller_lease_held`; no process steals or unlinks a lease it did not create. The owner closes its fd and unlinks its own lease in `finally` and in CLI `SIGINT` / `SIGTERM` cleanup.

A standalone verify or deliver controller is allowed when no controller lease exists. When a lease exists it must receive the exact execute run id through `--controller-run-id`; missing or different identity exits 1 with `controller_lease_held` before mutation. Execute-generated worker prompts carry the run id and the verify/open-pr workflows pass it to their controller scripts. This is coordination identity, not an authentication secret.

Extend the issue #290 checkpoint with mutable `workers`, keyed by exact worker name. Each record contains `name`, `paneId`, `projectRoot`, `runId`, `issue`, `step`, `branch`, and `head`. Persist the record through checkpoint CAS immediately after a pane is started and before its prompt is submitted. Remove it after successful close. Retained reuse considers only the exact `s${issue}-${step}` name and requires the live pane id plus every recorded identity field to match the current checkpoint and `git branch --show-current` / `git rev-parse HEAD`; otherwise stop with `retained_worker_mismatch` and do not close the unrelated pane.

`stopResult` receives the worker ownership registry and `retainWorker` option. Default terminal stops close a matching controller-owned pane before persisting the final failure. `--retain-worker` keeps it open and refreshes its branch/head record before persisting. The CLI installs cancellation cleanup that closes every still-recorded owned pane unless retention was requested, leaves unrelated panes untouched, releases its lease, and preserves conventional signal exit status. Pane-close failure remains fail-closed and is reported without closing a different pane.

Prompt composition becomes unbounded. Delete automated-body and worker-prompt ceiling constants and their size assertions while retaining the same structural prompt tests. Remove `byteBound` from the fragment schema, plugin catalog tuples, builtin worker header, registration checks, and post-substitution rendering checks. Project manifests use the existing canonical schema `{ id, path, consumers, slot, order }`; a leftover `byteBound` is now an unknown key and fails closed rather than being accepted and stripped. Provenance byte counts remain observational metadata, not quotas.

This is a clean cutover. No compatibility alias, optional bound, ignored-bound normalization, quota error, or alternate bounded renderer remains. It explicitly supersedes the prompt-quota portions of issues #193, #259, #265, and #271 while preserving all unrelated controller lifecycle, snippet ordering, placeholder, provider, consumer, slot, source-path, hash, provenance, and non-empty-body contracts.

The merged implementation still has one writer-boundary gap. `createInitializePlan` removes only `content` and spreads every remaining input field into `manifest.snippets`; migration likewise spreads existing manifest snippet records into the next manifest. Both boundaries must validate the exact input key set before constructing a plan, return no actions or output on rejection, and canonicalize accepted records by explicit field selection. `byteBound` and every other unknown snippet key fail `steering_manifest_unknown_key`; input objects and live steering files remain byte-for-byte unchanged.

### Interface Contracts

| Interface | Contract |
|-----------|----------|
| `/sdlc-execute [--retain-worker] [#N ...]` | Flag may appear once among issue tokens; absent means owned panes close on stop/cancel |
| `.omp/sdlc/controller.lock` | Exclusive `wx` JSON lease bound to canonical project and checkpoint run id |
| `runState.workers[name]` | Durable exact worker ownership record; mutable through issue #290 CAS persists |
| `sdlc-verify-steering.mjs --controller-run-id R` | Required only when an execute lease exists; exact match authorizes scoped worker |
| `sdlc-deliver.mjs --controller-run-id R` | Required only when an execute lease exists; exact match authorizes scoped worker |

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-controller-lease.mjs` | Add canonical lease acquire/read/assert/release helpers | One contract shared by three controllers |
| `scripts/sdlc-execute.mjs` | Parse retention, acquire/release lease, persist exact ownership, replace prefix discovery, close owned panes on stop/cancel, include run id in worker prompt | Fixes writer and stale-worker root causes |
| `scripts/sdlc-deliver.mjs`, `scripts/sdlc-verify-steering.mjs` | Guard standalone mutation and accept execute run id | Prevents direct phase races |
| `workflows/execute/WORKFLOW.md`, `workflows/open-pr/WORKFLOW.md`, `workflows/verify-code/WORKFLOW.md` | Carry the new retain and scoped-run contracts | Keeps executable workflow prompts aligned |
| `README.md` | Document `--retain-worker`, default cleanup, and exclusive writer behavior | User-visible command behavior changed |
| `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, applicable verification tests | Add lease, exact ownership, cleanup, and helper-guard regressions | Proves AC1–AC3 |
| `src/sdlc-prompt-snippets.mjs` | Remove fragment `byteBound` schema, catalog/header declarations, and registration/render enforcement | Makes plugin, builtin, worker, and command prompt composition unbounded |
| `src/sdlc-steering-runtime.mjs`, `scripts/sdlc-steering.mjs` | Remove legacy bound stripping; require the canonical project snippet key set | Eliminates the compatibility quota path while preserving fail-closed unknown-key validation |
| `scripts/sdlc-upgrade.mjs` | Canonicalize preserved migration snippet records before plan construction and reject unknown fields | Prevents migration from carrying quota compatibility fields into a new manifest |
| `scripts/__tests__/rendered-prompt-contract.test.mjs`, prompt registry/runtime tests | Delete quota constants and size assertions; retain structural contracts and prove `byteBound` is unknown | Covers the clean cutover without weakening prompt validation |
| `references/steering-schema.md`, `README.md`, `CHANGELOG.md`, active #291 spec | Document unbounded prompt composition and historical supersession | Keeps public and executable contracts aligned |

### Blast Radius

- **Direct impact**: execute startup/teardown, retained worker reuse, verify and deliver preflight, controller signal handling.
- **Indirect impact**: remediation panes, multi-issue queues, public phase commands, and tests that seed run checkpoints or Herdr agent lists.
- **Risk level**: High — cleanup must never close an unrelated pane, and scoped workers must remain able to verify and deliver under the active lease.
- **Prompt impact**: automated command bodies, worker prompts, plugin fragments, builtin fragments, and project fragments no longer have byte ceilings; malformed structure still fails closed.
- **Writer impact**: initialization and migration reject unknown snippet fields before constructing plan actions; accepted manifests contain only canonical snippet registration keys.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cleanup closes a user-owned pane | Med | Close only a live pane whose exact name/pane and full ownership record match; mismatch remains open and fails closed |
| Execute worker is rejected by verify/deliver guard | Med | Deterministically include the checkpoint run id in generated worker prompts and test both scoped controllers |
| Lease remains after an ordinary return or handled signal | Low | Single owner `finally` plus idempotent owner-only release and subprocess signal tests |
| `--retain-worker` leaves metadata too stale to resume | Med | Refresh branch/head before retaining; a later mismatch fails closed instead of guessing |
| Multi-issue queues reuse an earlier issue worker | Low | Key ownership by exact name and validate issue/step on every lookup |
| Accidental loss of structural prompt validation | Low | Keep and run registry/rendering tests for providers, consumers, slots, ordering, placeholders, source paths, empty bodies, hashes, provenance, and owned workflow composition |
| Legacy `byteBound` silently retains quota semantics | Low | Remove it from every accepted schema and assert it fails as an unknown key |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Prefix matching plus more post-selection checks | Keep first `sN-*` lookup | A foreign prefix collision still prevents selecting the exact expected worker |
| Close every matching `sN-*` pane | Aggressive stale cleanup | Can destroy unrelated user or other-project panes |
| PID-only lock | Store only local process id | Does not bind canonical project, Herdr pane, or checkpoint run identity and is not portable evidence |
| Silent stale-lease stealing | Delete a lease when the owner looks absent | Unsafe under incomplete process/Herdr observations; explicit recovery is outside scope |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal to controller coordination and owned cleanup
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Prompt quota supersession is limited to size ceilings; structural validation and controller lifecycle behavior remain required
- [x] Fix follows existing project patterns (per `structure.md`)
