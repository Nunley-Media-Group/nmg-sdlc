# Terminal Exact-Head Delivery Loop

**Consumed by**: `open-pr` Step 7 after one ordinary ready PR exists or the
controlled draft contract has made its exact final head ready.

Invoking `$nmg-sdlc:open-pr` authorizes this configured delivery loop. Do not
offer an opt-out and do not report success while the PR remains open.

## Evidence Snapshot

On every observation, fully page and normalize:

- PR number, state, draft state, base/head refs, `headRefOid`, `mergeable`, and
  `mergeStateStatus`;
- every check admitted as delivery evidence with name, state/conclusion, exact
  `event: pull_request` provenance, and URL;
- all reviews needed to derive each reviewer's latest decision;
- all review threads with `isResolved`, `isOutdated`, and comment context;
- active issue number/state and exact closing references.

Pass the normalized snapshot through
`scripts/pr-delivery-state.mjs`. Record its SHA-256 fingerprint. Missing pages,
cursors, malformed identities, an unknown state, duplicate check identity, or a
head mismatch is `unverifiable`; never infer clean delivery.

Do not synthesize a missing event. A commit status without observable event
provenance is not check evidence; cover an automated reviewer through the fully
paged review/thread graph and live merge state instead. Every declared PR-only
check name must appear exactly in the admitted check set.

## Loop Constants

Poll pending external state every 30 seconds for at most 60 observations per
invocation. A later invocation starts with fresh evidence; it never trusts a
cached fingerprint. Do not sleep longer than the communication/runtime bound in
one operation.

## State Transitions

1. **Head changed**: discard every prior check, review, thread, mergeability,
   and verification conclusion. Re-run verification and observe the new head.
2. **Pending checks or platform mergeability calculation**: continue polling.
3. **Safe actionable check, review, or mergeability finding**: inspect exact
   logs/thread context; edit only in-scope implementation/spec/report files;
   route skill-bundled changes through `$skill-creator`; run the relevant tests
   and `$nmg-sdlc:verify-code #N`; commit and push normally; then restart from a
   new snapshot. Never force-push.
4. **Ambiguous review, permission denial, unavailable required service,
   protection/ruleset conflict, or exhausted pending bound**: stop with one
   `external-authority blocker` containing the PR/head, exact evidence, owning
   actor or service, and the command/action that can recover it. Preserve the
   branch and PR.
5. **Merge-ready**: require the exact live head to have success-equivalent
   checks (`SUCCESS`, `NEUTRAL`, or `SKIPPED` where allowed), no active latest
   `CHANGES_REQUESTED`, no unresolved non-outdated review thread, current final
   verification evidence, `isDraft: false`, and `mergeStateStatus: CLEAN`.

No checks is acceptable only when the repository exposes no required checks and
the current verification report declares no PR-only check identity. Never edit
rulesets or protections to manufacture readiness.

## Exact Merge and Proof

Immediately before merge, re-fetch and reproduce the merge-ready fingerprint.
Then merge the exact head with the repository-configured method; the default is:

```bash
gh pr merge <number> --squash --match-head-commit <head-sha> --delete-branch
```

If the repository requires another allowed method, use its documented
`steering/tech.md` policy. Do not merge a different head and do not use admin
bypass.

After the command:

1. Re-fetch the PR and require `state: MERGED`, the same final head identity,
   and a merge commit/time.
2. Re-fetch issue `#N` and require `state: CLOSED`. A merged PR with an open
   child is not success; report the closing-semantics blocker.
3. For an epic child, run `epic-completion.md` with fresh graph, spec authority,
   Project, and digest evidence.
4. Only after required reconciliation, check out the refreshed default branch
   and remove the local feature branch when safe. Remote deletion performed by
   the merge command is already proven by the PR result.

## Terminal Output

Success output is allowed only after all proof above:

```text
Delivery complete for issue #N.
PR #P: MERGED at head H
Issue #N: CLOSED
Epic reconciliation: closed #E, #R | incomplete | not applicable
Branch cleanup: complete | safely deferred with reason
```

Every non-success exit uses one blocker block:

```text
External-authority blocker
PR/head: #P / H
Evidence: <exact pending, permission, review, check, or platform state>
Owner: <actor or service>
Recovery: <specific action, then re-run $nmg-sdlc:open-pr #N>
```
