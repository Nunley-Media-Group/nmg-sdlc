# Design: Recover approved-spec start and implementation

**Issue**: #418
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

## Root cause

The start worker treats branch checkout failure as terminal even after a conflicting worktree releases the branch. Its reused-branch refresh only fast-forwards when issue history is already integrated into default; a squash merge leaves the old branch divergent. The passed handoff does not bind the resulting branch head, so execute retains its earlier default-branch checkpoint. Implement publication sees reconciliation commits ahead of upstream. Existing exclusive-implement recovery only accepts one owner-subject implementation commit on a strict descendant, not a synchronized pre-implementation reconciliation head with preserved dirty work.

## Protocol

1. Read-only discovery identifies only failed `branch_checkout_failed` at the start step: exact run identity and revision, default checkout at checkpoint head, clean tracked/untracked/ignored authority, strict no-follow handoff snapshot, unique owner, absent workers and foreign lease, and unconsumed recovery. Reinspect after lease acquisition; archive the exact failed handoff and persist a single durable recovery tuple by CAS before normal start dispatch. No checkout occurs during discovery.
2. Start independently fetches exact origin issue/default refs, proves approved spec provenance from default, and checks local issue branch/upstream identity. A branch owned by another worktree is not taken. When old spec history is divergent because of squash, merge only the proven default head without rewriting history; reject conflict, unrelated changes, ambiguous source, changed ref, or unapproved paths. Verify parentage, resulting tree/scope and exact upstream destination, then push with ordinary fast-forward semantics and verify remote head equals local head before passing.
3. Passed start handoff records the actual issue branch and full head. Execute validates the handoff and independently reads current checkout and upstream, rejects mismatch, then CAS-writes `runState.branch` and `runState.head` before marking start completed or dispatching implement. Retained worker and pending prompt settlement use the same invariant; a second invocation cannot accept a different head silently.
4. Failed implement publication recovery proves the pre-existing reconciliation sequence from old checkpoint to synchronized issue head, with expected approved default ancestry, exact upstream equality, no implementation publication, strict failed handoff, unique owner/scope, and only authorized dirty work. It archives and consumes one owner-bound recovery before normal implement dispatch. Existing publication helper, not discovery, binds and publishes the implementation; no alternative commit/push path is introduced.

## Affected paths

- `scripts/start-issue.mjs` and `scripts/__tests__/start-issue-controller.test.mjs`: safe reconciliation, sync, and deterministic worktree/divergence fixtures.
- `scripts/sdlc-execute.mjs` and `scripts/__tests__/sdlc-execute.test.mjs`: bounded discovery/dispatch, start head CAS, pre-publication repair fixtures.
- `workflows/execute/`, `workflows/start-issue/`, `workflows/write-code/`: clarify worker and controller boundaries only where changed.
- `commands/sdlc-execute.md`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`: generated command mirror, user guidance, and synchronized patch release.

## Safety

Every side effect follows fresh identity checks. Observed branch/ref movement before publication blocks, and the push names the captured authorized commit without force; the final remote and local heads must match it. A concurrent remote intermediate fast-forward between the last fetch and the server's push advertisement is not atomically detectable with an ordinary non-force Git push; never claim remote compare-and-swap. No reset, rebase, detach, or worktree removal. Handoff archives and checkpoint recovery records retain exact provenance. Unreadable PR/source, unknown scope, symlinked evidence, ignored implementation material, published implementation, stale head, multiple owners, or changed worker identity are blockers—not repair hints. Existing exact-head delivery and independent #417 provider-repair gates remain intact.
