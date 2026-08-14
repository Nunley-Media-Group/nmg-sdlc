# Tasks: Prevent Spec-Only Publication from Closing Umbrella Issues

**Issue**: #161
**Date**: 2026-08-14
**Status**: Complete
**Author**: Rich Nunley

---

## T001: Add Deterministic Publication-Closing Classification

**Files**: `scripts/umbrella-publication-status.mjs`, `references/canonical-umbrella-spec.md`
**Type**: Create / Modify (route the shared reference through `$skill-creator`)
**Depends on**: None
**Acceptance**:

- [x] Validate positive issue/PR identifiers, exact repository identity, full umbrella marker, expected dedicated head ref, detected default base, and bounded GraphQL result shapes.
- [x] Read the PR's state, merge evidence, head/base refs, body marker, and `closingIssuesReferences`, then read the umbrella's state and paginated `ClosedEvent` timeline without mutating GitHub.
- [x] Return stable `pending_safe`, `merged_safe`, `closing_relationship`, `publication_closed_umbrella`, `closed_unrelated`, and `unverifiable` statuses with exact reason codes and evidence.
- [x] Attribute recovery only when the exact marked merged publication PR is the exact umbrella's timeline closer; incomplete or unrelated evidence fails closed.
- [x] Extend the shared canonical contract with deterministic unlinked publication-ref naming, collision checks, pre-merge proof, post-merge proof, and exact approval-gated reopen/revalidation behavior.
- [x] Keep the helper zero-dependency, deterministic apart from its bounded read-only `gh` queries, and free of branch, PR, issue, worktree, index, or ref mutation.

## T002: Publish the Seal Commit from an Unlinked Branch and Enforce Semantic Gates

**Files**: `skills/write-spec/SKILL.md`
**Type**: Modify (route through `$skill-creator`)
**Depends on**: T001
**Acceptance**:

- [x] Retain the issue-linked sealing branch, exact seal commit, exact source tree, default-target detection, marker matching, allowed-path check, forbidden release-path check, and no-force-push guarantees.
- [x] Derive `nmg-sdlc/spec-publication-<issue>-<tree-prefix>` from validated evidence and create it only with a plain full-commit Git push; never use `gh issue develop` for the publication ref.
- [x] Verify an existing publication ref resolves to the same full seal commit before reuse and stop on any collision or mismatch.
- [x] Create or reuse a publication PR only when its exact marker, expected base/head, head commit, and content scope match; do not reuse the issue-linked sealing branch as PR head.
- [x] Run publication classification after PR creation/reuse and report `publication_pending` only for `pending_safe`; any closing relationship or unverifiable result is a lifecycle error and does not encourage merge.
- [x] After merge, require both canonical Git tree identity and `merged_safe` issue/timeline state before child transition.
- [x] For `publication_closed_umbrella`, render exact evidence, obtain explicit approval for the exact issue reopen, re-fetch, and continue only after the issue is open and the canonical tree remains current.
- [x] Keep ordinary `$nmg-sdlc:open-pr` closing behavior and all single-PR/child-amendment paths unchanged.

## T003: Add Deterministic and Live GitHub-Semantic Regression Coverage

**Files**: `scripts/__tests__/umbrella-publication-status.test.mjs`, `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs`, `scripts/__tests__/exercise-write-spec-epic.test.mjs`, `scripts/exercise-github-umbrella-publication.mjs`, `specs/bug-prevent-spec-only-publication-from-closing-umbrella-issues/feature.gherkin`
**Type**: Create / Modify
**Depends on**: T002
**Acceptance**:

- [x] Unit tests use a stubbed `gh` executable or injectable command boundary to cover safe pending/merged, pre-merge closing reference, exact PR-caused closure, unrelated closure, pagination, invalid marker/head/base/commit, and incomplete evidence.
- [x] Contract tests assert dedicated unlinked ref creation, no issue-linked publication head, semantic pre/post checks, approval-gated exact recovery, ordinary delivery passthrough, and retained exact-scope safety.
- [x] Disposable Git fixtures prove the dedicated publication ref contains the exact seal commit/tree and does not modify or replace the linked source branch.
- [x] The opt-in live exercise requires an explicit disposable repository and acknowledgement, creates both an issue-linked control and an unlinked publication case, merges only fixture PRs, and reads actual `closingIssuesReferences`, issue state, and `ClosedEvent` timeline evidence.
- [x] The live exercise fails if the control does not demonstrate linked-branch closing semantics or if the unlinked case closes its umbrella; it emits machine-readable evidence for verification.
- [x] All seven acceptance criteria have exactly one `@regression` Gherkin scenario.
- [x] Existing #157 canonical publication, #159 verified-tree, #160 durable-identity, single-PR, and no-reseal regressions remain green.

## T004: Document and Verify the Complete Defect Fix

**Files**: `README.md`, `CHANGELOG.md`, `scripts/skill-inventory.baseline.json`, `specs/bug-prevent-spec-only-publication-from-closing-umbrella-issues/verification-report.md`, affected skill/reference/script/test paths
**Type**: Modify / Verify
**Depends on**: T003
**Acceptance**:

- [x] README explains the dedicated publication branch, pre-merge non-closing proof, post-merge umbrella-state proof, and exact recovery gate without changing ordinary delivery guidance.
- [x] CHANGELOG records issue #161 under `[Unreleased]`; release artifacts are bumped only by `$nmg-sdlc:open-pr` at delivery.
- [x] `$skill-creator` validation passes for every changed skill bundle and shared-reference consumer.
- [x] Focused classifier, publication-contract, and exercise suites pass, followed by the full Jest suite with intentional live skips identified.
- [x] Skill inventory, Codex compatibility, active plugin-surface, Git hygiene, and `git diff --check` gates pass; baseline regeneration records only intentional line-anchor changes and truthful inventory removals.
- [x] Verification maps every acceptance criterion to implementation and automated evidence and records any opt-in live environment result without weakening deterministic proof.
- [x] The scoped diff contains no unrelated refactor, ordinary delivery closure change, automatic real-user publication merge, or unauthorized issue reopen.

---

## Dependency Graph

```text
T001 -> T002 -> T003 -> T004
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #161 | 2026-08-14 | Initial defect task plan |

---

## Completion Checklist

- [x] T001 complete
- [x] T002 complete
- [x] T003 complete
- [x] T004 complete

---

## Validation Checklist

- [x] Tasks follow the defect fix -> regression -> verification sequence
- [x] Every task has explicit files and verifiable acceptance criteria
- [x] Root-cause branch isolation and semantic verification are implemented before recovery
- [x] Deterministic tests run normally and live GitHub mutation remains explicit and opt-in
- [x] Skill edits are routed through `$skill-creator`
- [x] Dependencies are linear and acyclic
