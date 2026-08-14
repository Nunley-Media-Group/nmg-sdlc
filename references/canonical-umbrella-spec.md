# Canonical Umbrella Specifications

**Consumed by**: `write-spec` sealing and parent discovery, `start-issue` child readiness, `write-code` child readiness, `open-pr` child delivery readiness, and `upgrade-project` seal audit and recovery.

A sealed umbrella specification is canonical only when refreshed `origin` default-branch content proves it. A seal commit, current-worktree copy, feature-branch copy, or pull-request state is supporting evidence, never a substitute for the default-branch tree.

## Inspect Status

Resolve the installed plugin root from the consuming skill's own path, then run exactly one read-only helper mode against the consumer project root:

```bash
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --parent-issue <N> --json
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --spec <specs/slug> --source <commit-ish> --json
node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --all --json
```

- Use `--parent-issue` before child branch, child spec, implementation plan, delegation, or code mutation. It searches the freshly fetched default tree for one feature spec whose strict `**Issues**` or legacy `**Issue**` field contains the confirmed parent.
- Use `--spec` with `--source` during forward publication. It compares the full source spec-directory tree with the same path on the freshly fetched default branch.
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

Never create or link that ref with `gh issue develop`. Before pushing, query the exact remote ref. Reuse it only when it resolves to the same full seal commit; a collision or mismatch stops. Never force-push it. The PR must use this dedicated head, target the detected default branch, and contain only the exact approved spec directory. It never changes `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, a marketplace file, or an unrelated dirty path.

## GitHub Closing-Semantic Gate

After creating or finding an exact-marker PR, invoke the read-only helper from the installed plugin root:

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

The helper validates the exact marker, dedicated head, base, and head commit; reads `closingIssuesReferences`; and walks the issue's bounded `ClosedEvent` timeline through GitHub GraphQL. It performs no Git or GitHub mutation.

| Status | Evidence | Consumer behavior |
|--------|----------|-------------------|
| `pending_safe` | Exact marked open PR uses the dedicated head, umbrella is open, and its closing references exclude the umbrella. | Report `publication_pending` and the normal review/merge handoff. |
| `merged_safe` | Exact marked PR merged and the umbrella is currently open; no unexplained closing relationship remains. `evidence.recovered` identifies an approved prior reopen. | Combine with fresh canonical Git-tree proof before child transition. |
| `closing_relationship` | The open PR includes the umbrella in `closingIssuesReferences`, or a merged PR retains an unexplained closing relationship. | Lifecycle error. Do not report pending/success or encourage merge. |
| `publication_closed_umbrella` | The exact marked merged PR is the umbrella's `ClosedEvent` closer and the issue remains closed. | Lifecycle error. Offer only the exact recovery gate below. |
| `closed_unrelated` | The umbrella is closed without exact evidence that this marked PR closed it. | Fail closed; never reopen through publication recovery. |
| `unverifiable` | Required repository, marker, head/base/commit, closing-reference, issue, or timeline evidence is incomplete or inconsistent. | Fail closed with `reasonCode`, `gaps`, and evidence. |

Before merge, only `pending_safe` may become `publication_pending`. After merge, require both `merged_safe` and fresh `canonical` / `canonical_marker_lost` content proof. Content proof never overrides a GitHub semantic failure.

For diagnosis and recovery only, a merged historical exact-marker PR may have the former issue-linked head. The helper exposes `evidence.dedicatedHead = false`; it can still prove an exact publication-caused closure or a currently open historical merge. An open PR with a non-dedicated head is never `pending_safe`.

## Exact Reopen Recovery

Recovery is available only for `publication_closed_umbrella`. Render the exact issue, PR, marker, dedicated head, merge time, and matching `ClosedEvent` closer. Ask for approval to reopen that exact issue; approval for another action, silence, or a general continuation request is not approval.

After exact approval, run `gh issue reopen N`, refetch through the helper, and continue only when it returns `merged_safe` with `evidence.recovered = true` and the canonical tree check still passes. Never reopen `closed_unrelated`, `closing_relationship`, or `unverifiable` state. Ordinary implementation PR closure remains owned by `$nmg-sdlc:open-pr` and is unchanged by this contract.

## Child Readiness

Resolve the child's confirmed coordination parent through `references/epic-relationships.md`, then invoke parent mode. Only `canonical` and `canonical_marker_lost` satisfy the gate. Run it:

- in `start-issue` after issue confirmation and before stale-branch reconciliation, dirty-tree handling, branch creation, or project status mutation;
- in `write-spec` before amendment mode or child-spec writes;
- in `write-code` before implementation planning, delegation, or edits.
- in `open-pr` before sibling completion classification, version artifact edits, commits, pushes, or pull-request mutation.

Parent readiness proves the canonical baseline path, not equality with a child branch that may contain approved child-scoped amendments. An issue with no confirmed coordination parent keeps its existing single-PR or keyword-fallback behavior.

## Recovery Invariants

- Default-branch content always wins on same-path divergence.
- Recovery requires an exact approved `stranded_recoverable` finding, a fresh identical classification, one full source commit/tree identity, and an absent or byte-identical worktree target.
- Restore only the approved `specs/<slug>/` content. Do not stage, commit, push, open/merge a PR, switch/delete a branch, update a ref, or mutate GitHub.
- Preserve unrelated dirty files, project-authored content, release artifacts, and the index.
- A repeated publication or recovery analysis must produce no duplicate PR, restoration, or diff.
