# Epic Aggregate and Child Specification Authority

**Consumed by**: `write-spec`, `write-code`, `verify-code`, `status`,
`open-pr`, and `upgrade-project` after `references/epic-relationships.md`
confirms an epic or epic child.

Epic membership coordinates separately executable issues. The aggregate records
cross-child outcomes and topology. Each child package owns its own acceptance,
implementation, and verification obligations. Never use one cumulative epic
package as the executable source for multiple children.

## Package Shapes

An aggregate is coordination-only:

```text
specs/epic-<parent-title-slug>/
├── requirements.md
├── design.md
└── epic-scope.json
```

An executable child uses its normal type-prefixed package:

```text
specs/<feature|bug|spike>-<child-title-slug>/
├── requirements.md
├── design.md
├── tasks.md
├── feature.gherkin
├── issue-scope.json
└── epic-link.json
```

Aggregate packages never contain `tasks.md`, `feature.gherkin`,
`issue-scope.json`, or `epic-link.json`. Child packages remain valid under
`references/issue-spec-scope.md`; `epic-link.json` adds coordination context but
does not change executable ownership.

When a native direct child is itself an epic, its parent manifest points to the
child epic's distinct `specs/epic-...` aggregate instead. That coordination
child has no `epic-link.json` and no executable package. The classifier infers
the record kind from the normalized path, validates the nested aggregate
recursively, and fails closed on a repeated aggregate path.

## Stable Outcome IDs

Use `EO001`, `EO002`, and sequential `EO###` identifiers for aggregate outcomes.
An outcome may need more than one child, and one child may contribute to more
than one outcome. Do not copy an aggregate outcome into a child AC/FR namespace.
Every child `AC`, `FR`, `T`, and `SCN` identifier still has exactly one owner in
that child's `issue-scope.json`.

## Aggregate Manifest Schema Version 1

```json
{
  "schemaVersion": 1,
  "epicIssue": 108,
  "aggregatePath": "specs/epic-route-weather-reliability",
  "outcomes": [
    {
      "id": "EO001",
      "childIssues": [109, 110, 170]
    }
  ],
  "children": [
    {
      "issue": 109,
      "specPath": "specs/feature-sample-route-weather",
      "packageState": "canonical",
      "outcomes": ["EO001"]
    },
    {
      "issue": 110,
      "specPath": "specs/feature-present-route-weather",
      "packageState": "planned",
      "outcomes": ["EO001"]
    },
    {
      "issue": 170,
      "specPath": "specs/epic-alerting",
      "packageState": "canonical",
      "outcomes": ["EO001"]
    }
  ],
  "migrations": []
}
```

Rules:

- `epicIssue` is one positive same-repository issue number.
- `aggregatePath` is the manifest's normalized `specs/epic-...` directory.
- Outcome IDs, child issue numbers, and child spec paths are unique.
- Each outcome's `childIssues` exactly equals the children that list the
  outcome. Each child lists at least one existing outcome.
- An executable child's `specPath` uses `specs/feature-*`, `specs/bug-*`, or
  `specs/spike-*`. A child that is itself an epic uses its distinct
  `specs/epic-*` aggregate path.
- `packageState` is `planned` until the referenced package is approved and
  canonical. For executable children, `canonical` requires the complete child
  package and link. For nested epics, it requires the three-file aggregate;
  planned executable descendants remain the nested epic's own authority and do
  not turn the parent record into executable ownership.
- The child set exactly equals fully paged native GitHub direct children when
  relationship evidence is supplied. A partial or disagreeing set fails closed.

## Executable Child Link Schema Version 1

```json
{
  "schemaVersion": 1,
  "epicIssue": 108,
  "epicSpecPath": "specs/epic-route-weather-reliability",
  "childIssue": 109,
  "childSpecPath": "specs/feature-sample-route-weather",
  "outcomes": ["EO001"]
}
```

The link and aggregate child entry must agree exactly on issue numbers, paths,
and outcome IDs. Nested epic aggregates are joined through the parent manifest's
direct-child record and the nested manifest's own `epicIssue`; they never receive
an executable link. A missing, duplicate, conflicting, or cyclic record is
never repaired implicitly by a lifecycle consumer.

## Migration Record

An approved legacy split appends this exact record to `migrations`:

```json
{
  "sourceSpecPath": "specs/feature-legacy-umbrella",
  "sourceTree": "0123456789abcdef0123456789abcdef01234567",
  "recordedAt": "2026-08-16T00:00:00.000Z",
  "transfers": [
    {
      "childIssue": 109,
      "acceptanceCriteria": ["AC1"],
      "functionalRequirements": ["FR1"],
      "tasks": ["T001"],
      "scenarios": ["SCN001"]
    }
  ]
}
```

Require a full lower-case Git tree OID, a valid UTC timestamp, one unique child
per transfer, unique identifiers within each category, and no identifier in two
transfers. The record preserves provenance; it never authorizes another repair.

## Deterministic Classifier

Resolve the installed plugin root from the consuming skill and invoke one mode:

```bash
node <plugin-root>/scripts/epic-spec-authority.mjs \
  --project <project-root> --epic <N> --json

node <plugin-root>/scripts/epic-spec-authority.mjs \
  --project <project-root> --child <N> --json

node <plugin-root>/scripts/epic-spec-authority.mjs \
  --project <project-root> --all --json
```

Pass `--source <commit-ish>` to inspect a committed Git tree without checkout.
Pass `--native-children <comma-separated-positive-issue-numbers>` only after a
fully paged native relationship query. Never pass checklist fallback as native
authority.

| Status | Meaning | Consumer behavior |
|--------|---------|-------------------|
| `valid` | Aggregate, requested executable or nested child, links/scope where applicable, and supplied native set agree. | Continue with the resolved child package or aggregate context. |
| `planned` | Aggregate is valid but at least one child is intentionally planned and the requested operation permits planning. | `write-spec` may author that exact child; code, verification, delivery, and epic closure stop. |
| `repair_required` | Legacy cumulative authority, a missing package/link, or a deterministic drift has an explicit repair path. | Stop consuming work and route the exact finding through `upgrade-project`. |
| `unverifiable` | Input, path, JSON, schema, ownership, Git source, or relationship evidence is malformed, ambiguous, unsafe, or incomplete. | Fail closed before lifecycle mutation. |

Every result includes `reasonCode`, aggregate and child paths, normalized child
records, gaps, and `evidenceDigest`. A mutation consumer re-runs the same
inspection and requires the same digest immediately before writing.

## First-Child Authoring

When a confirmed epic has no aggregate, `write-spec` reviews one aggregate plus
the active child's separate executable package through the normal requirements,
design, and tasks gates. Seed every fully paged native child in
`epic-scope.json`; mark the active child `canonical` only after its complete
package is approved, and mark other known children `planned` with deterministic
expected paths.

For a nested lineage, never invent an executable package for an epic. Publish
the immediate epic plus executable leaf first. Then, for each missing ancestor
link leaf-to-root, approve and publish exactly the ancestor manifest/aggregate
against the already canonical nested aggregate tree. Each pair uses the same
non-closing exact-tree contract, and code starts only after every affected
aggregate is canonical on the refreshed default branch.

Publish exactly the aggregate and active-child directories through the canonical
spec-publication contract. The publication references the epic, never closes or
starts it, does not touch release artifacts, and must be proven on the refreshed
default branch before implementation continues.

## Later-Child Authoring

For a planned child, require a canonical aggregate, review the new child package,
change only that child's manifest entry to `canonical`, and publish exactly the
child directory plus `epic-scope.json`. Preserve aggregate prose and every
sibling package. Any aggregate-content change is a separate explicit amendment
at the applicable review gate.

If the planned direct child is a nested epic, require its aggregate to be
canonical first, change only the ancestor's matching manifest row, and publish
that ancestor/nested-aggregate pair. The nested issue remains coordination-only
and is never handed to `write-code`.

## Consumer Boundary

- `write-code`, `verify-code`, `status`, and `open-pr` resolve the active child
  path from the validated link and use only that child issue-scope delivery slice.
- Aggregate requirements and design are bounded architectural context. EO IDs
  cannot satisfy child implementation or verification completion.
- `open-pr` closes only the child through PR closing semantics. Eligible epic
  closure is a separate post-merge reconciliation after refreshed graph and spec
  authority proof.
- `upgrade-project` owns legacy split, ownership transfer, and repair. Audit is
  read-only until one exact epic proposal is explicitly approved and revalidated.
