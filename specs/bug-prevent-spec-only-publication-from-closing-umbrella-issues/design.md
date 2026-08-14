# Root Cause Analysis: Prevent Spec-Only Publication from Closing Umbrella Issues

**Issue**: #161
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

`skills/write-spec/SKILL.md` correctly limits a Seal-Spec publication to the exact canonical spec tree and uses `Refs #N`, but it opens the publication pull request from the current sealing branch. That branch was normally created by `$nmg-sdlc:start-issue` through `gh issue develop`, which establishes a native GitHub link between the branch and the umbrella issue. GitHub can therefore populate the pull request's `closingIssuesReferences` from the linked-branch association even when the pull-request body contains no closing keyword.

The current contract checks prose rather than platform semantics. `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` asserts that the skill contains `Refs #N`, and `scripts/__tests__/exercise-write-spec-epic.test.mjs` exercises separate Git histories but never creates a GitHub pull request or reads `closingIssuesReferences` or issue timeline events. After an exact-marker PR merges, the Seal-Spec flow rechecks only canonical Git tree identity. It does not verify that the umbrella stayed open or associate a `ClosedEvent` with the marked publication PR, so an auto-closed umbrella can be reported as a successful coordination transition.

### Affected Code

| File | Role |
|------|------|
| `skills/write-spec/SKILL.md` | Pushes the issue-linked sealing branch and creates/reuses the publication PR from that same head; trusts non-closing body wording. |
| `references/canonical-umbrella-spec.md` | Defines exact marker and Git-tree safety, but no head-branch isolation, closing-reference, post-merge timeline, or recovery contract. |
| `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` | Protects `Refs #N` as the non-closing proof and does not assert actual GitHub semantic checks. |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | Exercises Git/default-tree behavior without GitHub PR association or timeline state. |
| `scripts/sdlc-status.mjs` | Demonstrates existing use of PR `closingIssuesReferences`, but does not own Seal-Spec publication verification. |

### Triggering Conditions

- The umbrella branch was created through GitHub's issue-linked branch workflow.
- The spec-only publication pull request uses that linked branch as its head.
- The workflow treats `Refs #N` as sufficient proof that the pull request is non-closing.
- The merge rerun checks canonical Git content without checking issue state and the publication PR's timeline relationship.

GitHub documents that creating a branch for an issue links later pull requests from that branch and that merging a linked pull request into the default branch closes the issue. The observed PathCast #108/#125 timeline confirms that behavior for this flow.

---

## Fix Strategy

### Approach

Keep the existing issue-linked sealing branch as the durable source branch, seal commit, and exact-tree evidence. Publish the already-validated seal commit through a second, deterministic remote branch created with a plain Git ref push rather than `gh issue develop`. The publication branch name includes the umbrella number and source-tree prefix, and the workflow never links it to the issue. The PR continues to target the detected default branch, contains the exact marker and `Refs #N`, and publishes the same seal commit/tree.

Add one zero-dependency, read-only `scripts/umbrella-publication-status.mjs` helper for GitHub semantic evidence. Given an exact repository, umbrella issue, and marked PR, it queries the PR's state, merge state, head/base refs, body marker, and `closingIssuesReferences`, then queries the issue state and bounded timeline `ClosedEvent` nodes through GraphQL. It returns a stable classification without mutating branches, pull requests, or issues.

Before a new or reused publication PR is considered `publication_pending`, require all of the following: the head is the expected dedicated unlinked publication ref, the base is the detected default branch, the exact marker matches issue/path/tree, the PR contains only the already-validated seal commit scope, the umbrella is open, and `closingIssuesReferences` excludes it. A mismatched or closing PR is a lifecycle error and cannot be merged through the workflow.

After a matching PR merges, rerun both classifiers. Canonical Git tree identity remains authoritative for content, while the publication helper must report the umbrella open and no `ClosedEvent` tied to that PR before child transition succeeds. If the exact marked PR closed the exact umbrella, report `publication_closed_umbrella`. The supported recovery path shows the PR/timeline evidence and may reopen only that issue after an explicit approval; it then refetches and requires the issue to be open before continuing. A closed issue without exact marked-PR closure evidence remains fail-closed and is never reopened automatically.

### Publication State Contract

| Status | Evidence | Workflow behavior |
|--------|----------|-------------------|
| `pending_safe` | Exact marked open PR, expected dedicated head/base, umbrella open, and no umbrella closing reference. | Report `publication_pending`; wait for normal review and merge. |
| `merged_safe` | Exact marked PR merged, umbrella remains open, and no PR-linked `ClosedEvent` exists. | Combine with canonical tree proof and permit child transition. |
| `closing_relationship` | PR `closingIssuesReferences` includes the umbrella before merge. | Lifecycle error; do not report pending-safe or encourage merge. |
| `publication_closed_umbrella` | Exact marked PR is merged and the umbrella is closed by a timeline `ClosedEvent` whose closer is that PR. | Lifecycle error; offer exact approval-gated reopen recovery. |
| `closed_unrelated` | Umbrella is closed but the exact publication PR is not its proven closer. | Fail closed; do not reopen. |
| `unverifiable` | Required repository, PR, marker, closing-reference, issue, or timeline evidence is missing or inconsistent. | Fail closed with exact gaps and no GitHub mutation. |

### Dedicated Publication Branch Contract

```text
source branch: issue-linked sealing branch retained unchanged
source commit: full validated seal commit
publication ref: refs/heads/nmg-sdlc/spec-publication-<issue>-<source-tree-prefix>
creation: git push origin <seal-commit>:<publication-ref>
forbidden: gh issue develop, branch linking, force-push, or a different tree
```

The workflow verifies a pre-existing publication ref resolves to the same full seal commit before reuse. A collision or mismatched ref stops. It does not delete the sealing branch, force-push, or rewrite a user's existing branch.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/umbrella-publication-status.mjs` | Add validated repository/issue/PR inputs, exact marker/head/base checks, `closingIssuesReferences`, bounded issue timeline inspection, stable statuses, and read-only JSON output. | Centralizes GitHub closing semantics so prompt instructions and tests do not drift. |
| `references/canonical-umbrella-spec.md` | Extend the shared contract with dedicated publication-ref identity, semantic statuses, post-merge verification, and exact approval-gated reopen rules. | Keeps Seal-Spec Git and GitHub safety in one shared reference. |
| `skills/write-spec/SKILL.md` | Push the seal commit to a deterministic unlinked publication ref; create/reuse only safe exact PRs; run semantic checks before pending and after merge; route exact historical closure through recovery. | Removes the root linked-branch trigger and prevents false successful transitions. |
| `scripts/__tests__/umbrella-publication-status.test.mjs` | Add contract-faithful GraphQL/PR fixtures for safe pending/merged, closing references, exact publication closure, unrelated closure, invalid marker/ref, and incomplete evidence. | Deterministically proves AC1-AC4 and semantic failure modes. |
| `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs` | Replace body-wording-only assertions with dedicated-ref, closing-reference, post-merge timeline, recovery, ordinary-delivery, and existing scope invariants. | Protects the cross-file workflow contract. |
| `scripts/__tests__/exercise-write-spec-epic.test.mjs` | Exercise exact seal-commit publication to a separate ref and prove the issue-linked source ref is not the PR head; retain independent-history, verified-tree, and no-reseal cases. | Reproduces the branch-topology portion without live GitHub writes. |
| `scripts/exercise-github-umbrella-publication.mjs` | Add an explicit opt-in disposable-repository exercise that creates issue-linked and unlinked publication cases, merges their PRs, and asserts actual closing references and issue timeline state. | Satisfies AC7 with live GitHub semantics rather than prose matching. |
| `README.md`, `CHANGELOG.md` | Document the dedicated publication branch, non-closing verification, recovery behavior, and pending defect fix. | Keeps public behavior and release evidence current. |

All edits under `skills/` and `references/` are routed through `$skill-creator` as required by technical steering.

### Live Exercise Safety

The live exercise is opt-in and requires an explicit disposable repository argument plus an acknowledgement flag. It creates uniquely named fixture issues, branches, commits, and pull requests, merges only those fixture PRs, records resulting issue/timeline JSON, and never targets the current production repository by default. Deterministic tests run in the normal suite; the live exercise is run only where a disposable authenticated repository and merge authority are intentionally supplied.

### Blast Radius

- **Direct impact**: Multi-PR Seal-Spec publication branch creation, PR reuse/creation, pre-merge classification, post-merge transition, historical publication recovery, contract tests, and documentation.
- **Indirect impact**: Existing canonical tree/status helpers remain content authorities; child creation still requires canonical proof; the issue-linked sealing branch remains available as source evidence.
- **Unaffected**: Ordinary `$nmg-sdlc:open-pr` delivery, intentional `Closes #N` behavior, single-PR specs, child amendments, versioning, changelog release rolls, and umbrella identity classification.
- **Risk level**: Medium-high because GitHub issue state is remote coordination data, but the fix is isolated to the exact marker-based spec publication path and fails closed on incomplete evidence.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| GitHub still associates the dedicated branch with the issue through another signal. | Low | Query `closingIssuesReferences` after PR creation/reuse and refuse pending-safe classification if the umbrella appears. |
| A stale or malicious PR body reuses the publication marker. | Low | Validate full issue/path/tree marker, expected base, deterministic head ref, full head commit, and exact publication scope. |
| A merged publication closes the umbrella before the rerun observes it. | Medium | Inspect current issue state and bounded timeline events; report a lifecycle error and require exact approval before reopen. |
| Recovery reopens an issue closed for another reason. | Low | Require the exact marked publication PR to be the `ClosedEvent` closer; unrelated closure is never recoverable through this path. |
| Dedicated branch creation publishes the wrong commit or overwrites a ref. | Low | Push the full validated seal commit to a deterministic ref, verify pre-existing ref identity, and never force-push. |
| Ordinary delivery stops closing implementation issues. | Low | Keep changes inside the Seal-Spec flow; add explicit passthrough contract tests for `$nmg-sdlc:open-pr`. |
| Timeline pagination hides the relevant closing event. | Medium | Query bounded recent timeline pages with pagination until the exact merge time/PR event is found or return `unverifiable`; never assume absence from a truncated page. |
| Live exercise pollutes a production repository. | Low | Require an explicit disposable repo and acknowledgement; generate uniquely named fixtures and refuse implicit current-repo execution. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Keep the issue-linked head and rely on `Refs #N` | Change only PR body wording. | The observed failure proves linked-branch semantics override that assumption. |
| Unlink the existing sealing branch through GitHub UI/API | Remove the native issue association before PR creation. | GitHub does not provide a dependable cross-version workflow contract for unlinking, and mutation would destroy useful source provenance. |
| Create the seal directly on an unlinked branch | Stop using the issue-linked branch for approved source state. | Weakens issue-start traceability and changes more of the existing lifecycle than required. |
| Reopen every closed umbrella after publication | Treat closure as harmless and repair it unconditionally. | Can reopen intentionally closed or unrelated issues and conceals an unsafe PR relationship. |
| Put closing checks directly in prompt prose only | Run ad hoc `gh` commands inside `write-spec`. | Timeline pagination, exact closer attribution, and stable failure diagnostics would drift and be hard to exercise. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #161 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

- [x] Root cause is identified with specific code references and live GitHub evidence
- [x] The fix removes the linked publication head while retaining the sealing branch and exact-tree proof
- [x] Pre-merge closing references and post-merge issue timeline state are both defined
- [x] Recovery is exact, approval-gated, revalidated, and cannot reopen unrelated closures
- [x] Ordinary delivery closure and all issue #157/#159/#160 invariants remain intact
- [x] Skill-bundled edits are routed through `$skill-creator`
- [x] Live exercise mutation is explicit and isolated to a disposable repository
