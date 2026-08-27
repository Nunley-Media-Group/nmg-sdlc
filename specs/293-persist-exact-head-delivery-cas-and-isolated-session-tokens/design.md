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

### Affected Code

| File | Lines / Symbols | Role |
|------|-----------------|------|
| `scripts/sdlc-deliver.mjs` | `parseDeliverCli`, `writeHandoff`, `existingPullRequest`, `runDeliver` | Has no scope token, canonical-only handoff, and in-memory PR/head identity |
| `scripts/sdlc-execute.mjs` | deliver worker prompt/run identity | Must pass execute controller scope and consume session-aware handoff path |
| `workflows/open-pr/WORKFLOW.md` | controller invocation and remediation loop | Invokes delivery with issue only and treats one canonical handoff path as fixed |
| `scripts/__tests__/sdlc-deliver.test.mjs` | delivery controller fixture | Proves live exact-head merge but not durable CAS identity or isolated state |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | workflow contract | Encodes current invocation and handoff path |

### Triggering Conditions

- Standalone delivery starts without execute ownership while canonical run state belongs to another issue.
- PR number/head is selected but not persisted before later GitHub mutations.
- Controlled verification publication or an external actor changes or merges the PR head.
- A rerun has no durable reconciliation state preventing a second PR attempt.

---

## Fix Strategy

### Approach

Introduce a delivery state namespace abstraction backed by issue #290 CAS. Execute mode requires `--controller-run-id R`, verifies the issue #291 active lease and canonical checkpoint run id, and uses canonical `.omp/sdlc/run.json` plus `.omp/sdlc/handoffs/`. Standalone mode requires `--session-token T` and uses `.omp/sdlc/sessions/T/run.json` plus `.omp/sdlc/sessions/T/handoffs/`. The two options are mutually exclusive and exactly one is required for every mutating delivery invocation.

Add `session-init --issue N`. It generates a UUID token, creates the session directory with exclusive semantics, and writes revision-1 schemaVersion-1 run state bound to `realpathSync(cwd)`, token run id, issue/issues, current branch, and current head. It prints exactly one `NMG_SDLC_SESSION: <token>` line. Tokens must match lowercase UUID syntax and resolve only beneath the canonical sessions directory; symlinked or pre-existing ambiguous targets fail closed. Session creation does not touch canonical run.json or handoffs.

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

`workflows/open-pr/WORKFLOW.md` carries the execute run id supplied by the worker prompt. For standalone `/sdlc-open-pr`, it calls `session-init` once and retains the token through controlled-draft and remediation reruns. It validates only the marker path for the selected namespace. Resolve and follow `skill://skill-creator` before editing this workflow; update README for the public isolated-session behavior.

### Interface Contracts

| Interface | Contract |
|-----------|----------|
| `sdlc-deliver.mjs session-init --issue N` | Create one isolated UUID session and print its token; no canonical runtime writes |
| `sdlc-deliver.mjs --issue N --controller-run-id R` | Canonical execute mode; R must match active lease/checkpoint |
| `sdlc-deliver.mjs --issue N --session-token T` | Isolated mode; T must identify a bound session for N/project |
| `runState.delivery` | CAS-protected expected PR/head and terminal reconciliation/complete state |
| Passed deliver handoff | Exists only after persisted PR/head MERGED identity plus issue CLOSED proof |

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Expose/factor explicit-path CAS internally; pass controller run id to deliver worker; accept namespace-aware marker | Connects #290/#291 identity to delivery |
| `scripts/sdlc-deliver.mjs` | Scope parsing, session init/namespace, delivery CAS, authorized head transitions, idempotent reconciliation, exact terminal proof | Fixes all delivery root causes |
| `workflows/open-pr/WORKFLOW.md` | Reuse execute scope or initialize/retain isolated token across every controller rerun | Keeps standalone contribution/open-PR supported safely |
| `README.md` | Document scoped delivery, session tokens, and handoff-only completion | User-visible behavior changed |
| `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/open-pr-delivery-contract.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs` | Add CAS, reconciliation, namespace isolation, and scope propagation regressions | Proves AC1–AC4 |

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
| Passed handoff precedes closure | Low | Single terminal writer after exact persisted MERGED head and CLOSED issue proof |

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
