# Epic Lifecycle and Specification Recovery

**Consumed by**: `upgrade-project` after complete umbrella identity, native graph,
default-branch spec, issue state, and Project evidence have been collected.

This recovery is grouped per epic. Audit is always read-only. No approval for
one epic, category, or earlier run authorizes another group.

## Read-Only Audit Snapshot

For each confirmed epic `E`, fully page and record:

- epic and native parent/direct-child number, title, state, labels, relationship
  signals, checklist rows, and body digest;
- every child's relevant execution/dependency state;
- default commit plus full Git tree OIDs for the aggregate, child packages, and
  any legacy cumulative source;
- `epic-spec-authority.mjs --epic E --source <default-commit>
  --native-children <complete-list>` output;
- `classifyEpicCompletion()` output;
- every Project item/status field/current value and exact Done/In Progress
  option IDs;
- legacy executable identifier ownership by AC, FR, task, and stable scenario.

An `exact` legacy-ownership snapshot must include the complete audited source
identifier sets, one `{ childIssue, specPath }` destination record for every
native child, and one transfer for every native child. The transfer union in
each AC/FR/task/scenario category must equal the audited source set exactly.
Separate unbound path and issue lists are ambiguous and cannot produce a split.

An incomplete page, unknown target, ambiguous native identity, unreadable
Project field, malformed source tree, or duplicate ownership marks the group
unverifiable. Preserve all evidence and perform no mutation.

Write the normalized snapshot to a securely created bounded temporary JSON file,
invoke:

```bash
node <plugin-root>/scripts/epic-lifecycle-repair.mjs \
  --evidence <snapshot.json> --json
```

Delete only that temporary file. The planner emits exact actions and one digest
over both Git tree and live GitHub evidence.

## Proposal Categories

One group may propose:

- durable identity repair for exact native/body/label drift;
- native-authoritative checklist reconciliation;
- legacy cumulative split into one coordination aggregate and separate child
  packages, with exact identifier transfers and a schema-v1 migration record;
- executable ownership transfer only when every AC/FR/T/SCN has one child;
- stale-complete epic close and readable Project Status to Done;
- prematurely closed epic reopen and readable Project Status to In Progress;
- nested parent reconciliation after child groups become consistent.

If prose or an identifier cannot be assigned uniquely, do not move it and do not
invent a child. Emit `preserved_ambiguous` with an explicit decision to draft or
select a missing child and review exact ownership. Project-authored prose remains
in the legacy source until that decision is approved.

## Per-Epic Approval Gate

Render the epic number/title, source/default trees, current graph/checklist/
issue/Project states, every exact action/path/field, preserved ambiguity, and
`evidenceDigest`. Ask one `request_user_input` question for that epic:

- `Apply exact repair (Recommended)`;
- `Preserve this epic`;
- free-form narrowing, which must be re-audited and re-presented.

Wait indefinitely for explicit input. Never combine groups into one approval,
infer approval from another gate, or execute `preserved_ambiguous` /
`unverifiable` findings.

## Drift-Protected Apply

Immediately before any write for an approved group, repeat the complete audit
from live GitHub and exact Git source. Require `repair_proposed`, byte-for-byte
identical normalized actions, and the approved digest. Any drift aborts the
entire epic group before its first mutation.

Apply actions in recoverable order:

1. Create approved aggregate/child files in new paths. Preserve existing prose;
   copy/move only uniquely assigned executable sections and IDs. Record the
   source tree and transfer mapping in `epic-scope.json.migrations`.
2. Validate child `issue-scope.json`, links, aggregate manifest, and source/path
   safety. Stage only the approved spec paths. Do not commit, push, or publish;
   normal reviewed publication remains owned by `$nmg-sdlc:write-spec`.
3. Apply exact native relationship/label mutations. A full-body checklist or
   membership edit requires an endpoint proven to enforce compare-and-set
   against the re-fetched body; otherwise stop with manual exact-edit guidance.
4. Apply only approved Project Status fields, then re-fetch each item.
5. Close or reopen only epic `E` in the proposed direction, with an idempotent
   repair comment, then re-fetch its state.

Stop on the first failed action. Report completed and remaining actions; do not
roll back a proven server mutation or broaden the group. A later run re-audits
and resumes from live state.

## Post-Apply Proof and Idempotence

Rehydrate the exact group, validate all files/links/scopes, rerun completion and
the repair planner, and require every approved target state. Then run the audit
a second time. It must produce no duplicate action and no remaining approved
action. Unapproved ambiguous findings remain visible but do not invalidate the
proved subset.
