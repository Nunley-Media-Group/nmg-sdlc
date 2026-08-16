# Post-Merge Epic Completion

**Consumed by**: `open-pr` only after the exact PR is proven `MERGED` and the
active executable child issue is proven `CLOSED`.

This reconciliation closes coordination containers explicitly. Child PR closing
text never names an epic, and merge alone never proves epic completion.

## Resolve the Direct Parent

Rehydrate the closed child's complete native lineage through GitHub GraphQL.
Fully page every `parent`, `subIssues`, labels, and Project item/status/option
connection needed below. A missing cursor, page-limit breach, graph cycle,
conflicting identity, or unavailable record stops without mutation.

If the child has no confirmed epic parent, report `not applicable`. Otherwise
set the direct parent as `E` and evaluate leaf to root.

## Build One Parent Snapshot

For `E`:

1. Fetch the epic with title, state, labels, native parent, and all native direct
   children. Fetch every direct child's number, title, state, labels, parent, and
   complete sub-issue connection. All native children count regardless of
   milestone, checklist text, or Project membership.
2. Discover and fetch the repository's current default commit without checkout.
   Run `epic-spec-authority.mjs --epic E --source <default-commit>
   --native-children <complete-list> --json`.
3. Fully page every ProjectV2 item containing `E`. For each readable item,
   normalize item/project/status-field IDs, current status, and exactly one
   case-insensitive `Done` option. Pass `[]` only when complete GraphQL evidence
   proves the issue has no Project items; a query failure is `unverifiable`.
4. Call `classifyEpicCompletion()` with only that fresh snapshot. Record its
   direct children, incomplete children, Project mutations, next parent, gaps,
   and `evidenceDigest`.

Interpret the result:

- `incomplete`: stop the cascade normally and report open children or planned
  packages. Do not close or alter the epic.
- `repair_required`: stop and name `$nmg-sdlc:upgrade-project` with exact gaps.
- `unverifiable`: stop with one external-authority blocker; never guess.
- `eligible`: continue below.

Zero-child epics, partial pages, unknown children, open children, planned or
invalid spec authority, cycles, and unreadable required Project state are never
eligible.

## Digest-Protected Mutations

Immediately before the first write, repeat the complete snapshot and require the
same `eligible` status and identical digest. Drift aborts without mutation.

1. Apply only the proposed Project Status changes using
   `updateProjectV2ItemFieldValue`. After each bounded mutation batch, re-fetch
   and require every targeted item to read `Done`. Do not mutate any other
   field, issue, or Project item.
2. Rebuild the snapshot after Project reconciliation. Require `eligible`, no
   remaining Project mutations, and reproduce that new digest immediately
   before issue closure.
3. If `E` is still open, close it explicitly with a single idempotent comment:

   ```bash
   gh issue close E --comment "All native child issues are closed and epic specification authority is complete; closed automatically by nmg-sdlc after merged child #N."
   ```

4. Re-fetch `E`; require `state: CLOSED` and every readable Project status
   `Done`. Failure is a partial mutation: report exact surviving state and let a
   later invocation resume. Never create a replacement issue or duplicate a
   successful close/comment.

An already-closed eligible epic with Projects already Done is an idempotent
success and proceeds without another mutation.

## Nested Cascade

When the proven snapshot returns `nextParentNumber`, set that parent as `E` and
repeat the entire process. Evaluate leaf to root until a parent is incomplete or
no parent remains. Never reuse a child's authority or digest for its parent.

Report `closed #E, #R` only for issues proven closed by this invocation or found
already closed and fully reconciled. A rerun after any partial Project/issue
mutation resumes from live state and produces no duplicate action.
