# Epic Identity Audit and Recovery

Use this reference only from `$nmg-sdlc:upgrade-project` Step 3.6 and the corresponding approved apply stage. Read `../../../references/epic-relationships.md` first; its tuple, result fields, classification order, and sibling authority are canonical.

## Read-Only Audit

1. Resolve the current repository owner/name with a read-only `gh repo view` query and persist that exact `OWNER/REPO` as `AUDITED_REPO` for the complete audit, approval, apply, and proof sequence.
2. Exhaustively page the repository issue connection by `endCursor` until `hasNextPage` is false. For every retained issue, fully page labels and native `subIssues`, hydrate its native parent, and hydrate every referenced relationship target even when it falls outside the initial issue pages. Every target record must include current positive number, state, body, labels, native parent, and native `subIssues` before classification.
3. Retain only records participating in an `epic`, `epic-child-of-N`, native parent/sub-issue, line-anchored `Depends on:` or `Blocks:`, or supported Child Issues checklist signal.
4. Normalize and classify the retained graph using `scripts/epic-relationships.mjs` semantics. Record the exact parent/child pairs, signal set, relevant labels, body digest, native relationship set, identity result, sibling reconciliation, and gaps.
5. Do not mutate GitHub during audit. A missing cursor, malformed or failed page, or target-hydration failure makes each affected record and the overall audit `unverifiable`; never infer missing evidence and do not propose a repair from an unverifiable audit.

## Deterministic Repair Threshold

Offer a mutation set only for one of these exact shapes:

| Finding | Required agreeing evidence | Proposed repair |
|---------|----------------------------|-----------------|
| Legacy child | Confirmed `epic` parent plus agreeing native and supported body relationships; no conflicting child label | Lazily create and add `epic-child-of-P` to child `C` |
| Parent label missing | Child has exactly one `epic-child-of-P` plus agreeing native and supported body relationships to `P`; target exists and has no conflicting coordination label | Lazily create and add `epic` to parent `P` |
| Native link missing | Confirmed `epic` parent, matching child label, and body relationship; native query succeeded and shows no different parent | Add parent `P` to child `C` |
| Body relationship missing | Confirmed `epic` parent, matching child label, and native relationship; the child body is well formed and has no conflicting coordination relationship | Append one line-anchored `Depends on: #P` entry through a temporary body file |
| Checklist stale | Native query succeeded; parent has a recognizable `## Child Issues` section; proposed edit changes only supported checklist rows to match native children | Rewrite only that section through a temporary body file |

Do not offer automatic repair for multiple epic parents, multiple/mismatched child labels, a different native parent, malformed bodies, missing target metadata, unrecognized checklist structure, or evidence that could also represent an ordinary dependency. Preserve those records as inconsistent, ambiguous, or unverifiable.

Missing-body and checklist repairs are eligible for automated proposal only when the GitHub issue endpoint in use has a proven server-enforced compare-and-set operation for the approved body version. If that capability is unavailable or cannot be proven, report the deterministic body diff as a manual repair and do not include a body write in the automated mutation set.

## Findings Gate

For each repairable parent group, present:

- parent issue number and current labels;
- each child number, current labels, native parent, and supported body signals;
- native/checklist reconciliation;
- exact proposed label names, parent-link changes, and body-section diff;
- exact commands that would run;
- evidence digest used for revalidation.

Ask through `request_user_input`: approve this exact mutation set, preserve it, or narrow it and re-present the complete narrowed set. Do not combine unrelated parents into one approval. Silence, timeout, prior cleanup approval, or approval of a sealed-spec finding is not approval.

## Apply an Approved Set

1. Re-resolve the current repository with `gh repo view` immediately before mutation and require it to equal `AUDITED_REPO`; abort the set if it differs. Use the persisted `OWNER/REPO` explicitly for every subsequent re-fetch and mutation: pass `--repo OWNER/REPO` to `gh issue` and `gh label` commands, and use `repos/OWNER/REPO/...` endpoints for `gh api` calls.
2. Re-fetch the exact approved parent and children with the same fields immediately before mutation.
3. Recompute the labels, body digest, native relationships, and classification. Compare them with the approved evidence.
4. Abort on drift: if any value changed, stop this set without mutation and report the stale finding. Do not rediscover or widen the repair.
5. Lazily create only an approved missing label:

   ```bash
   gh label create epic --repo OWNER/REPO --color 5319E7 --description "Coordination umbrella"
   gh label create epic-child-of-P --repo OWNER/REPO --color BFD4F2 --description "Child of coordination umbrella #P"
   ```

   Treat an already-existing exact label as a no-op. Do not change an existing label's color or description.
6. Apply only approved assignments or relationships:

   ```bash
   gh issue edit P --add-label epic --repo OWNER/REPO
   gh issue edit C --add-label epic-child-of-P --repo OWNER/REPO
   gh issue edit P --add-sub-issue C --repo OWNER/REPO
   ```

7. For an approved missing-body repair, write the full re-fetched child body to a temporary file, append exactly one line-anchored `Depends on: #P` entry, and inspect the exact diff. Immediately before the write, re-fetch `C` with `--repo OWNER/REPO` and compare the approved labels, body digest, native relationships, and classification again. Submit the body only through a `repos/OWNER/REPO/issues/C` API operation that is proven to enforce compare-and-set against the re-fetched body version. If the endpoint does not enforce the precondition, abort instead of issuing an unconditional `gh issue edit --body-file`. Preserve every existing byte and remove the temporary file afterward.
8. Apply the same immediate re-fetch, evidence comparison, and enforced compare-and-set requirement to an approved checklist repair for `P`. Replace only supported checklist rows inside the recognizable `## Child Issues` section; never issue an unconditional full-body write. Preserve every other byte and remove the separate temporary file afterward.
9. Stop on the first failed command in the set. Report all writes already completed and the exact remaining differences; never roll forward with broader commands or create duplicate issues.

## Post-Apply Proof

Re-fetch only the approved parent, approved children, and approved evidence tuples from `OWNER/REPO`; classify each approved child and require the approved target state. A full repaired tuple must be `role = epic-child`, have the approved `parentNumber`, be `identity = durable`, have `consistency = consistent`, use `nativeAuthority = native`, and retain matching native plus body signals. Re-run idempotence analysis against that exact approved mutation set and require it to propose no further mutation for those records. Report unapproved sibling findings, checklist-only repairs, and other remaining parent-group findings separately; they do not fail proof of the approved set and cannot be mutated without their own approval.

Report issue numbers, commands applied, final classification, native/checklist reconciliation, and any partial failure. Do not close/reopen issues, change issue type/milestone/state, modify unrelated labels, or claim canonical-spec readiness; those belong to their owning lifecycle stages.
