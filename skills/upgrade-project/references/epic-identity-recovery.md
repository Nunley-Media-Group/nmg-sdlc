# Epic Identity Audit and Recovery

Use this reference only from `$nmg-sdlc:upgrade-project` Step 3.6 and the corresponding approved apply stage. Read `../../../references/epic-relationships.md` first; its tuple, result fields, classification order, and sibling authority are canonical.

## Read-Only Audit

1. Resolve the current repository owner/name with a read-only `gh repo view` query.
2. Page through the repository issue connection with GitHub GraphQL. For every issue request positive number, state, body, labels, native parent, and native `subIssues`; stop and report a bounded gap if a page cannot be read.
3. Retain only records participating in an `epic`, `epic-child-of-N`, native parent/sub-issue, line-anchored `Depends on:` or `Blocks:`, or supported Child Issues checklist signal.
4. Normalize and classify the retained graph using `scripts/epic-relationships.mjs` semantics. Record the exact parent/child pairs, signal set, relevant labels, body digest, native relationship set, identity result, sibling reconciliation, and gaps.
5. Do not mutate GitHub during audit. A failed or partial query makes the affected record `unverifiable`; never infer missing evidence.

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

1. Re-fetch the exact parent and children with the same fields immediately before mutation.
2. Recompute the labels, body digest, native relationships, and classification. Compare them with the approved evidence.
3. Abort on drift: if any value changed, stop this set without mutation and report the stale finding. Do not rediscover or widen the repair.
4. Lazily create only an approved missing label:

   ```bash
   gh label create epic --color 5319E7 --description "Coordination umbrella"
   gh label create epic-child-of-P --color BFD4F2 --description "Child of coordination umbrella #P"
   ```

   Treat an already-existing exact label as a no-op. Do not change an existing label's color or description.
5. Apply only approved assignments or relationships:

   ```bash
   gh issue edit P --add-label epic
   gh issue edit C --add-label epic-child-of-P
   gh issue edit P --add-sub-issue C
   ```

6. For an approved missing-body repair, write the full re-fetched child body to a temporary file, append exactly one line-anchored `Depends on: #P` entry, inspect the exact diff, then run `gh issue edit C --body-file <temporary-file>`. Preserve every existing byte and remove the temporary file afterward.
7. For an approved checklist repair, write the full re-fetched parent body to a separate temporary file, replace only supported checklist rows inside the recognizable `## Child Issues` section, inspect the exact section diff, then run `gh issue edit P --body-file <temporary-file>`. Preserve every other byte and remove the temporary file afterward.
8. Stop on the first failed command in the set. Report all writes already completed and the exact remaining differences; never roll forward with broader commands or create duplicate issues.

## Post-Apply Proof

Re-fetch the parent and children, classify each child, and require the approved target state. A full repaired tuple must be `role = epic-child`, have the approved `parentNumber`, be `identity = durable`, have `consistency = consistent`, use `nativeAuthority = native`, and retain matching native plus body signals. Re-run the audit for the parent group; it must propose no further mutation.

Report issue numbers, commands applied, final classification, native/checklist reconciliation, and any partial failure. Do not close/reopen issues, change issue type/milestone/state, modify unrelated labels, or claim canonical-spec readiness; those belong to their owning lifecycle stages.
