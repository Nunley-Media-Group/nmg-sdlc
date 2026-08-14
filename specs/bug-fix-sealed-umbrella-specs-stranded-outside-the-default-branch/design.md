# Root Cause Analysis: Fix Sealed Umbrella Specs Stranded Outside the Default Branch

**Issue**: #157
**Date**: 2026-08-13
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

The multi-PR lifecycle has no shared definition of a canonical umbrella specification. `skills/write-spec/SKILL.md` currently treats an exact `docs: seal umbrella spec for #N` commit anywhere in `HEAD` ancestry as proof that sealing is complete, then pushes only the current feature branch and immediately offers child creation and `$nmg-sdlc:start-issue` guidance. That proves neither publication nor visibility from the repository default branch, and the ancestry marker is lost when GitHub squash- or rebase-merges a later pull request.

The downstream entry points use different, weaker evidence. `skills/write-spec/references/discovery.md` resolves a parent only from `requirements.md` files in the current worktree. `skills/start-issue/SKILL.md` confirms the issue and proceeds to stale-branch reconciliation and `gh issue develop` without checking whether a confirmed epic parent's specification exists on the refreshed default branch. `skills/write-code/SKILL.md` trusts whichever active spec is visible in the current branch. Consequently, an independently created child branch can begin from a default branch that never received the approved parent contract.

`skills/upgrade-project/SKILL.md` inventories current working-tree specs and managed artifacts, but it does not compare multi-PR spec identities across the refreshed default branch and other bounded local/remote refs. Existing exercise coverage in `scripts/__tests__/exercise-write-spec-epic.test.mjs` scaffolds the parent spec in the same fixture branch and simulates idempotency with an empty commit, so it cannot expose publication gaps, independent child branches, history rewriting, or legacy recovery ambiguity.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/write-spec/SKILL.md` | 184-225 | Seals by current-branch commit ancestry, pushes only that branch, and transitions directly to child work. |
| `skills/write-spec/references/discovery.md` | 7-36 | Resolves parent specs from current-worktree frontmatter without proving refreshed default-branch publication. |
| `skills/write-spec/references/umbrella-mode.md` | 13-16, 142-149 | Defines multi-PR triggers and delegates to the incomplete Seal-Spec Flow. |
| `references/epic-relationships.md` | 7-20, 44-54 | Defines supported parent identity signals but not canonical parent-spec readiness. |
| `skills/start-issue/SKILL.md` | 145-177 | Moves from issue confirmation toward branch creation without a canonical-parent precondition. |
| `skills/write-code/SKILL.md` | 28-68 | Resolves the issue and active worktree spec without validating a child parent's refreshed default-branch baseline. |
| `skills/upgrade-project/SKILL.md` | 31-49, 78-135 | Analyzes current artifacts but has no cross-ref seal classification, approval category, or recovery procedure. |
| `skills/upgrade-project/references/upgrade-procedures.md` | 32-41, 125-151 | Applies approved spec findings without a safe stranded-spec restoration rule. |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | 24-47, 123-147 | Uses one worktree and an empty marker commit instead of exercising remote publication and independent history. |

### Triggering Conditions

- An approved umbrella specification is committed only on its feature branch while child branches are created from the repository default branch.
- A child entry point treats current-worktree presence as sufficient or performs no parent-spec readiness check.
- A squash, rebase, or other history-shaping merge preserves spec content but not the original seal commit as an ancestor.
- An initialized project contains legacy sealed refs that are absent from, differ from, or cannot be uniquely reconciled with the refreshed default branch.
- Existing exercises never separate the sealing branch, remote default branch, and child branch, so the incompatible assumptions remain invisible.

---

## Fix Strategy

### Approach

Introduce one zero-dependency, read-only `scripts/umbrella-spec-status.mjs` helper and a shared `references/canonical-umbrella-spec.md` contract. The helper validates an exact project/spec scope, resolves and fetches the repository's remote default branch, reads spec paths directly from Git trees without checkout, and returns stable JSON classifications. Parent-readiness mode resolves an issue number against the refreshed default branch's feature-spec frontmatter. Publication mode compares the exact committed source spec tree with the same path on the refreshed default branch. Audit mode examines only bounded local heads and `origin/*` refs for multi-PR-triggered spec paths and distinct tree identities.

Canonical readiness depends on spec content on the refreshed remote default branch, not on commit ancestry. The old seal commit and a structured pull-request body marker remain supporting provenance: the marker contains the umbrella issue number, validated spec path, and source tree identity so an in-flight pull request can be reused. After the pull request merges, exact default-branch tree identity is authoritative even if squash or rebase removed the original commit. If the remote cannot be refreshed or identity is ambiguous, every child entry point fails closed before mutation.

`$nmg-sdlc:write-spec` retains the exact-path seal commit and push, but it creates or reuses a spec-only pull request targeting the detected default branch. The pull request uses no version bump, changelog edit, manifest edit, marketplace edit, or unrelated path. An open matching pull request produces a pending-publication handoff; a closed-unmerged match produces an actionable stop; a merged match is followed by a fresh fetch and content reclassification. Child-issue creation and `$nmg-sdlc:start-issue` guidance occur only on a later canonical recheck. The publication pull request references, but does not close, the umbrella issue.

`$nmg-sdlc:upgrade-project` adds an independent seal-audit findings category. It reports `canonical`, `canonical with history marker lost`, `stranded but unambiguously recoverable`, `divergent from a same-path default-branch spec`, `ambiguous/unrecoverable`, or `unverifiable`, with exact path, ref, and tree evidence. Only an explicitly approved, still-current, single-identity stranded finding may restore an absent path into the worktree from its full source object ID. Recovery does not stage, commit, push, open a pull request, overwrite a path, switch/delete a branch, or mutate GitHub; it prepares the exact spec directory for the normal reviewed spec-only publication flow.

### Canonical Status Contract

| Status | Evidence | Consumer behavior |
|--------|----------|-------------------|
| `canonical` | Refreshed remote default contains the unique expected parent path or the exact publication source tree. | Child gates may proceed; sealing may transition to child-issue handling. |
| `canonical_marker_lost` | Default contains the canonical multi-PR spec but no original seal commit survives in default ancestry. | Proceed exactly as canonical and report the history-only marker loss. |
| `publication_pending` | Default lacks the source tree and one open PR carries the exact issue/path/tree marker. | Reuse the PR; stop before child transition and report its URL. |
| `stranded_recoverable` | Default lacks the path and all bounded candidate refs resolve to one spec tree identity. | Forward sealing may publish it; upgrade may restore it only after exact approval. |
| `divergent` | Default contains the path while a sealed/candidate ref has different content. | Preserve default as canonical; report the noncanonical ref; never overwrite. |
| `ambiguous` | Multiple paths or multiple source tree identities could satisfy the same umbrella issue. | Stop with exact candidates; require manual resolution. |
| `unverifiable` | Default-branch discovery, fetch, Git read, or required GitHub metadata failed. | Fail closed before branch, spec, code, recovery, or publication mutation. |

### Helper Interface and Safety

```text
node scripts/umbrella-spec-status.mjs \
  --project <path> \
  --parent-issue <N> \
  --json

node scripts/umbrella-spec-status.mjs \
  --project <path> \
  --spec <specs/path> \
  --source <commit-ish> \
  --json

node scripts/umbrella-spec-status.mjs \
  --project <path> \
  --all \
  --json
```

- `--parent-issue` is the child-readiness mode and searches only the refreshed default branch for a unique feature spec whose `**Issues**` or supported legacy `**Issue**` frontmatter contains `#N`.
- `--spec` plus `--source` is publication mode and compares the exact source tree at the validated `specs/<slug>/` path with the refreshed default branch.
- `--all` is upgrade audit mode and enumerates only multi-PR-triggered spec paths across `refs/heads/*` and `refs/remotes/origin/*`, deduplicated by full tree object ID.
- The helper accepts only a resolved project root, positive issue numbers, a normalized relative path below `specs/`, and an exact commit-ish resolved by Git. It rejects traversal, symlinks escaping the project, missing remotes, and malformed or duplicate frontmatter matches.
- Refresh uses an argument-array Git invocation for the exact default ref. Failure returns `unverifiable`; stale local remote-tracking data is never promoted to current proof.
- The helper performs no checkout, index write, worktree write, branch write, commit, push, pull-request mutation, or issue mutation.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/umbrella-spec-status.mjs` | Add deterministic Git/default-branch discovery, exact-tree comparison, bounded ref audit, stable JSON statuses, and reason codes. | Centralizes complex evidence gathering so every skill uses the same observable rule. |
| `references/canonical-umbrella-spec.md` | Define helper invocation, acceptable statuses, PR provenance marker, diagnostics, exact-scope invariants, and fail-closed behavior. | Shared by four workflow skills and upgrade; avoids duplicated prompt logic. |
| `references/epic-relationships.md` | Add canonical-parent readiness as a downstream use of confirmed parent identity and include `write-code` as a consumer. | Reuses supported native/body signals without redefining epic membership. |
| `skills/write-spec/SKILL.md` | Replace ancestry-only completion with source-tree classification, exact seal commit/push, marked spec-only PR creation/reuse, merged-default recheck, and delayed child transition. | Makes publication a real prerequisite and preserves no-version-bump scope. |
| `skills/write-spec/references/discovery.md` | Resolve parent identity through supported relationship metadata, then require a canonical default-branch parent path before amendment mode. | Prevents worktree-only parent discovery and unsupported `gh issue view --json parent` use. |
| `skills/write-spec/references/umbrella-mode.md` | Document publication-pending and canonical transition outcomes. | Keeps umbrella structure guidance aligned with the new lifecycle. |
| `skills/start-issue/SKILL.md` | Add a post-confirmation, pre-branch canonical-parent gate. | Blocks child branch/status mutation when the parent contract is unpublished. |
| `skills/write-code/SKILL.md` | Resolve supported parent identity and run the canonical gate before planning or editing. | Prevents implementation from relying on an uncanonical worktree-only parent. |
| `skills/open-pr/references/version-bump.md` | Replace its remaining unsupported `gh issue view --json parent` lookup with the shared GraphQL relationship contract. | Satisfies the cross-consumer native-parent invariant while preserving sibling-aware delivery behavior. |
| `skills/upgrade-project/SKILL.md` | Add seal audit scope, findings category, approval gate, apply ordering, report statuses, and error states. | Gives initialized projects a supported discovery and recovery path. |
| `skills/upgrade-project/references/sealed-spec-recovery.md` | Add classification interpretation, evidence rendering, apply-time revalidation, exact restore, divergence/ambiguity preservation, and idempotence rules. | Keeps the complex one-skill recovery branch out of the entrypoint. |
| `skills/upgrade-project/references/upgrade-procedures.md` | Route only approved recovery findings to the new reference and include stable reporting. | Preserves the existing decision-complete upgrade plan boundary. |
| `scripts/__tests__/umbrella-spec-status.test.mjs` | Add deterministic unit/integration coverage with disposable bare remotes and history shapes. | Proves classifier behavior without relying on live repositories. |
| `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` | Assert shared-reference wiring, mutation ordering, forbidden paths, stable markers, and fail-closed diagnostics. | Prevents prompt contracts from drifting apart. |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | Replace same-branch fixtures with separate default, sealing, PR-state, and child histories; cover repeat runs and single-PR preservation. | Reproduces the forward defect and marker-loss regression. |
| `scripts/__tests__/exercise-upgrade-sealed-spec.test.mjs` | Exercise all upgrade classifications, exact approval/recovery, divergence preservation, ambiguous evidence, dirty-file preservation, and second-run idempotence. | Reproduces affected-project states and validates safe recovery. |
| `README.md` | Explain spec-only publication, merge prerequisite, rerun/transition behavior, child gates, and upgrade recovery. | Keeps public user workflow synchronized with actual behavior. |
| `CHANGELOG.md` | Record the pending sealed-spec publication and recovery fix under `[Unreleased]`. | Makes the user-visible behavior change auditable. |
| `scripts/skill-inventory.baseline.json` | Regenerate after final contract line anchors settle. | Keeps the repository contribution gate current. |

All files under `skills/` and `references/` are skill-bundled and must be created or edited through `$skill-creator`. Script, test, spec, README, changelog, and generated inventory work follows the normal repository editing path.

### Spec-Only Pull Request Contract

The pull request body contains a stable machine-readable comment:

```text
<!-- nmg-sdlc:umbrella-spec
issue: #N
path: specs/<validated-slug>/
tree: <full-git-tree-oid>
-->
```

Before creating a pull request, `$nmg-sdlc:write-spec` verifies the seal commit touches only `specs/<validated-slug>/` and contains no `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, marketplace file, or unrelated path. It queries pull requests targeting the detected default branch and reuses an open exact-marker match. A merged match is not trusted until a fresh fetch proves the expected tree on the remote default branch. A closed-unmerged match is reported for explicit manual reopening or a new reviewed publication attempt; the skill does not silently duplicate it.

### Blast Radius

- **Direct impact**: Multi-PR sealing, child issue start, child spec discovery, child implementation entry, initialized-project upgrade, Git classification tooling, tests, and public workflow documentation.
- **Indirect impact**: `$nmg-sdlc:draft-issue` continues to create the same parent/body relationships; `$nmg-sdlc:open-pr` continues sibling-aware implementation delivery; single-PR specs bypass the new seal-publication branch. The spec archive remains four files and existing default-branch specs remain canonical.
- **Risk level**: High because the fix changes several lifecycle entry points and adds remote freshness as a hard precondition, but mutations remain narrowly owned by their existing stages.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A transient GitHub or fetch failure blocks otherwise valid child work. | Medium | Return `unverifiable` with the exact failing command/ref and retry guidance; never fall back to stale proof or mutate first. |
| A child amendment differs from the default-branch umbrella tree and is falsely treated as divergence. | Medium | Parent-readiness mode checks the parent's unique baseline path on remote default, while exact tree equality is reserved for publication mode. |
| A legitimate single-PR feature is routed into publication gating. | Low | Retain the existing exact `## Multi-PR Rollout` / FR trigger and exercise the non-trigger path. |
| An open or previously closed publication PR is duplicated. | Medium | Match the validated issue/path/tree marker and base branch; reuse open PRs, recheck merged PRs, and stop on closed-unmerged evidence. |
| Upgrade overwrites a canonical or locally authored spec. | Low | Default wins on any same-path divergence; recovery requires default absence, one tree identity, explicit approval, apply-time revalidation, and an absent or byte-identical worktree target. |
| Broad ref scanning leaks unrelated history or becomes expensive. | Low | Limit audit to local heads and `origin/*`, read only multi-PR trigger/frontmatter metadata first, deduplicate by tree OID, and report exact bounded evidence. |
| Skill instructions and deterministic classifier statuses drift. | Medium | Add static contract tests, stable reason codes, disposable Git fixtures, skill-creator validation, inventory audit, and active-surface verification. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Keep child branches stacked on the umbrella branch | Make parent files visible by changing branch topology. | Conflicts with the existing independent-child delivery model, complicates merging, and is explicitly out of scope. |
| Add a fifth persistent seal metadata file to every spec directory | Store issue/path/hash state inside `specs/<slug>/`. | Changes the established four-file archive, creates metadata lifecycle questions during amendments, and is unnecessary when refreshed default-tree identity is authoritative. |
| Preserve the exact seal commit through merge policy | Require merge commits or rebase behavior that retains ancestry. | Repository merge strategy is not guaranteed and the defect explicitly requires squash/rebase tolerance. |
| Duplicate Git commands in each affected skill | Document separate checks in `start-issue`, `write-spec`, `write-code`, and `upgrade-project`. | Complex status logic would drift across prompt contracts and be difficult to exercise deterministically. |
| Automatically merge the spec-only pull request | Create and merge publication in one sealing action. | Exceeds normal merge authority and removes the user's existing review/merge gate. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #157 | 2026-08-13 | Initial defect design |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
