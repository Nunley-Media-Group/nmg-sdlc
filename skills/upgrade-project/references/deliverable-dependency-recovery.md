# Deliverable Dependency Audit and Recovery

Use this reference only from `$nmg-sdlc:upgrade-project` Step 3.7 and Step 8. The shared semantics live in `../../../references/deliverable-dependencies.md`; this file owns initialized-project evidence collection and the exact manual repair handoff.

## Audit Inputs

Continue only when all inputs are complete:

- live repository default branch;
- one canonical or canonical-marker-lost umbrella spec;
- one native-authoritative coordination parent and fully paged child set;
- complete child bodies, labels, states, parent/sub-issue records, and referenced sibling metadata;
- fully paged `closedByPullRequestsReferences` for every structured or candidate owner.

Apply bounds of 50 children per umbrella, 100 tasks per canonical spec, 50 structured/candidate prerequisites per umbrella, 256 KiB per body/spec Markdown file, 10 pages per connection, and 200 GitHub follow-up requests for this category. Exceeding a bound is `unverifiable`, not absence.

## Ownership and Candidate Discovery

1. Build task ownership from explicit child `Task ownership:` records and the canonical spec's child/Delivery Phase assignment. Require one child owner per referenced task or artifact; ambiguous ownership is report-only.
2. Parse exact structured bullets first. Run the shared classifier against normalized `executionDependencies` and merged-default-branch evidence.
3. Scan child bodies line-by-line for legacy candidates. Retain a line only when it contains:
   - a confirmed sibling issue reference; and
   - `T[0-9]+` or one of `artifact`, `baseline`, `checkpoint`, `after`, `consume`, `requires` (case-insensitive).
4. Exclude code fences, quoted historical examples, cross-repository references, the coordination-parent line, and self-references.
5. Corroborate the sibling as the unique owner of the named task/artifact. Without corroboration, report `ambiguous` and do not propose an edit.

Normalize each finding as:

```text
{ parent, consumer, owner, description, sourceLine, structuredRecord,
  executionEdge, ownerState, mergedPullRequest, bodyDigest,
  relationshipPairs, defaultBranch, status, gaps }
```

## Repair Classification

| Finding | Result |
|---------|--------|
| Structured record + edge + merged default delivery | `ready` |
| Structured record + edge, owner not merged | `blocked` |
| Corroborated prerequisite with missing record and/or edge | `whole_issue_repair_available` |
| Baseline must remain parallel and independently reviewable | `baseline_extraction_required` (report-only) |
| Ownership, graph, canonical spec, pagination, or target evidence incomplete | `unverifiable` (report-only) |

Recommend whole-issue repair unless the issue/spec explicitly requires parallel start before the owner completes. Baseline extraction requires `$nmg-sdlc:draft-issue` plus a reviewed `$nmg-sdlc:write-spec` amendment and is never applied here.

## Exact Proposal

Offer a manual whole-issue repair handoff only when one consumer/owner pair and description are unambiguous. Render:

```text
Downstream issue: #C
Deliverable owner: #P
Add: - Requires deliverable from #P: <description>
Normalize execution line: Depends on: #P
Preserve: every other body line, label, native parent, checklist, issue state, and repository setting
Expected post-state: blocked until #P has a merged closing PR to <default>, otherwise ready
```

If a `Depends on:` line already exists, normalize by adding `#P` once to the existing same-purpose line; never create duplicate targets. If only a `Blocks:` representation exists on the owner, preserve it and add the consumer's explicit `Depends on:` line so the structured record and local issue body remain auditable.

Ask through the parent skill's `request_user_input` gate. Approval applies only to the displayed issue, owner, description, canonical ownership entry and spec digest, body digests, labels/states, native relationship set, default branch, closing-PR/merge evidence, and exact added/normalized lines. It authorizes rendering the manual handoff, not an automated GitHub write.

## Fresh Revalidation

Immediately before rendering the manual handoff:

1. Re-fetch consumer and owner bodies, labels, states, native parent/sub-issues, default branch, and fully paged closing PR/merge evidence.
2. Recompute SHA-256 body digests and normalized relationship pairs.
3. Re-read the canonical task/artifact ownership entry and its source spec digest.
4. Compare every field with the approved snapshot.

Abort only the changed handoff on any drift. Do not silently recompute a new proposal under the old approval.

## Manual Apply and Verification

1. Render the exact structured bullet, the exact existing or new section location, and the normalized `Depends on:` target set. Preserve every unrelated line and the coordination-parent target.
2. State that the operator must edit the latest body manually in GitHub after confirming the displayed snapshot still matches. Do not call `gh issue edit`, emit a full-body replacement command, or imply that approval closes the revalidation-to-write race.
3. After the operator reports completion, re-fetch the consumer body, labels/states, native relationships, default branch, owner closing PR/merge evidence, and canonical ownership.
4. Run the shared classifier and compare every unrelated field with the approved snapshot.

Success requires `blocked` or `ready`, the exact structured record, one execution edge, unchanged coordination identity and unrelated body content, and no repair gap. A partial manual edit is reported exactly; never add another owner or create a replacement child to compensate.

## Idempotence Proof

Run Step 3.7 again from fresh GitHub and canonical-spec evidence. The repaired pair must produce no edit proposal and no body diff. Report the second result as `already consistent`; otherwise mark the manual repair incomplete with the exact remaining drift.

## Output

For every finding report consumer, owner, task/artifact, structured record, execution edge, merged PR/base evidence, result, manual handoff or post-edit outcome, and gaps. Never claim a manually closed issue or non-default-base merge is available.
