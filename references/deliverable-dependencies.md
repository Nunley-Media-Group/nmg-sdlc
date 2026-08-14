# Deliverable Dependency Contract

**Consumed by**: `draft-issue`, `write-spec`, `start-issue`, `status`, and `upgrade-project` for multi-PR children whose work requires a task or artifact owned by another child.

Independent issue branches can consume only content merged into the repository default branch. A task checkpoint inside an open sibling is not a branchable dependency boundary. Represent every cross-child prerequisite with a deliverable-owning issue, a whole-issue execution edge, and merged default-branch evidence before reporting the downstream child ready.

## Table of Contents

1. [Child Body Record](#child-body-record)
2. [Supported Boundaries](#supported-boundaries)
3. [Deterministic Classifier](#deterministic-classifier)
4. [Planning Contract](#planning-contract)
5. [Start and Status Contract](#start-and-status-contract)
6. [Existing-Plan Audit](#existing-plan-audit)
7. [Verification Matrix](#verification-matrix)

## Child Body Record

Write one line-anchored bullet for each approved cross-child prerequisite:

```text
- Requires deliverable from #122: T054 validated schema/register baseline
```

Rules:

- `#122` is the issue that owns the independently delivered prerequisite.
- The description names the task IDs and/or artifact; keep it single-line and at most 512 characters.
- Write a matching line-anchored `Depends on: #122` execution dependency. A coordination parent, label, checklist row, or native epic membership does not substitute for this edge.
- Multiple requirements may name the same owner. Preserve each distinct description and deduplicate exact repeats.
- Ignore cross-repository references and reject self-references.

## Supported Boundaries

When a downstream child needs work assigned to a sibling, finalize the plan with one of these shapes:

| Shape | Use when | Required graph |
|-------|----------|----------------|
| Whole-issue dependency | Waiting for the existing owner issue is the smallest safe plan. This is the recommended default. | Downstream child records the deliverable and `Depends on: #owner`. |
| Extracted baseline issue | The baseline is independently reviewable and real parallelism justifies another PR. | Move ownership to the baseline issue; every consumer records and depends on that issue. |

Do not approve a child that starts after `TNNN`, an artifact, a commit, or another midpoint inside an open sibling without one of these boundaries. Stacked branches and task-level GitHub dependency objects are unsupported.

## Deterministic Classifier

Prompt consumers construct the same input used by `scripts/deliverable-dependencies.mjs`:

- active issue number and complete body;
- live repository default branch;
- normalized `executionDependencies` from `references/epic-relationships.md`;
- every declared owner issue with fully paged `closedByPullRequestsReferences` containing PR number, state, merge time, base name, and merge-commit OID.

The result contains `status`, `reasonCode`, `issueNumber`, `defaultBranch`, normalized `requirements`, and `gaps`. Each requirement reports `ownerIssue`, `description`, `executionEdge`, `ownerState`, `mergedPullRequest`, and `available`.

| Status | Meaning | Required behavior |
|--------|---------|-------------------|
| `none` | No structured cross-child prerequisite exists. | Preserve ordinary dependency behavior. |
| `ready` | Every owner has the matching execution edge, is closed, and has a merged closing PR to the live default branch with a merge commit. | The deliverable contract permits normal readiness. |
| `blocked` | The graph is consistent, but at least one owner lacks merged default-branch delivery. | Exclude from start selection and do not advance status. |
| `repair_required` | An owner lacks its execution edge, self-references, or disagrees with the approved plan/spec mapping. | Stop and route existing-plan repair through `$nmg-sdlc:upgrade-project`. |
| `unverifiable` | Required body, issue, relationship, default-branch, pagination, or closing-PR evidence is missing or malformed. | Fail closed; never infer availability. |

Issue state alone is insufficient. A manually closed issue, an unmerged PR, a PR merged to another base, or a merged PR without a merge-commit OID does not prove the deliverable is available from the default branch.

## Planning Contract

Before child issue creation or graph approval:

1. Inventory each planned child's owned task IDs and named artifacts from the approved spec and Delivery Phases.
2. Scan other children for references to those IDs/artifacts and explicit ordering language such as `after`, `requires`, `consume`, `baseline`, or `checkpoint`.
3. Classify every cross-child reference as whole-issue waiting or extracted-baseline delivery. Recommend whole-issue waiting unless a separate baseline is independently reviewable and needed for parallelism.
4. Add the corresponding child-DAG edge and structured body record. Render owner, consumer, prerequisite, and boundary at the graph review gate.
5. Re-fetch created bodies and relationships. Require task ownership, structured records, and normalized execution dependencies to describe the same pairs before reporting successful handoff.

An unanswered gate authorizes nothing. Apply only the user's approved boundary and graph. A plan whose midpoint remains unrepresentable stops before issue creation.

## Start and Status Contract

- Add structured owner numbers to the relationship hydration target set before applying bounds.
- Hydrate the repository default branch and fully page closing-PR evidence for every owner.
- Run the classifier after epic/execution relationship classification.
- `start-issue` excludes `blocked`, `repair_required`, and `unverifiable` candidates. An explicit issue start reruns the same check before stale-branch handling, checkout, branch creation, or project mutation.
- `status` exposes the result as `issue.deliverableDependencies`. `blocked` recommends waiting for named merged deliverables; `repair_required` recommends `$nmg-sdlc:upgrade-project`; `unverifiable` requests evidence recovery. None may advance an otherwise later lifecycle stage.

## Existing-Plan Audit

`$nmg-sdlc:upgrade-project` owns the audit and repair path for initialized projects:

1. Reuse its complete, native-authoritative epic graph. Inspect only canonical umbrella specs and their confirmed children, with bounded issue/spec counts and body sizes.
2. Inventory task ownership from the canonical spec and explicit child `Task ownership:` records. Inspect structured deliverable bullets first.
3. Detect bounded legacy candidates when one child line contains a sibling issue reference plus a task ID or artifact/checkpoint phrase (`baseline`, `artifact`, `checkpoint`, `after`, `consume`, `requires`). Treat candidates as findings only; never convert prose directly into authority.
4. Compare each candidate with task ownership, structured records, execution edges, and closing-PR evidence. Report consumer, owner, exact source line/task/artifact, current availability, and both supported remedies.
5. A partial graph, incomplete pagination, missing canonical spec, ambiguous ownership, or conflicting evidence makes the affected audit `unverifiable`; it cannot produce a clean result or mutation proposal.

### Approval-Gated Whole-Issue Repair

Automatic repair is limited to an exact whole-issue change. Baseline extraction requires a separately reviewed issue/spec amendment.

1. Present the exact downstream issue, owner, structured bullet to add, and normalized `Depends on:` line. Preserve all unrelated body text and metadata.
2. Ask for approval through the consuming workflow's interactive gate and stop until the user answers.
3. Immediately re-fetch the exact bodies, labels, parent/sub-issue records, default branch, and closing-PR evidence. Compare body digests and relationship sets with the approved snapshot; abort only the drifted repair.
4. Write with a temporary `--body-file`. Do not create a native parent for an execution dependency and do not rewrite the coordination parent.
5. Re-fetch, require the classifier to return `blocked` or `ready` with no repair gap, then run the audit again. A second run must propose no mutation.

Preserve partial writes exactly. Never add another owner, create a replacement child, infer baseline extraction, or mutate an unrelated issue to compensate.

## Verification Matrix

Cover at least these states in deterministic tests and exercises:

- no requirement; valid ready; owner open; missing execution edge; coordination-only pair;
- manually closed owner; unmerged closer; wrong-base closer; malformed merge evidence; incomplete pagination;
- structured plan/spec drift; bounded legacy candidate; approved repair; pre-write drift; second-run no-op;
- independent child branches created from a refreshed default branch, where every reported-ready child can read its prerequisite from a merged deliverable.
