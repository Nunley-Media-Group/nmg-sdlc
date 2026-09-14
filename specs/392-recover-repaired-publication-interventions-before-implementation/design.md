# Root Cause Analysis: Recover repaired publication interventions before implementation

**Issue**: #392
**Date**: 2026-09-14
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/390-read-only-owner-bound-implementation-scope-probe/

---

## Root Cause

`discoverRecovery()` checks `handoff.intervention` before it inspects the current owner, canonical scope, worktree, or the exact operator repair. That is correct for unknown intervention states, but it has no classification for the narrow state produced when #388 repairs only publication labels after an implement worker stopped before product output. Bare run therefore cannot reach its existing one-time recovery machinery.

The repair is not equivalent to ordinary exhausted-loop recovery. Its authority comes from three independent read-only proofs: the current run/handoff/owner tuple, the #390 owner-bound scope probe, and a byte-exact #388 publication projection from run HEAD to the current task document. Mutation is authorized only after the same classification is repeated under the controller lease.

## Design

### Pure publication repair proof

Expose a pure helper from `scripts/sdlc-upgrade.mjs` that receives the selected spec task path plus before/current Buffers. It runs the existing package-scoped publication detector over the before bytes, requires at least one rewrite and zero findings, and rejects every selected rewrite unless its complete line changes only `**Files**:` to `**File(s)**:`. It applies the detector-selected line rewrites to a Latin-1 reversible byte view while preserving each original CRLF/LF/CR separator, then compares the projected Buffer with current bytes. It separately runs selected detection against current repository bytes and requires convergence to no item.

No duplicate publication parser or looser regular-expression detector is introduced.

The existing shared publication lexer and recovery-record API in `scripts/sdlc-safe-recoveries.mjs` is part of this implementation surface. The upgrade proof and execute classifier consume that shared API rather than introducing a second lexer or recovery-record contract.

### Read-only intervention classification

A helper owned by `scripts/sdlc-execute.mjs` returns either a proven tuple or a stable blocking reason. It runs only for the exact current `implement` failure whose run and handoff both report `implementation_failed`, with `status: failed`, `intervention: true`, `next: null`, and strict handoff identity.

It requires:

1. Valid run identity, current issue/step, next-step position, canonical root, and exact checkout HEAD equal to `run.head`.
2. Actual issue branch plus one incomplete safe-recovery owner whose owner id equals the run id. `probePublicationScope()` supplies this proof and may report only the explicit branch discrepancy defined by #390.
3. Exact singular Approved spec resolution and nonempty structured `scope.allowedPaths`.
4. Handoff artifacts forming a subset of paths derived from the selected task document, current handoff, run checkpoint, and safe-recovery checkpoint. Every controller handoff filename and payload issue/step must derive from the current checkpoint queue/lifecycle; an unrelated handoff remains blocking even when it is otherwise valid-looking. Product/output paths are therefore never inferred from prose.
5. Git status and diff parsed as NUL-delimited records. No staged entries; the only tracked difference from run HEAD is the selected task document; no `allowedPaths` entry appears in tracked, staged, or untracked state.
6. Byte-exact publication proof and zero current selected detection.
7. No controller lock and no matching `repaired_publication_intervention` record.
8. A closed untracked evidence set. The only accepted current OMP goal-ledger evidence is the exact structurally related terminal-session trio: `.pi-glla/session-owner.json`, `.pi-glla/owner.json`, and `.pi-glla/active.jsonl`. All must be bounded regular non-symlink files at those documented locations; owner/session pid and instance identity must agree; the JSONL event stream must be bounded and end in the same terminal shutdown reason/time. Any partial set, extra `.pi-glla` member, live/nonterminal session, other untracked/ignored file, or basename-only ignored file such as a nested `.DS_Store` outside an exact documented bounded location fails closed.

The structural contract, not a basename match, authorizes preservation. Empty untracked state is also valid.

### One-time consumption

Discovery returns the same queue tuple and bare-resume action used by existing recovery discovery, with a distinct internal recovery class. Bare run carries only that proven class into the controller section. After lease acquisition and before dispatch it repeats classification against the latest bytes. It then:

1. Calls `consumeSafeRecovery()` for class `repaired_publication_intervention` and requires `consumed: true`.
2. Appends the existing run `recoveries[]` consumed tuple containing immutable classifier evidence and the preserved failure.
3. Persists by existing `persistRunState()` compare-and-swap semantics.
4. Marks the current invocation's recovery dispatch and bypasses the preserved intervention stop only for that exact issue/step.
5. Dispatches the standard implement worker. No remediation worker or other step is selected.

The failed handoff is never rewritten or deleted. A second discovery sees either the durable safe-recovery record or checkpoint recovery tuple and returns consumed/blocked, never available.

## Failure Modes

| Condition | Result |
|-----------|--------|
| Run/head/root/issue/step mismatch | Existing checkpoint identity or branch blocker |
| Missing, malformed, or mismatched handoff | `implementation_failed` remains blocked |
| Controller handoff filename or payload issue/step not derived from current checkpoint queue/lifecycle | `implementation_failed` remains blocked |
| Probe missing, empty, or rejected | Stable probe reason; no mutation |
| Unsupported or non-byte-exact task edit | `implementation_failed` remains blocked |
| Current detector not converged | `implementation_failed` remains blocked |
| Any staged or extra tracked change | `implementation_failed` remains blocked |
| Any allowed implementation path dirty or untracked | `implementation_failed` remains blocked |
| Arbitrary, partial, live, oversized, symlinked, structurally invalid workflow evidence, or basename-only ignored file outside an exact documented bounded location | `implementation_failed` remains blocked |
| Controller lock | `controller_lease_held` |
| Prior matching record or run recovery | Recovery is consumed; no dispatch |
| CAS or safe-recovery persistence race | Existing persistence failure; no renewed allowance |

## Verification Strategy

1. Unit coverage for publication projection, mixed line endings, unsupported payload rewrites, unrelated-byte changes, and current non-convergence.
2. Exact consumer-like real-Git fixture using the existing canonical T001-T004 task text, four preimage labels, stale run branch, exact head, unique owner, 18/12/6 probe scope, preserved failed handoff, and structurally valid terminal `.pi-glla` evidence.
3. Adversarial table coverage for every AC5 boundary, including unrelated valid-looking controller handoffs and nested `.DS_Store`-style ignored files outside documented bounds, with byte-identical failure-state assertions.
4. Discovery-to-bare-run exercise with controlled Herdr worker completion, proving only implement dispatch and one-time consumption without product implementation.
5. Existing focused recovery/execute, full relevant suites, plugin/current-spec/43-inventory/contribution/version/diff checks, and disposable exact-state exercise.

## Security and Portability

All paths are canonical repository-relative paths. Git output is NUL-delimited and commands use argument arrays. State paths must be regular non-symlink files with bounded bytes. Publication comparison uses Buffers and a Latin-1 reversible view to prevent Unicode or EOL normalization. The classifier is read-only; only bare run under the existing controller lease consumes state. Node built-ins only.

## Alternatives Rejected

| Alternative | Reason |
|-------------|--------|
| Clear or edit the failed handoff | Destroys failure evidence and trusts an operator mutation |
| Parse the summary for the publication defect | Prose is not authority and is trivial to spoof |
| Treat all ignored files as harmless | Arbitrary ignored output can contain unowned implementation data |
| Allow every `.pi-glla` path | A directory-name exception is unbounded and cannot prove terminal ownership |
| Convert intervention to ordinary remediation | Grants a broader repair path and loses the exact one-time publication proof |
| Special-case the grounded repository or issue | Non-portable and unsafe for future consumers |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #392 | 2026-09-14 | Initial approved design |
| #392 | 2026-09-14 | Approved amendment: shared recovery API scope and stricter handoff/ignored-file bounds |
