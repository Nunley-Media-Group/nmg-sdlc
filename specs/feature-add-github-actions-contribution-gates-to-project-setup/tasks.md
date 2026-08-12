# Tasks: Add GitHub Actions Contribution Gates to Project Setup

**Issues**: #125, #143
**Date**: 2026-08-12
**Status**: Amended
**Author**: Codex

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 2 | [ ] |
| Skill Contracts | 4 | [ ] |
| Documentation | 2 | [ ] |
| Testing | 4 | [ ] |
| Enhancement — Issue #143 | 7 | [ ] |
| **Total** | 19 | |

---

## Task Format

Each task follows this structure:

```markdown
### TNNN: Task Title

**File(s)**: `path/to/file`
**Type**: Create | Modify
**Depends**: TNNN or None
**Acceptance**:
- [ ] Verifiable criterion
```

Skill-bundled files include `skills/**`, shared `references/**`, and `agents/**`; edits to those files must be routed through `$skill-creator` per `steering/tech.md`.

---

## Phase 1: Setup

### T001: Define the shared contribution-gate contract

**File(s)**: `references/contribution-gate.md`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Defines approved workflow path `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- [ ] Defines managed marker `nmg-sdlc-managed: contribution-gate` and numeric managed version.
- [ ] Provides the workflow template or exact workflow-generation contract.
- [ ] Defines pass/fail evidence categories for issue linkage, spec linkage, steering context, verification evidence, and guide discoverability.
- [ ] Defines minimal permissions, no default secrets, no `pull_request_target`, and no untrusted PR-content execution.
- [ ] Defines idempotency, outdated managed-version update behavior, future-version skip behavior, unmanaged path-collision behavior, and the stable status block.

### T002: Add inventory coverage for the shared reference

**File(s)**: `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Inventory audit baseline includes any new tracked clauses from `references/contribution-gate.md`.
- [ ] Baseline changes are limited to intentional contribution-gate additions.
- [ ] PR body requirements for inventory removals remain satisfied if the baseline changes.

---

## Phase 2: Skill Contracts

### T003: Wire init-config to install the managed contribution gate

**File(s)**: `skills/init-config/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] The skill reads `../../references/contribution-gate.md` with compliant pointer wording.
- [ ] Setup creates `.github/workflows/` when needed and writes the managed workflow when the approved path is absent.
- [ ] Existing nmg-sdlc-managed workflow content is left alone when current and updated only when its managed version is outdated.
- [ ] Unmanaged path collisions are reported as gaps without overwriting the file.
- [ ] Completion output includes the stable Contribution Gate status block.

### T004: Teach upgrade-project to analyze contribution-gate drift

**File(s)**: `skills/upgrade-project/SKILL.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `What Gets Analyzed` includes `.github/workflows/nmg-sdlc-contribution-gate.yml` as a managed non-destructive workflow.
- [ ] A contribution-gate analysis step records missing workflow, outdated managed workflow, current managed workflow, future managed workflow, and unmanaged path collision states.
- [ ] Missing/outdated managed workflows are classified as non-destructive managed-artifact findings.
- [ ] Unattended mode auto-applies missing/outdated managed workflow updates and records collision gaps without prompting.
- [ ] Key rules still prohibit unrelated file synthesis and unmanaged workflow overwrite.

### T005: Apply contribution-gate findings in upgrade-project

**File(s)**: `skills/upgrade-project/references/upgrade-procedures.md`
**Type**: Modify
**Depends**: T004
**Acceptance**:
- [ ] Apply procedures create parent directories when needed.
- [ ] Missing managed workflow creation and outdated managed workflow replacement use the shared contribution-gate contract.
- [ ] Unrelated workflows under `.github/workflows/` are preserved byte-for-byte.
- [ ] Unmanaged path collision is reported as skipped with manual remediation.
- [ ] Step 9 summary includes the stable Contribution Gate status block.

### T006: Expand the contribution-guide north-star content

**File(s)**: `references/contribution-guide.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Generated guide content includes a concrete PR readiness checklist.
- [ ] Checklist covers issue quality, spec location/frontmatter, steering alignment, implementation scope, verification evidence, and review readiness.
- [ ] Guide explains the generated contribution gate and how to remediate its common failures.
- [ ] Existing guide preservation and README-link idempotency rules remain intact.
- [ ] The content is useful to contributors who do not have nmg-sdlc installed locally.

---

## Phase 3: Documentation

### T007: Update public README setup, upgrade, and skill documentation

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T003, T004, T006
**Acceptance**:
- [ ] First-Time Setup documents that `init-config` installs the managed GitHub Actions contribution gate.
- [ ] Upgrade documentation explains missing/outdated gate reconciliation and unmanaged path-collision preservation.
- [ ] Skills reference table reflects contribution-gate setup behavior.
- [ ] Documentation states the default gate is stack-agnostic, uses minimal permissions, and does not replace project CI or human review.

### T008: Add changelog entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T003, T004, T006
**Acceptance**:
- [ ] `[Unreleased]` includes a concise entry for issue #125.
- [ ] Entry mentions managed GitHub Actions contribution-gate setup, upgrade reconciliation, and richer contribution guidance.
- [ ] Entry follows existing changelog style.

---

## Phase 4: Testing

### T009: Add static contribution-gate contract tests

**File(s)**: `scripts/__tests__/contribution-gate-contract.test.mjs`
**Type**: Create
**Depends**: T001, T003, T004, T005, T006, T007
**Acceptance**:
- [ ] Tests assert the shared reference defines the approved path, managed marker, managed version, status block, and collision rules.
- [ ] Tests assert the workflow template uses minimal permissions, no default secrets, no `pull_request_target`, and no untrusted PR-content execution.
- [ ] Tests assert `init-config` and `upgrade-project` reference the shared contribution-gate contract.
- [ ] Tests assert README describes generated gate behavior.

### T010: Add fixture exercise coverage for init and upgrade installation

**File(s)**: `scripts/__tests__/exercise-contribution-gate.test.mjs`
**Type**: Create
**Depends**: T003, T004, T005
**Acceptance**:
- [ ] Disposable-project or fixture exercise confirms missing workflow creation.
- [ ] Exercise confirms current managed workflow rerun is idempotent.
- [ ] Exercise confirms outdated managed workflow is updated.
- [ ] Exercise confirms unrelated workflows are preserved.
- [ ] Exercise confirms unmanaged file at the approved path is not overwritten and records a gap.

### T011: Add non-compliant PR gate-output coverage

**File(s)**: `scripts/__tests__/exercise-contribution-gate.test.mjs`
**Type**: Modify
**Depends**: T001, T009
**Acceptance**:
- [ ] Compliant PR metadata/spec fixture passes the gate evaluation.
- [ ] Missing issue linkage fails with an actionable issue-evidence message.
- [ ] Missing spec linkage fails with an actionable spec-evidence message.
- [ ] Missing verification evidence fails with an actionable verification-evidence message.
- [ ] Failure output points to `CONTRIBUTING.md` or specific nmg-sdlc artifact paths.

### T012: Run inventory, compatibility, unit, and whitespace validation

**File(s)**: `scripts/skill-inventory.baseline.json`, `scripts/__tests__/contribution-gate-contract.test.mjs`, `scripts/__tests__/exercise-contribution-gate.test.mjs`
**Type**: Modify
**Depends**: T002, T009, T010, T011
**Acceptance**:
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes.
- [ ] `npm --prefix scripts test -- --runInBand` passes or any unrelated failure is documented.
- [ ] `npm --prefix scripts run compat` passes.
- [ ] `git diff --check` passes.
- [ ] Verification evidence maps every acceptance criterion to implementation or test evidence.

---

## Phase 5: Enhancement — Issue #143

### T013: Define the version-2 evidence consistency graph

**File(s)**: `references/contribution-gate.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Route the shared-reference edit through `$skill-creator` as required by `steering/tech.md`.
- [ ] Advance the managed workflow metadata and numeric contract from version 1 to version 2.
- [ ] Correlate current pull-request issue references with issue references read from bounded, deduplicated spec directories.
- [ ] Classify relevant implementation paths separately from evidence-only, documentation-only, and ADR/spec paths.
- [ ] Require each relevant path to map through an exact normalized path, explicit containing-directory prefix, or path-specific behavior evidence.
- [ ] Accept verification only from commands paired with outcomes, non-empty reports, acceptance-criterion results, or changed-path-specific results.
- [ ] Validate docs-only and spike/ADR reduced-evidence paths against rationale, issue metadata, and the complete changed-path set while retaining all non-exempt checks.
- [ ] Treat pull-request content and repository files as inert text, bound API reads, and emit concise category-specific diagnostics.

### T014: Synchronize the dogfooded managed workflow

**File(s)**: `.github/workflows/nmg-sdlc-contribution-gate.yml`
**Type**: Modify
**Depends**: T013
**Acceptance**:
- [ ] The repository workflow contains managed version 2.
- [ ] The workflow is byte-for-byte identical to the canonical YAML template embedded in `references/contribution-gate.md`.
- [ ] Existing minimal permissions, `pull_request` event safety, no-secret default, and no-untrusted-code-execution invariants remain intact.
- [ ] No unrelated workflow is modified.

### T015: Document structured evidence and validated exceptions

**File(s)**: `references/contribution-guide.md`
**Type**: Modify
**Depends**: T013
**Acceptance**:
- [ ] Route the shared-reference edit through `$skill-creator` as required by `steering/tech.md`.
- [ ] Explain how the pull-request issue must match the selected spec's issue frontmatter or body.
- [ ] Show accepted exact-path, directory-prefix, and path-specific behavior evidence.
- [ ] Show accepted verification commands with outcomes, report artifacts, acceptance-criterion results, and changed-path-specific results.
- [ ] Document `SDLC-Exception: docs-only — <reason>` and spike/ADR predicates, reduced checks, invalidating paths, and remediation.
- [ ] Preserve existing contribution-guide ownership, merge, and README-link idempotency rules.

### T016: Extend static contract and distribution checks

**File(s)**: `scripts/__tests__/contribution-gate-contract.test.mjs`
**Type**: Modify
**Depends**: T013, T014, T015
**Acceptance**:
- [ ] Assert managed version 2, issue/spec correlation, relevant-path mapping, specific-verification signals, and exception predicates.
- [ ] Assert spec reads are bounded and deduplicated and all external text remains data rather than executable code.
- [ ] Assert the dogfooded workflow exactly matches the canonical embedded template.
- [ ] Assert existing `init-config` and `upgrade-project` pointers still distribute and reconcile the versioned shared contract.
- [ ] Preserve static security, portability, lifecycle-status, and unmanaged-collision assertions.

### T017: Exercise the exact embedded evaluator with mocked GitHub fixtures

**File(s)**: `scripts/__tests__/exercise-contribution-gate.test.mjs`
**Type**: Modify
**Depends**: T013, T014
**Acceptance**:
- [ ] Execute the evaluator extracted from the canonical workflow template with mocked `github`, `context`, and `core` interfaces instead of maintaining a separate regex-only evaluator.
- [ ] Cover matching and mismatched pull-request/spec issue sets, multiple spec directories, bounded reads, and quoted historical issue text.
- [ ] Cover exact path, directory-prefix, and path-specific behavior mappings plus similarly named and unmatched paths.
- [ ] Cover command-plus-outcome, non-empty report, acceptance-criterion result, and changed-path-specific verification passes plus generic-keyword failures.
- [ ] Cover valid docs-only and spike/ADR reduced-evidence paths plus invalid rationale, issue-label, and source-change combinations.
- [ ] Assert every failure names the broken evidence edge and points to actionable remediation.

### T018: Update public documentation and release history

**File(s)**: `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T013, T015
**Acceptance**:
- [ ] README states that the managed gate cross-checks issue/spec identity, changed-path coverage, and specific verification evidence.
- [ ] README documents the validated documentation-only and spike/ADR reduced-evidence paths without presenting them as unconditional bypasses.
- [ ] `[Unreleased]` includes a concise issue #143 entry describing version-2 evidence consistency validation.
- [ ] Public documentation still states that the gate is stack-agnostic and does not replace project CI or human review.

### T019: Refresh inventory when required and verify the amendment

**File(s)**: `scripts/skill-inventory.baseline.json`, `scripts/__tests__/contribution-gate-contract.test.mjs`, `scripts/__tests__/exercise-contribution-gate.test.mjs`
**Type**: Modify
**Depends**: T016, T017, T018
**Acceptance**:
- [ ] Refresh `scripts/skill-inventory.baseline.json` only when the audit reports intentional shared-reference inventory changes.
- [ ] `node scripts/skill-inventory-audit.mjs --check` passes.
- [ ] `npm --prefix scripts test -- --runInBand` passes or unrelated failures are documented.
- [ ] `npm --prefix scripts run compat` passes.
- [ ] `git diff --check` passes.
- [ ] Verification evidence maps AC9 through AC12 to exact-template static or fixture coverage and confirms AC1 through AC8 remain protected.

---

## Dependency Graph

```text
T001 --> T002
T001 --> T003
T001 --> T004 --> T005
T001 --> T006
T003 --> T007
T004 --> T007
T006 --> T007 --> T008
T003 --> T010
T004 --> T010
T005 --> T010
T001 --> T009 --> T011 --> T012
T010 --> T012
T013 --> T014
T013 --> T015
T013 --> T016
T014 --> T016
T015 --> T016
T013 --> T017
T014 --> T017
T013 --> T018
T015 --> T018
T016 --> T019
T017 --> T019
T018 --> T019
```

Historical critical path: T001 -> T004 -> T005 -> T010 -> T012.

Issue #143 critical path: T013 -> T015 -> T016 -> T019.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #125 | 2026-04-27 | Initial feature spec |
| #143 | 2026-08-12 | Added version-2 evidence consistency implementation plan |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] All tasks map to actual project paths
- [x] Dependencies are identified
- [x] Each acceptance criterion has a corresponding Gherkin scenario
- [x] Testing tasks include BDD/exercise coverage
- [x] Documentation tasks cover public behavior changes
- [x] Skill-bundled file edits are flagged for `$skill-creator` routing
