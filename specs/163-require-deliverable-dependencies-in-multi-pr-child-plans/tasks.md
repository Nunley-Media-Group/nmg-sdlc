# Tasks: Require Deliverable Dependencies in Multi-PR Child Plans

**Issue**: #163
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## T001: Add the Shared Deliverable-Dependency Contract and Classifier

**Files**: `scripts/deliverable-dependencies.mjs`, `references/deliverable-dependencies.md`
**Type**: Create (route the shared-reference edit through `$skill-creator`)
**Depends on**: None
**Acceptance**:

- [x] Parse bounded, line-anchored `- Requires deliverable from #N: description` records without executing or interpolating issue content.
- [x] Compare each record with normalized whole-issue execution dependencies and reject coordination-only, missing, conflicting, self, or unknown targets.
- [x] Classify `none`, `ready`, `blocked`, `repair_required`, and `unverifiable` with stable reason codes and exact gaps.
- [x] Require a merged closing pull request targeting the live default branch with a merge commit before a deliverable is available; issue closure alone never passes.
- [x] Bound issue counts, connection pages, body/description sizes, and malformed external data fail-closed.
- [x] Document new-plan authoring, stage-specific consumption, legacy audit candidates, and repair invariants once in the shared reference.

## T002: Enforce Deliverable Boundaries Across Planning and Readiness

**Files**: `skills/draft-issue/references/multi-issue.md`, `skills/write-spec/SKILL.md`, `skills/write-spec/references/umbrella-mode.md`, `skills/start-issue/SKILL.md`, `skills/status/SKILL.md`, `scripts/sdlc-status.mjs`
**Type**: Modify (route every skill/reference edit through `$skill-creator`)
**Depends on**: T001
**Acceptance**:

- [x] Multi-issue and umbrella planning inventory sibling-owned tasks/artifacts before graph approval and reject prose-only midpoint checkpoints.
- [x] The recommended repair adds a whole-issue dependency; separately reviewed baseline extraction remains available when independent parallel delivery is required.
- [x] Created child bodies contain one structured prerequisite record and matching `Depends on:` edge per approved cross-child deliverable, with task ownership and Delivery Phases kept consistent.
- [x] `start-issue` hydrates every declared owner and its fully paged closing-PR evidence, excludes blocked/repair/unverifiable children, and stops an explicit start before branch or project mutation.
- [x] `status` exposes the same normalized result in `issue.deliverableDependencies`, reports blocked and repair states without advancing the lifecycle, and preserves ordinary no-requirement behavior.
- [x] Epic membership remains coordination-only and existing genuine execution dependencies retain their current directionality.

## T003: Add Approval-Gated Existing-Plan Audit and Repair

**Files**: `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/deliverable-dependency-recovery.md`
**Type**: Create / Modify (route every skill/reference edit through `$skill-creator`)
**Depends on**: T002
**Acceptance**:

- [x] Audit bounded canonical umbrella specs and native-authoritative children for structured records, task ownership, DAG edges, and bounded legacy checkpoint candidates.
- [x] Report every unrepresentable checkpoint with owner, downstream child, task/artifact evidence, current edge state, and both supported remedies.
- [x] Offer only one exact manual whole-issue body/graph repair handoff; route baseline extraction to a separately reviewed issue/spec change.
- [x] Re-fetch canonical ownership/spec digest, exact issue bodies/digests, labels/states, native relationships, default branch, and closing-PR/merge evidence immediately before rendering the handoff and abort it on any drift.
- [x] Never execute an unconditional full-body overwrite without a documented server-enforced compare-and-set; render exact line edits, preserve unrelated prose/metadata, re-fetch/classify after operator confirmation, and prove the second audit is a no-op.
- [x] Partial or unverifiable graphs remain report-only and never produce a clean audit result or manual edit proposal.

## T004: Add Regression, Exercise, Documentation, and Delivery Evidence

**Files**: `scripts/__tests__/deliverable-dependencies.test.mjs`, `scripts/__tests__/deliverable-dependency-contract.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__fixtures__/deliverable-dependencies/`, `scripts/__fixtures__/skill-exercise/status/`, `scripts/skill-exercise-runner.mjs`, `README.md`, `CHANGELOG.md`, `scripts/skill-inventory.baseline.json`, `specs/163-require-deliverable-dependencies-in-multi-pr-child-plans/verification-report.md`
**Type**: Create / Modify / Verify
**Depends on**: T003
**Acceptance**:

- [x] Cover valid ready, owner open, missing edge, coordination-only edge, manually closed owner, wrong-base closer, missing merge commit, incomplete pagination, cross-repository records, case-distinct descriptions, complete early-error schemas, failed active-issue hydration, legacy audit without pre-repair gating, approved manual repair, drift, and second-run no-op states.
- [x] Exercise independent child branches from a refreshed default branch and prove every reported-ready child can read its prerequisite from a merged deliverable.
- [x] Contract-test draft, write-spec, start, status, and upgrade consumers against the same exact body/result contract.
- [x] Map all seven #163 acceptance criteria to exactly one stable `@SCN...` regression scenario and record verification evidence by task and criterion.
- [x] Update README and `[Unreleased]` changelog behavior; leave release version artifacts to `$nmg-sdlc:open-pr`.
- [x] Run affected `$skill-creator` validation, focused tests, full Jest, inventory, Codex compatibility, plugin surface, prompt quality, syntax/JSON checks, and `git diff --check`.
- [x] Keep PathCast untouched and preserve unrelated issues, specs, branches, GitHub metadata, and historical reports.

---

## Dependency Graph

```text
T001 -> T002 -> T003 -> T004
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #163 | 2026-08-14 | Initial defect task plan |

---

## Completion Checklist

- [x] T001 complete
- [x] T002 complete
- [x] T003 complete
- [x] T004 complete

---

## Validation Checklist

- [x] Tasks follow classifier -> consumers -> recovery -> verification order
- [x] Every task has explicit files and verifiable acceptance criteria
- [x] One shared result contract precedes every lifecycle integration
- [x] Planning prevention and existing-plan repair are independently covered
- [x] Merged default-branch evidence is exercised separately from issue closure
- [x] Skill/reference edits are routed through `$skill-creator`
- [x] Dependencies are linear and acyclic
