# Tasks: Scope Cumulative Feature Specs to the Active Issue

**Issue**: #162
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## T001: Add the Deterministic Issue-Scope Contract and Resolver

**Files**: `scripts/issue-spec-scope.mjs`, `references/issue-spec-scope.md`, `skills/write-spec/templates/issue-scope.json`, `skills/write-spec/templates/feature.gherkin`
**Type**: Create / Modify (route skill/reference/template edits through `$skill-creator`)
**Depends on**: None
**Acceptance**:

- [x] Implement a zero-dependency read-only CLI and pure resolver for `--project`, normalized `--spec`, positive `--issue`, and required `--json` inputs.
- [x] Extract contributor issue numbers, AC/FR/task IDs, and unique stable Gherkin scenario tags from bounded canonical spec files without executing spec content.
- [x] Strictly validate schema version, issue entries, complete single ownership, adoption, regression, duplicates, unknown elements, contributor identity, and unexpected/malformed values.
- [x] Return stable `scoped`, `implicit_single_issue`, `repair_required`, and `unverifiable` results with normalized delivery/regression slices, reason codes, inventory, ownership, and exact gaps.
- [x] Preserve whole-spec fallback only for one unambiguous feature contributor or a singular defect issue; never infer a cumulative mapping.
- [x] Define the complete shared contract and provide creation templates with stable `@SCN...` tags.

## T002: Scope Every Lifecycle Consumer to the Active Issue

**Files**: `skills/write-spec/SKILL.md`, `skills/write-spec/references/amendment-mode.md`, `skills/write-spec/references/review-gates.md`, `skills/write-code/SKILL.md`, `skills/write-code/references/plan-mode.md`, `skills/write-code/references/resumption.md`, `skills/verify-code/SKILL.md`, `skills/verify-code/references/report-format.md`, `skills/open-pr/SKILL.md`, `skills/open-pr/references/pr-body.md`, `skills/status/SKILL.md`, `scripts/sdlc-status.mjs`
**Type**: Modify (route every skill/reference edit through `$skill-creator`)
**Depends on**: T001
**Acceptance**:

- [x] `write-spec` creates a complete manifest for new feature specs and appends an approved owned/adopted/regression entry during amendments without rewriting prior ownership.
- [x] `write-code` resolves scope before planning, executes only owned-plus-adopted delivery tasks, and reports mapped AC/FR/scenario context.
- [x] Resumption computes completed/incomplete work only inside the active mapped task set, including an adopted existing task, and ignores earlier or future tasks.
- [x] `verify-code` checks current delivery separately from explicit prior regression obligations and persists the exact normalized scope in its report and issue comment.
- [x] `status` exposes the same result in JSON/text and routes ambiguous cumulative specs to write-spec repair rather than a later lifecycle stage.
- [x] `open-pr` requires a valid scope for specs-found delivery and builds summary, acceptance, testing, manifest links, and active issue closure from only the mapped slice.

## T003: Add Cumulative Isolation Fixtures and Regression Coverage

**Files**: `scripts/__fixtures__/cumulative-issue-scope/`, `scripts/__tests__/issue-spec-scope.test.mjs`, `scripts/__tests__/issue-scope-contract.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `specs/162-scope-cumulative-feature-specs-to-the-active-issue/feature.gherkin`
**Type**: Create / Modify
**Depends on**: T002
**Acceptance**:

- [x] Add one committed cumulative fixture containing an earlier completed slice, active owned elements, an active adopted task/contract, declared prior regression elements, and future elements.
- [x] Prove valid active isolation, stable ordering, single-issue feature/defect fallback, missing-manifest repair, incomplete ownership repair, unknown IDs, duplicate owners, adoption conflicts, malformed JSON, and invalid CLI inputs.
- [x] Contract-test every affected skill/reference so all consumers invoke the resolver and use delivery/regression fields for their exact responsibility.
- [x] Exercise status with the same fixture and prove another issue's evidence cannot advance the active issue.
- [x] Map all eight #162 acceptance criteria to exactly one `@regression` Gherkin scenario.
- [x] Keep normal tests network-independent and leave production repositories untouched.

## T004: Document and Verify the Complete Defect Fix

**Files**: `README.md`, `CHANGELOG.md`, `VERSION`, `.codex-plugin/plugin.json`, `scripts/skill-inventory.baseline.json`, `specs/162-scope-cumulative-feature-specs-to-the-active-issue/verification-report.md`, all affected implementation/test/spec paths
**Type**: Modify / Verify
**Depends on**: T003
**Acceptance**:

- [x] README documents `issue-scope.json`, owned/adopted delivery, explicit regression evidence, single-issue compatibility, and cumulative repair behavior.
- [x] CHANGELOG records issue #162 under `[Unreleased]`; release artifacts are changed only by `$nmg-sdlc:open-pr` using the accepted patch bump.
- [x] `$skill-creator` validation passes for every changed skill bundle and shared-reference consumer.
- [x] Focused scope/consumer/status tests and the complete Jest suite pass with intentional skips identified.
- [x] Skill inventory, Codex compatibility, active plugin surface, prompt quality, syntax, JSON parsing, and `git diff --check` all pass.
- [x] Verification maps all eight ACs and four tasks to concrete implementation and automated evidence and records any unavailable live exercise distinctly.
- [x] The final diff contains no unrelated spec splitting, PathCast implementation, historical report rewrite, guessed legacy ownership, direct default-branch push, or weakened gate.

---

## Dependency Graph

```text
T001 -> T002 -> T003 -> T004
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #162 | 2026-08-14 | Initial defect task plan |

---

## Completion Checklist

- [x] T001 complete
- [x] T002 complete
- [x] T003 complete
- [x] T004 complete

---

## Validation Checklist

- [x] Tasks follow the defect contract -> consumers -> regression -> verification sequence
- [x] Each task has explicit files and verifiable acceptance criteria
- [x] One resolver precedes every consumer integration
- [x] Fixture coverage proves active, adopted, regression, earlier, and future isolation
- [x] Skill/reference/template edits are routed through `$skill-creator`
- [x] Dependencies are linear and acyclic
