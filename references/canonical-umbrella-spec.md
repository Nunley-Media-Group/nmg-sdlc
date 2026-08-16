# Canonical Epic and Legacy Umbrella Specifications

**Consumed by**: `write-spec` publication, downstream epic-child authority
checks, and `upgrade-project` audit/recovery. `start-issue` never requires a spec
before selecting a ready child.

A legacy sealed umbrella or new aggregate/child pair is canonical only when
refreshed `origin` default-branch content proves it. A source commit, worktree,
feature branch, or pull-request state is supporting evidence, never a substitute
for exact default-branch trees.

## Inspect Status

Resolve the installed plugin root from the consuming skill's own path, then run exactly one read-only helper mode against the consumer project root:

```bash
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --parent-issue <N> --json
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --spec <specs/slug> --source <commit-ish> --json
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --aggregate <specs/epic-slug> --child-spec <specs/child-slug> --source <commit-ish> --json
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --all --json
```

- Use `--parent-issue` for default-branch aggregate/legacy compatibility proof.
  It recognizes a schema-v1 `epic-scope.json` aggregate first, then legacy
  multi-PR packages. It is not a start-issue prerequisite.
- Use `--spec` with `--source` during forward publication. It compares the full source spec-directory tree with the same path on the freshly fetched default branch.
- Use `--aggregate` with `--child-spec` and `--source` for all new epic-child
  publication. An executable child path validates the bidirectional manifests;
  a distinct nested `specs/epic-*` child path validates both aggregate manifests
  recursively. The helper compares the exact source/default tree pair.
  First-child changes are limited to both new directories. Later-child changes
  are limited to the new child directory plus `epic-scope.json`. An ancestor
  link may reuse an unchanged exact nested-aggregate tree while publishing only
  the approved ancestor aggregate/manifest.
- Use standalone `--all` during upgrade analysis. It scans only bounded `refs/heads/*` and `refs/remotes/origin/*` histories, filters to multi-PR-triggered feature specs, and deduplicates candidates by full tree object ID.

The helper discovers `origin`'s symbolic default branch through `git ls-remote`, fetches its objects without checkout or local branch/ref updates, and reads committed trees directly. It never writes the worktree or index, switches or creates a branch, stages, commits, pushes, or mutates GitHub.

## Interpret Status

| Status | Evidence | Consumer behavior |
|--------|----------|-------------------|
| `canonical` | Refreshed default contains the expected path/tree and the historical seal subject remains in default ancestry. | Proceed. |
| `canonical_marker_lost` | Refreshed default contains the expected path/tree but squash/rebase history omitted the seal subject. | Proceed exactly as canonical and report the supporting-marker loss. |
| `stranded_recoverable` | Default lacks the path and bounded evidence has one path/tree identity. | Child entry points stop. Sealing may publish it; upgrade may prepare it only after exact approval and revalidation. |
| `divergent` | Default contains the path but a candidate/source tree differs. | Preserve default as canonical; stop publication/recovery and report the noncanonical evidence. |
| `ambiguous` | More than one path or tree could satisfy the same umbrella identity. | Stop and require manual resolution. |
| `unverifiable` | Default discovery/fetch, Git reading, strict metadata, or required evidence failed. | Fail closed before mutation and report `reasonCode` plus `gaps`. |

`audit` mode returns these statuses per finding. `publication_pending` is a workflow state, not a Git classification: `write-spec` derives it only after the helper reports a noncanonical source and one open pull request matches the exact marker below.

## Publication Marker

New epic-child publications use exactly one pair marker:

```text
<!-- nmg-sdlc:aggregate-child-spec
epic: #E
aggregate: specs/epic-<slug>/
aggregate-tree: <full-git-tree-oid>
child: #C
child-spec: specs/<type>-<slug>/ or specs/epic-<nested-slug>/
child-tree: <full-git-tree-oid>
digest: <sha256-of-normalized-pair>
-->
```

Derive the marker and dedicated ref with exported helpers from
`umbrella-publication-status.mjs`; do not hand-normalize or truncate identity.
The head is
`nmg-sdlc/spec-publication-E-C-<first-12-characters-of-digest>`. The PR body
references both issues and closes neither. The legacy marker below remains
readable for historical cumulative packages only. A nested-aggregate pair does
not make the child epic executable and never creates `epic-link.json` for it.

Put this stable comment in the spec-only pull-request body:

```text
<!-- nmg-sdlc:umbrella-spec
issue: #N
path: specs/<validated-slug>/
tree: <full-git-tree-oid>
-->
```

Validate `N`, the normalized path, and the 40-character tree object ID before comparing markers. Match the complete marker plus the detected base branch. Reuse one open exact match; after a merged match, fetch and classify again. Stop on a closed-unmerged exact match or multiple exact matches instead of silently creating a duplicate.

The publication PR references the umbrella issue without closing it. Body wording is supporting evidence only: a branch created through `gh issue develop` can retain a native closing association despite `Refs #N`.

## Dedicated Publication Ref

Keep the issue-linked sealing branch as source provenance, but never use it as the publication PR head. Derive the dedicated ref from validated evidence:

```text
nmg-sdlc/spec-publication-<issue>-<first-12-characters-of-source-tree>
```

Create it only with a plain full-commit push:

```bash
git push origin <full-seal-commit>:refs/heads/<dedicated-publication-ref>
```

For a new aggregate/child pair, use the pair-derived ref documented above.
Never create or link either publication ref with `gh issue develop`. Before
pushing, query the exact remote ref. Reuse it only when it resolves to the same
full source commit; a collision or mismatch stops. Never force-push it. The PR
must use the dedicated head, target the detected default branch, and contain
only the exact approved path set. It never changes `VERSION`, `CHANGELOG.md`,
`.codex-plugin/plugin.json`, a marketplace file, or an unrelated dirty path.

## GitHub Closing-Semantic Gate

After creating or finding an exact-marker PR, invoke the read-only helper from the installed plugin root:

For new aggregate/child publication:

```bash
node <plugin-root>/scripts/umbrella-publication-status.mjs \
  --project <project-root> --repository <owner/name> \
  --epic E --child C --pr <publication-pr-number> \
  --aggregate specs/epic-<slug> --aggregate-tree <full-aggregate-tree-oid> \
  --child-spec <specs/executable-or-nested-aggregate-path> --child-tree <full-child-tree-oid> \
  --source <full-source-commit> --base <detected-default-branch> --json
```

The helper requires both epic and child to remain open and rejects a closing
reference to either one. For a legacy cumulative publication, use:

```bash
node <plugin-root>/scripts/umbrella-publication-status.mjs \
  --project <project-root> \
  --repository <owner/name> \
  --issue <N> \
  --pr <publication-pr-number> \
  --spec specs/<validated-slug> \
  --tree <full-source-tree-oid> \
  --source <full-seal-commit> \
  --base <detected-default-branch> \
  --json
```

The helper validates the exact marker, dedicated head, base, and head commit; reads `closingIssuesReferences`; and walks the issue's bounded `ClosedEvent` / `ReopenedEvent` timeline through GitHub GraphQL. It processes those events chronologically and attributes recovery only to the currently active closure interval. A reopen clears the preceding closure; a later unrelated close becomes active and cannot authorize publication recovery. It performs no Git or GitHub mutation.

| Status | Evidence | Consumer behavior |
|--------|----------|-------------------|
| `pending_safe` | Exact marked open PR uses the dedicated head, umbrella is open, and its closing references exclude the umbrella. | Report `publication_pending` and the normal review/merge handoff. |
| `merged_safe` | Exact marked PR merged and the umbrella is currently open; no unexplained closing relationship remains. `evidence.recovered` identifies an approved prior reopen. | Combine with fresh canonical Git-tree proof before child transition. |
| `closing_relationship` | The open PR includes the umbrella in `closingIssuesReferences`, or a merged PR retains an unexplained closing relationship. | Lifecycle error. Do not report pending/success or encourage merge. |
| `publication_closed_umbrella` | The exact marked merged PR is the repository-qualified closer of the umbrella's currently active `ClosedEvent` and the issue remains closed. | Lifecycle error. Offer only the exact recovery gate below. |
| `closed_unrelated` | The umbrella is closed without exact evidence that this marked PR closed it. | Fail closed; never reopen through publication recovery. |
| `unverifiable` | Required repository, marker, head/base/commit, closing-reference, issue, or timeline evidence is incomplete or inconsistent. | Fail closed with `reasonCode`, `gaps`, and evidence. |

Before merge, only `pending_safe` may become `publication_pending`. After merge, require both `merged_safe` and fresh `canonical` / `canonical_marker_lost` content proof. Content proof never overrides a GitHub semantic failure.

For diagnosis and recovery only, a merged historical exact-marker PR may have the former issue-linked head. The helper exposes `evidence.dedicatedHead = false`; it can still prove an exact publication-caused closure or a currently open historical merge. An open PR with a non-dedicated head is never `pending_safe`.

## Exact Reopen Recovery

Recovery is available only for `publication_closed_umbrella`. Render the exact issue, PR, marker, dedicated head, merge time, and repository-qualified currently active `ClosedEvent` closer. A historical publication closure cleared by `ReopenedEvent`, a later unrelated active closure, or a same-number PR from another repository never qualifies. Ask for approval to reopen that exact issue; approval for another action, silence, or a general continuation request is not approval.

After exact approval, run `gh issue reopen N`, refetch through the helper, and continue only when it returns `merged_safe` with `evidence.recovered = true` and the canonical tree check still passes. Never reopen `closed_unrelated`, `closing_relationship`, or `unverifiable` state. Ordinary implementation PR closure remains owned by `$nmg-sdlc:open-pr` and is unchanged by this contract.

## Child Readiness

`start-issue` uses only relationship and genuine dependency readiness; it may
start the first ready child before an aggregate exists. It displays resolved
lineage informationally and never makes aggregate publication an execution edge.
The canonical parent-spec gate therefore begins with `write-spec`, not branch
creation or the issue/Project transition performed by `start-issue`.

`write-spec` creates the missing aggregate with the first child or requires
canonical aggregate proof for a later child. `write-code`, `verify-code`,
`status`, and `open-pr` require `epic-spec-authority.mjs --child C` to return
`valid` from the applicable committed/default source before consuming work.
They use only the child issue-scope slice; parent-mode legacy proof alone cannot
authorize a new epic child.

## Recovery Invariants

- Default-branch content always wins on same-path divergence.
- Recovery requires an exact approved `stranded_recoverable` finding, a fresh identical classification, one full source commit/tree identity, and an absent or byte-identical worktree target.
- Restore only the approved `specs/<slug>/` content. Do not stage, commit, push, open/merge a PR, switch/delete a branch, update a ref, or mutate GitHub.
- Preserve unrelated dirty files, project-authored content, release artifacts, and the index.
- A repeated publication or recovery analysis must produce no duplicate PR, restoration, or diff.
