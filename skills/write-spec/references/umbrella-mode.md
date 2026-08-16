# Epic Child Specification Modes

**Consumed by**: `write-spec` after the Epic Role and Authority Gate resolves a
first, later, or existing epic child.

**Read this when** `$nmg-sdlc:write-spec` needs to author or amend an epic
child. Issue creation remains owned by `$nmg-sdlc:draft-issue`; this workflow
never starts an epic, creates an epic branch, or turns a started issue into an
epic.

## Coordination-Only Specification Modes

Resolve all paths and issue numbers through `epic-spec-authority.mjs`; never use
title similarity, a checklist, or session state as authority.

### First child

Use when `--epic E` returns `planned/aggregate_not_authored` and complete native
evidence confirms active child `C` belongs to `E`. An aggregate is deliberately
not a prerequisite for starting `C`; this flow creates it.

1. Derive `specs/epic-<epic-slug>` and the normal child path. Seed every fully
   paged direct child in `epic-scope.json`; the active child becomes `canonical`
   after its package passes the final gate, and other children remain `planned`.
2. Phase 1 reviews the aggregate `EO###` outcomes and the child's executable
   AC/FR requirements as two visibly separate summaries. Approval writes
   aggregate `requirements.md` and the child's `requirements.md`; the aggregate has no
   AC/FR namespace.
3. Phase 2 reviews aggregate topology/design and child technical design
   separately. Approval writes aggregate `design.md` and the child's `design.md`.
4. Phase 3 reviews only the child's tasks, Gherkin, issue scope, and
   bidirectional link plus the finalized aggregate manifest. The aggregate never
   receives `tasks.md`, `feature.gherkin`, `issue-scope.json`, or
   `epic-link.json`.
5. Publish exactly both directories through the aggregate/child publication
   contract. Canonical refreshed default-branch proof is required before code.

### Later child

Use when a canonical aggregate declares active child `C` as `planned`.

1. Prove the aggregate tree on the refreshed default branch and preserve its
   requirements/design plus every sibling package byte-for-byte.
2. Run normal requirements, design, and tasks gates for `C` only.
3. At the final gate, change only `C`'s manifest row from `planned` to
   `canonical`, write its matching `epic-link.json`, and validate both directions.
4. Publish the child directory plus only `epic-scope.json`. Any other aggregate
   change fails the exact change-set classifier and requires a separate review.

### Nested lineage reconciliation

An epic may be a native direct child of another epic, but it is never an active
executable child. After the immediate epic/executable-leaf pair is canonical,
walk the resolved lineage leaf-to-root. For each ancestor whose matching direct
child row is still `planned` or absent:

1. require the nested epic's three-file aggregate to be canonical on the
   refreshed default branch;
2. review the exact ancestor manifest addition or `planned` to `canonical`
   change without creating an `epic-link.json` for the nested epic;
3. publish exactly the ancestor aggregate plus the already canonical nested
   aggregate tree through the aggregate/child pair contract; and
4. refresh both trees before continuing upward.

The pair references both epic issues and closes neither. Missing native
inventory, a cyclic aggregate path, divergent nested content, or any additional
changed path stops before publication. Code handoff occurs only for the original
executable leaf after every affected ancestor link is canonical; a nested epic
is never handed to `write-code`.

### Existing child

Use when `--child C` returns `valid`. Amend only the resolved child package under
`amendment-mode.md`. Aggregate outcomes/topology are related context; they are
not executable completion evidence. A rerun with no approved child change is a
no-op.

### Separate aggregate amendment

If the active child reveals a required cross-child outcome/topology change,
render that aggregate diff separately at the applicable requirements/design
gate. Child approval does not authorize it. Never change a sibling package from
this flow.

## Dependency and Lineage Boundary

Children use the ordinary execution and deliverable dependency classifiers.
Confirmed epic membership is displayed as informational lineage and removed
only from execution in-degree. Every sibling/external prerequisite and
structured deliverable dependency remains active. A checklist cannot authorize
selection, spec ownership, or closure.

For structured cross-child deliverables, order prerequisite owners before consumers in the approved child graph. Require `ready` or truthfully `blocked` evidence from the shared deliverable classifier; issue closure alone never proves that an artifact reached the default branch.

## Fail-Closed Boundary

Missing or duplicate links, mismatched paths/outcomes, a child absent from the
native set, executable aggregate files, cumulative legacy ownership, ambiguous
migration mappings, and noncanonical source/default evidence stop before writes.
Route the exact result and `evidenceDigest` to `$nmg-sdlc:upgrade-project`.

## Legacy Cumulative Compatibility

The pre-#177 cumulative umbrella shape is audit input only. This reference does
not contain a creation, seal, publication, child-generation, or body-fallback
recipe for it. New writes cannot append a child's ACs, FRs, tasks, Gherkin, or
issue ownership to a cumulative package.

When legacy package/ref/PR/relationship evidence exists:

1. classify it read-only with `umbrella-spec-status.mjs`,
   `umbrella-publication-status.mjs`, `epic-relationships.mjs`, and
   `epic-spec-authority.mjs`;
2. preserve exact paths, Git trees, issue/Project state, and ambiguous prose;
3. route any package split, ownership transfer, relationship repair, close, or
   reopen through one digest-bound, explicitly approved
   `$nmg-sdlc:upgrade-project` epic group; and
4. require post-write rehydration plus a no-op second audit.

Never apply `epic` to a started executable issue, start an epic, create an epic
publication from an issue-linked branch, or use child closing text to close an
epic.

## Authoritative Sources

| Behavior | Authoritative source |
|----------|----------------------|
| Aggregate and child schema/authority | `references/epic-spec-authority.md` |
| Exact aggregate/child publication | `references/canonical-umbrella-spec.md` |
| Epic issue and child creation | `skills/draft-issue/references/multi-issue.md` |
| Execution and deliverable prerequisites | `references/epic-relationships.md` and `references/deliverable-dependencies.md` |
| Legacy graph/spec/state repair | `skills/upgrade-project/references/epic-lifecycle-recovery.md` |
| Terminal merge and automatic eligible-ancestor closure | `skills/open-pr/references/ci-monitoring.md` and `epic-completion.md` |
