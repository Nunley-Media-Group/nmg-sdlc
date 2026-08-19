# Tasks: Fix Sealed Umbrella Specs Stranded Outside the Default Branch

**Issue**: #157
**Date**: 2026-08-13
**Status**: Approved
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Establish canonical umbrella-spec status evidence | [x] |
| T002 | Publish sealed specs through a spec-only pull request | [x] |
| T003 | Enforce canonical readiness at child entry points | [x] |
| T004 | Audit and recover affected initialized projects | [x] |
| T005 | Add forward and recovery regression coverage | [x] |
| T006 | Document and verify the correction | [x] |

---

### T001: Establish Canonical Umbrella-Spec Status Evidence

**File(s)**: `scripts/umbrella-spec-status.mjs`, `references/canonical-umbrella-spec.md`
**Type**: Create
**Depends**: None
**Acceptance**:
- [x] Use `$skill-creator` for the new shared reference and every other skill-bundled edit required by this task chain.
- [x] The zero-dependency helper accepts only a resolved project root, positive issue number or normalized path below `specs/`, optional exact source commit-ish, and JSON output mode.
- [x] The helper discovers and refreshes the exact remote default branch before classifying state; a discovery, fetch, Git-read, or required metadata failure returns `unverifiable` and never falls back to stale proof.
- [x] Parent-readiness mode resolves a unique feature spec on the refreshed default branch by strict `**Issues**` or supported legacy `**Issue**` frontmatter.
- [x] Publication mode compares the full Git tree identity for the exact committed source spec directory with the same path on the refreshed default branch.
- [x] Audit mode scans only bounded local heads and `origin/*` refs, filters to multi-PR-triggered specs, and deduplicates candidate content by full tree object ID.
- [x] Stable JSON distinguishes `canonical`, `canonical_marker_lost`, `stranded_recoverable`, `divergent`, `ambiguous`, and `unverifiable`, with default branch, spec path, tree IDs, refs, and reason codes.
- [x] The shared contract defines acceptable consumer behavior, the pull-request provenance marker, exact-path invariants, and fail-closed diagnostics.
- [x] The helper performs no checkout, index/worktree write, branch/ref write, commit, push, pull-request mutation, or issue mutation.

**Notes**: Keep Git and GitHub arguments as array elements, validate path containment before reading, and reserve exact source/default tree equality for publication mode so legitimate child amendments do not look divergent.

### T002: Publish Sealed Specs Through a Spec-Only Pull Request

**File(s)**: `skills/write-spec/SKILL.md`, `skills/write-spec/references/umbrella-mode.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] The existing exact multi-PR trigger remains unchanged, and single-PR specifications bypass the publication flow.
- [x] Sealing stages only `specs/{feature-name}/`, preserves unrelated dirty paths, and verifies the seal commit contains no `VERSION`, `CHANGELOG.md`, manifest, marketplace, or unrelated file.
- [x] The seal commit retains the exact `docs: seal umbrella spec for #N` subject as historical supporting evidence but is no longer authoritative by itself.
- [x] The skill pushes only the current sealing branch and creates or reuses a pull request targeting the detected default branch with no version bump.
- [x] The pull-request body includes the exact validated umbrella issue, spec path, and full source tree identity marker and references rather than closes the umbrella issue.
- [x] An open exact-marker pull request is reused, a closed-unmerged match stops with an actionable message, and a merged match is followed by a fresh fetch and content reclassification.
- [x] Child-issue creation and `$nmg-sdlc:start-issue` guidance occur only after refreshed remote state is `canonical` or `canonical_marker_lost` for the expected source tree.
- [x] A pending, divergent, ambiguous, or unverifiable state stops without duplicate publication or child transition.

**Notes**: Do not route this no-version-bump umbrella publication through `$nmg-sdlc:open-pr`; it remains the sealing branch of `$nmg-sdlc:write-spec` and preserves normal user merge authority.

### T003: Enforce Canonical Readiness at Child Entry Points

**File(s)**: `references/epic-relationships.md`, `skills/start-issue/SKILL.md`, `skills/write-spec/references/discovery.md`, `skills/write-code/SKILL.md`, `skills/open-pr/references/version-bump.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [x] Supported body and native GitHub relationship signals are normalized through the shared epic-relationship contract; no consumer requests unsupported `parent` data through `gh issue view --json`.
- [x] `$nmg-sdlc:start-issue` runs the canonical-parent check after the user confirms a selected child and before stale-branch reconciliation, dirty-tree handling, branch creation, or project-status mutation.
- [x] `$nmg-sdlc:write-spec` proves the parent path on the refreshed default branch before entering amendment mode or writing child spec content.
- [x] `$nmg-sdlc:write-code` proves the parent baseline on the refreshed default branch before implementation planning, delegation, or file edits.
- [x] `canonical` and `canonical_marker_lost` proceed; missing, divergent, ambiguous, or unverifiable parent state stops with exact parent, path/ref evidence when available, and a publication or recovery next step.
- [x] Parent-readiness checks require the canonical baseline path but permit the active child branch to contain approved child-scoped amendments.
- [x] Existing execution-dependency blocking, epic membership, cycle detection, keyword fallback for issues with no parent identity, and single-PR behavior remain unchanged.

**Notes**: This task adds preconditions only. It does not create, merge, delete, or rewrite GitHub relationships, branches, specifications, or pull requests on failure.

### T004: Audit and Recover Affected Initialized Projects

**File(s)**: `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/sealed-spec-recovery.md`, `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Create / Modify
**Depends**: T003
**Acceptance**:
- [x] Upgrade adds a separate sealed-spec findings category without broadening existing template, managed-asset, release-document, or v2 cleanup ownership.
- [x] Findings render each exact spec path and available Git evidence as canonical, canonical with history marker lost, stranded but unambiguously recoverable, divergent from a same-path default-branch spec, ambiguous/unrecoverable, or unverifiable.
- [x] Each recoverable finding receives exact-path approval; silence, a declined category, or approval for another finding does not authorize recovery.
- [x] Apply re-fetches/reclassifies the exact finding and stops if its default path, source identity, destination state, or evidence changed after approval.
- [x] Approved recovery uses the full source object ID to restore only an absent or byte-identical `specs/{feature-name}/` worktree path and does not stage it.
- [x] Divergent default-branch content always wins and is never overwritten; ambiguous/unrecoverable or unverifiable findings remain report-only.
- [x] Recovery preserves unrelated dirty files, project-authored content, release artifacts, branches/refs, the index, and all GitHub state.
- [x] A repeated upgrade reports canonical/already prepared state and produces no additional diff or duplicate recovery.
- [x] The report directs a prepared recovered spec through the normal reviewed `$nmg-sdlc:write-spec #N` spec-only publication flow.

**Notes**: Recovery prepares local content only. It never switches, creates, or deletes branches and never commits, pushes, opens, approves, or merges a pull request.

### T005: Add Forward and Recovery Regression Coverage

**File(s)**: `scripts/__tests__/umbrella-spec-status.test.mjs`, `scripts/__tests__/canonical-umbrella-spec-contract.test.mjs`, `scripts/__tests__/exercise-write-spec-epic.test.mjs`, `scripts/__tests__/exercise-upgrade-sealed-spec.test.mjs`, `specs/157-fix-sealed-umbrella-specs-stranded-outside-the-default-branch/feature.gherkin`
**Type**: Create / Modify
**Depends**: T004
**Acceptance**:
- [x] Deterministic tests use disposable repositories with a bare origin and distinct default, sealing, and child histories.
- [x] Classifier tests cover canonical marker retained, canonical marker lost after squash-shaped history, one recoverable stranded tree, divergent default/source trees, multiple ambiguous source identities, missing/unavailable remote evidence, and already-clean repeated runs.
- [x] Contract tests prove exact staging, forbidden-path exclusion, stable PR markers, open-PR reuse, closed-unmerged stopping, merged-default recheck, and no child transition before canonical publication.
- [x] Child-gate coverage proves branch, spec, and code mutation are each blocked before their first write when the parent is absent or unverifiable and proceed when the refreshed default branch is canonical.
- [x] Upgrade coverage proves exact approval, apply-time revalidation, absent-path restoration, dirty-file preservation, default-wins divergence, ambiguity preservation, no branch deletion, and second-run idempotence.
- [x] Existing single-PR spec, parent-link cycle, managed-asset upgrade, legacy-layout migration, and explicit human-gate tests remain passing.
- [x] All seven acceptance criteria have one-to-one `@regression` Gherkin scenarios.
- [x] Tests that depend on live Codex or GitHub remain opt-in; deterministic classifier and contract tests run in the normal suite.

**Notes**: Test behavior, not prose substrings alone. Use exact Git object identities and filesystem/index assertions to prove preservation boundaries.

### T006: Document and Verify the Correction

**File(s)**: `README.md`, `CHANGELOG.md`, `scripts/skill-inventory.baseline.json`, `scripts/umbrella-spec-status.mjs`, `references/canonical-umbrella-spec.md`, `references/epic-relationships.md`, `skills/write-spec/`, `skills/start-issue/`, `skills/write-code/`, `skills/upgrade-project/`, `scripts/__tests__/`
**Type**: Modify / Verify
**Depends**: T005
**Acceptance**:
- [x] README explains spec-only publication, the manual merge prerequisite, canonical rerun/transition, child-entry blocking, marker-loss handling, and upgrade audit/recovery behavior.
- [x] CHANGELOG records issue #157 under `[Unreleased]` without applying a version bump.
- [x] Official Codex documentation is checked for any model/tool behavior described by the changed skill contracts, and unsupported controls are not documented.
- [x] `$skill-creator` validation passes for every changed skill bundle and shared reference consumer.
- [x] `cd scripts && npm test -- --runInBand` passes, including deterministic status and contract coverage.
- [x] `node scripts/skill-inventory-audit.mjs --check` passes after regenerating the baseline once final line anchors are stable.
- [x] `node scripts/codex-compatibility-check.mjs` and `node scripts/verify-plugin-surface.mjs --root . --label repository` pass.
- [x] Applicable targeted disposable exercises pass or any environment-only live gap is recorded precisely without weakening deterministic evidence.
- [x] `git diff --check` passes and the scoped diff contains no version bump, release roll, unrelated refactor, automatic merge, branch deletion, or divergent-default overwrite.

---

## Critical Path

T001 -> T002 -> T003 -> T004 -> T005 -> T006

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #157 | 2026-08-13 | Initial defect tasks |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix -- no feature work
- [x] Regression tests are included (T005)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
- [x] Dependencies form a linear, acyclic chain
