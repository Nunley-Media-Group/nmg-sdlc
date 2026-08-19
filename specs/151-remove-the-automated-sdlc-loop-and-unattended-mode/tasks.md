# Tasks: Remove the Automated SDLC Loop and Unattended Mode

**Issue**: #151
**Date**: 2026-08-13
**Status**: Approved
**Author**: Rich Nunley

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Surface Removal | 3 (T001–T003) | [x] |
| Manual Pipeline | 3 (T004–T006) | [x] |
| Project Migration | 2 (T007–T008) | [x] |
| Integration | 3 (T009–T011) | [x] |
| Testing & Release | 4 (T012–T015) | 3/4 — T015 pending publication |
| **Total** | **15** | **14/15 complete** |

---

## Task Format

Each task lists actual repository paths, explicit dependencies, and verifiable acceptance conditions. Skill-bundled changes under `skills/`, root `references/`, and `agents/` must be performed through `$skill-creator` per `steering/tech.md`.

---

## Phase 1: Surface Removal

### T001: Add V2 Automation-Removal Rules to the Plugin-Surface Validator

**File(s)**: `scripts/verify-plugin-surface.mjs`, `scripts/__tests__/plugin-surface-verification.test.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] Validator rules reject exact `run-loop`, `end-loop`, and `init-config` skill directories; runner/config runtime files; automation command frontmatter; aliases/redirects; compatibility/deprecation stubs; loader-facing command tokens; sentinel/state/config paths; and removed inventory destinations.
- [x] Active scan roots and file categories are declared explicitly and deterministically.
- [x] `specs/`, released changelog entries, and bounded negative-test fixtures are outside active-capability findings.
- [x] Existing `commit-push` hard-removal rules and exit-code behavior remain intact.
- [x] Fixture tests prove violations for source, fresh-install, and upgraded-root labels and prove that inactive historical siblings do not fail the selected active root.
- [x] Unsafe manifest paths, symlinks, malformed inputs, and missing `open-pr` still fail closed.

**Notes**: This task may make the live repository fixture fail until T002 removes the currently active automation paths. Do not weaken the rule set to keep the intermediate tree green.

### T002: Delete Direct Automation Skills, Runtime Assets, and Runner-Only Tests

**File(s)**:
- `skills/run-loop/SKILL.md`
- `skills/end-loop/SKILL.md`
- `skills/init-config/SKILL.md`
- `references/unattended-mode.md`
- `scripts/sdlc-runner.mjs`
- `scripts/sdlc-config.example.json`
- `scripts/__tests__/sdlc-runner.test.mjs`
- `scripts/__tests__/runner-config-contract.test.mjs`
- `scripts/__tests__/select-next-issue-from-milestone.test.mjs`

**Type**: Delete
**Depends**: T001
**Acceptance**:
- [x] Every listed path is absent from the source tree.
- [x] `.codex-plugin/plugin.json` still resolves the surviving manifest-declared skills directory and discovers `open-pr`.
- [x] No alias, redirect, deprecated skill, or compatibility stub replaces a deleted command.
- [x] Runner-only tests are removed without deleting shared manual issue-selection or epic-relationship coverage.
- [x] The repository surface advances from expected T001 violations to no direct removed-path violations.

**Notes**: Preserve historical specs and released changelog entries that document these deleted capabilities.

### T003: Collapse Shared Plugin Contracts to Interactive-Only Semantics

**File(s)**:
- `references/codex-tooling.md`
- `references/interactive-gates.md`
- `references/prompt-config.md`
- `references/legacy-layout-gate.md`
- `references/spec-context.md`
- `references/dirty-tree.md`
- `references/versioning.md`
- `references/project-agents.md`
- `references/contribution-gate.md`
- `references/issue-form.md`

**Type**: Modify
**Depends**: T002
**Acceptance**:
- [x] Shared gate guidance has one interactive path and no sentinel bypass, automatic approval, deterministic unattended default, runner escalation branch, or orchestrator handoff.
- [x] Prompt-config preflight remains required before each interactive `request_user_input` gate.
- [x] Legacy layout behavior still protects root-level `steering/` and `specs/`; `.codex/upgrade-exclusions.json` remains a valid runtime-owned upgrade artifact.
- [x] Dirty-tree rules stop silently filtering removed runner artifacts.
- [x] Spec-context ambiguity uses its documented interactive gate and never selects a headless default.
- [x] Versioning guidance assigns delivery responsibility only to the manual `open-pr` workflow.
- [x] Contribution-gate and issue-form contracts name onboarding and upgrade as their owners.
- [x] All edits are routed through `$skill-creator` and pass its validation.

---

## Phase 2: Manual Pipeline

### T004: Convert Surviving Phase Skills and Agent Contracts to Interactive-Only Execution

**File(s)**:
- `skills/write-spec/SKILL.md`, `skills/write-spec/references/*.md`
- `skills/write-code/SKILL.md`, `skills/write-code/references/*.md`
- `skills/verify-code/SKILL.md`, `skills/verify-code/references/*.md`
- `skills/open-pr/SKILL.md`, `skills/open-pr/references/*.md`
- `skills/run-retro/SKILL.md`, `skills/run-retro/references/*.md`
- `skills/address-pr-comments/SKILL.md`, `skills/address-pr-comments/references/*.md`
- `agents/spec-implementer.md`, `agents/spike-researcher.md`

**Type**: Modify
**Depends**: T003
**Acceptance**:
- [x] Every human review, clarification, selection, and plan decision waits for explicit user input through the current interactive-gate contract.
- [x] Completion output recommends the owning next manual command instead of `Done. Awaiting orchestrator.` or an equivalent handoff sentinel.
- [x] Error paths remain actionable for an interactive developer without runner retry, bounce, or escalation semantics.
- [x] `write-spec` retains all three human review gates, the gap interview, spike research decision, and umbrella seal decisions as interactive flows.
- [x] `write-code` retains decision-complete planning and `$skill-creator` routing without a headless execution branch.
- [x] `open-pr` retains manual delivery, versioning, and CI behavior without runner-state filtering or headless major-bump logic.
- [x] Agent contracts remain bounded and structured but contain no runner-only instructions.
- [x] All skill-bundled edits are routed through `$skill-creator` and pass its validation.

### T005: Remove Automation Eligibility from Drafting and Selection

**File(s)**:
- `skills/draft-issue/SKILL.md`, `skills/draft-issue/references/*.md`
- `skills/start-issue/SKILL.md`, `skills/start-issue/references/*.md`
- `scripts/__tests__/exercise-draft-issue-epic.test.mjs`
- `scripts/__tests__/exercise-start-issue-epic.test.mjs`
- `scripts/__tests__/epic-relationship-contract.test.mjs`

**Type**: Modify
**Depends**: T003
**Acceptance**:
- [x] `draft-issue` never asks whether an issue is suitable for automation.
- [x] No command creates, applies, verifies, removes, or otherwise mutates an `automatable` label.
- [x] `start-issue` neither filters candidates by `automatable` nor displays an automation indicator.
- [x] Existing repository labels and existing issue-label assignments are never migration targets.
- [x] Bare issue discovery still applies milestone, dependency, branch, and manual selection rules.
- [x] Epic membership remains coordination metadata rather than an execution dependency.
- [x] All skill-bundled edits are routed through `$skill-creator` and pass its validation.

### T006: Retain Manual Status and Epic Semantics Without Runner Coupling

**File(s)**:
- `skills/status/SKILL.md`
- `references/epic-relationships.md`
- `scripts/__tests__/status-skill-contract.test.mjs`
- `scripts/__tests__/sdlc-status.test.mjs`
- `scripts/__tests__/epic-relationship-contract.test.mjs`
- `scripts/__tests__/exercise-open-pr-epic.test.mjs`
- `scripts/__tests__/exercise-write-spec-epic.test.mjs`

**Type**: Modify / Verify
**Depends**: T003
**Acceptance**:
- [x] `$nmg-sdlc:status [--json]` remains read-only and infers manual issue, branch, spec, verification, PR, and next-command state.
- [x] Status does not probe removed runner source, config, state, sentinels, logs, PIDs, or cleanup commands.
- [x] Transitional wording such as "ahead of its removal" is replaced by a stable manual-only boundary.
- [x] Shared epic rules continue to support `start-issue`, `write-spec`, and `open-pr` without naming a runner consumer.
- [x] Native-plus-body, body-only, native-only, non-epic, and metadata-failure epic cases remain covered for manual consumers.
- [x] All skill-bundled edits are routed through `$skill-creator` and pass its validation.

---

## Phase 3: Project Migration

### T007: Rehome Managed Repository Assets in Onboarding

**File(s)**:
- `skills/onboard-project/SKILL.md`
- `skills/onboard-project/references/greenfield.md`
- `skills/onboard-project/references/brownfield.md`
- `skills/onboard-project/references/interview.md`
- `scripts/__tests__/contribution-gate-contract.test.mjs`
- `scripts/__tests__/issue-form-contract.test.mjs`

**Type**: Modify
**Depends**: T003
**Acceptance**:
- [x] Greenfield and greenfield-enhancement onboarding install or reconcile the managed contribution gate and structured issue form after steering exists.
- [x] Onboarding uses the existing shared managed-marker/version, path-collision, overwrite, and preservation contracts.
- [x] No onboarding branch delegates to `init-config`, generates runner configuration, or asks whether to set up unattended execution.
- [x] The Step 5 summary reports separate Contribution Gate and Issue Form status blocks and gaps.
- [x] Already-initialized mode continues to delegate template and managed-asset reconciliation to `upgrade-project`.
- [x] Unrelated workflows and issue templates are preserved byte-for-byte.
- [x] All skill-bundled edits are routed through `$skill-creator` and pass its validation.

### T008: Implement Ownership-Aware V2 Cleanup in Upgrade Project

**File(s)**:
- `skills/upgrade-project/SKILL.md`
- `skills/upgrade-project/references/detection.md`
- `skills/upgrade-project/references/migration-steps.md`
- `skills/upgrade-project/references/upgrade-procedures.md`
- `skills/upgrade-project/references/verification.md`

**Type**: Modify
**Depends**: T003, T007
**Acceptance**:
- [x] Runner-config template discovery, key merge, path refresh, value drift, and unattended branches are removed.
- [x] Analysis identifies only `sdlc-config.json`, `.codex/unattended-mode`, `.codex/sdlc-state.json`, and recognized managed runner-ignore blocks as cleanup candidates.
- [x] The normal interactive findings gate lists exact deletions before mutation and supports narrowing or declining the batch.
- [x] Approved cleanup deletes exact owned artifacts and removes only exact entries within `# SDLC runner config` or `# SDLC runner artifacts` blocks; matching user-owned entries outside those blocks are preserved.
- [x] PID contents are never read, signalled, executed, or surfaced.
- [x] Managed contribution-gate and issue-form reconciliation remains independent and complete.
- [x] Unrelated project files, ignore rules, workflows, issue templates, specs, and configuration are preserved.
- [x] A second run reports `already clean` with no new diff.
- [x] Partial read/delete failures identify exact paths and do not broaden cleanup scope.
- [x] All skill-bundled edits are routed through `$skill-creator` and pass its validation.

---

## Phase 4: Integration

### T009: Align Active Documentation, Steering, Ignore Rules, and Package Metadata

**File(s)**:
- `README.md`
- `steering/product.md`
- `steering/tech.md`
- `steering/structure.md`
- `.gitignore`
- `CHANGELOG.md`
- `scripts/package.json`
- `scripts/package-lock.json`

**Type**: Modify
**Depends**: T002, T004, T005, T006, T007, T008
**Acceptance**:
- [x] README and active steering describe only the manual pipeline, retained utilities, managed repository assets, and v2 cleanup path.
- [x] Skill references and architecture diagrams omit removed commands and runtime layers.
- [x] Root `.gitignore` removes obsolete runner-only entries and their now-empty managed header without changing unrelated rules.
- [x] `scripts/package*.json` no longer uses runner-specific package identity while retaining the full Jest suite configuration.
- [x] `[Unreleased]` contains a breaking-change and migration note for command/runtime removal; prior released changelog entries remain byte-for-byte historical records.
- [x] `VERSION` and `.codex-plugin/plugin.json` are not bumped in this implementation task; normal `open-pr` delivery owns the version change.
- [x] `steering/retrospective.md`, `steering/retrospective-state.json`, historical specs, and released changelog sections are not bulk rewritten.

### T010: Refresh the Manual-Only Skill Inventory

**File(s)**:
- `scripts/skill-inventory-audit.mjs`
- `scripts/skill-inventory.baseline.json`
- `scripts/__tests__/skill-inventory-audit.test.mjs`
- `scripts/__fixtures__/audit-canary/**`

**Type**: Modify
**Depends**: T004, T005, T006, T007, T008, T009
**Acceptance**:
- [x] Inventory extraction no longer has a special rule that captures unattended-mode lines outside normal tracked sections.
- [x] Canary fixtures continue to prove tracked-clause preservation with a current manual contract.
- [x] The committed baseline is regenerated from the complete surviving skill/reference tree.
- [x] Baseline destinations contain no removed skill path, command, sentinel, runner state, or runner configuration entry.
- [x] `node scripts/skill-inventory-audit.mjs --check` exits 0.
- [x] Inventory diff output remains deterministic and meaningful for future skill edits.

### T011: Rebase Static Contracts and Confirm BDD Traceability

**File(s)**:
- `scripts/__tests__/interactive-gates-contract.test.mjs`
- `scripts/__tests__/prompt-config-contract.test.mjs`
- `scripts/__tests__/open-pr-delivery-contract.test.mjs`
- `scripts/__tests__/contribution-gate-contract.test.mjs`
- `scripts/__tests__/issue-form-contract.test.mjs`
- `scripts/__tests__/epic-relationship-contract.test.mjs`
- `scripts/__tests__/status-skill-contract.test.mjs`
- `scripts/__tests__/steering-contract.test.mjs`
- other affected `scripts/__tests__/*.test.mjs`
- `specs/151-remove-the-automated-sdlc-loop-and-unattended-mode/feature.gherkin`

**Type**: Modify / Verify
**Depends**: T004, T005, T006, T007, T008, T009, T010
**Acceptance**:
- [x] Static tests assert one interactive gate contract and no plugin sentinel bypass.
- [x] Prompt-config tests preserve safe config repair and restart behavior without a headless exception.
- [x] Delivery tests stop treating obsolete runner files as invisible dirty-tree artifacts.
- [x] Managed-asset tests name onboarding and upgrade rather than `init-config`.
- [x] Steering tests require the manual-only architecture and skill contracts.
- [x] Status and epic tests retain manual behavior and reject runner coupling.
- [x] Exactly ten Gherkin scenarios map one-to-one to AC1–AC10 with valid Given/When/Then syntax.
- [x] Negative regression strings in test fixtures cannot be loaded or discovered as compatibility behavior.

---

## Phase 5: Testing & Release

### T012: Exercise Managed-Asset Continuity and V2 Cleanup

**File(s)**:
- `scripts/__tests__/exercise-contribution-gate.test.mjs`
- `scripts/__tests__/exercise-issue-form.test.mjs`
- new or existing onboarding/upgrade exercise fixtures under `scripts/__tests__/` and `scripts/__fixtures__/`

**Type**: Modify / Create
**Depends**: T007, T008, T011
**Acceptance**:
- [x] New-project exercises cover missing, current, stale-managed, future-managed, and unmanaged-collision contribution-gate states.
- [x] New-project exercises cover missing, current, differing managed target, and unrelated issue-template preservation states.
- [x] Existing-project cleanup exercises cover all three exact files, both recognized ignore-block headers, a matching unmanaged ignore entry, unrelated files/rules/workflows/templates, partial failures, and already-clean state.
- [x] Cleanup is run twice and the second result is idempotent with no file diff.
- [x] Existing `automatable` labels and issue assignments are represented as unchanged remote metadata or verified through dry-run command inspection.
- [x] Exercise output contains stable managed-asset and Runner Artifact Cleanup status blocks.

### T013: Exercise the Complete Manual Pipeline

**File(s)**: changed skill exercise fixtures/rubrics under `scripts/__fixtures__/skill-exercise/`; verification evidence only where no fixture is appropriate
**Type**: Modify / Verify
**Depends**: T004, T005, T006, T011
**Acceptance**:
- [x] A disposable project contains minimal steering, source, git history, issue/spec fixtures, and manual prompt context.
- [x] Exercise evidence covers `draft-issue`, `start-issue`, `write-spec`, `write-code`, `simplify`, `verify-code`, `open-pr`, and `address-pr-comments` in order.
- [x] Every surviving human gate appears and waits for explicit input; no stale `.codex/unattended-mode` file changes behavior.
- [x] GitHub-integrated writes use the documented dry-run evaluation or a dedicated test repository and do not pollute production repositories.
- [x] Each stage's postcondition satisfies the next stage's precondition.
- [x] No output suggests or invokes a removed automation command.
- [x] Temporary projects and any benign fixtures are cleaned up after evidence capture.

### T014: Run Local Closure Verification and Reconcile Related Backlog

**File(s)**: Repository-wide verification; no planned source edits
**Type**: Verify
**Depends**: T010, T011, T012, T013
**Acceptance**:
- [x] `cd scripts && npm test` exits 0 with no unexpected skips or orphaned imports.
- [x] `node scripts/skill-inventory-audit.mjs --check` exits 0.
- [x] `node scripts/codex-compatibility-check.mjs` exits 0.
- [x] `node scripts/verify-plugin-surface.mjs --root . --label repository` exits 0.
- [x] Staged-release, fresh-install, and upgraded-root fixtures pass; injected removed paths/tokens fail with deterministic diagnostics.
- [x] JSON, JavaScript syntax, workflow/YAML, plugin manifest, cross-reference, and `git diff --check` validations pass.
- [x] A bounded active-surface search finds no current capability claim, command, alias, sentinel, state, config, or runner asset outside declared negative-test rules.
- [x] `gh issue view 144`, `145`, and `149` confirms each is closed or validly manual-scoped; no issue edit occurs unless a still-open conflicting contract is discovered and separately authorized.
- [x] Verification distinguishes local source/fixture success from published-install completion.

### T015: Verify Published V2 Fresh Installation and Upgrade

**File(s)**: Post-release verification evidence and the issue #151 verification report
**Type**: Verify
**Depends**: T014 and a published v2 artifact
**Acceptance**:
- [ ] Record the published nmg-sdlc version, source commit SHA, marketplace pointer, and selected installed plugin root.
- [ ] Install v2 into a clean isolated Codex home/project, start a fresh Codex session, and confirm removed skills are not discoverable or invocable.
- [ ] Upgrade an existing project containing all known runner artifacts and managed repository assets, start a fresh Codex session, and confirm exact cleanup plus asset preservation.
- [ ] Run the surface validator against both active installed roots.
- [ ] Confirm no inactive versioned cache or source checkout was mistaken for the active installed root.
- [ ] If publication, upgrade, or fresh-session proof is unavailable, report AC1/AC6/AC10 installation closure as `Incomplete`; do not infer pass from source-tree or fixture evidence.

---

## Requirements Traceability

| Acceptance Criterion | Functional Requirements | Primary Tasks |
|----------------------|-------------------------|---------------|
| AC1: Fresh Install Has No Automated Loop Surface | FR1, FR6, FR9 | T001, T002, T014, T015 |
| AC2: Skills Use Interactive Contracts Only | FR1, FR2, FR6 | T003, T004, T013 |
| AC3: Automation Eligibility Is Removed from Issue Workflows | FR3 | T005, T012, T013 |
| AC4: Active Product Surfaces Describe the Manual Pipeline | FR2, FR6 | T001, T003, T004, T009, T010, T014 |
| AC5: Useful Managed Repository Assets Remain Available | FR4 | T007, T008, T012 |
| AC6: Upgrade Removes Only Known Obsolete Runner Artifacts | FR5, FR9 | T008, T012, T014, T015 |
| AC7: Existing GitHub Labels and Issue History Are Not Mutated | FR3 | T005, T012, T014 |
| AC8: Historical Records Remain Truthful and Intact | FR7 | T001, T002, T009, T014 |
| AC9: Conflicting Open Backlog Is Reconciled | FR8 | T006, T014 |
| AC10: Manual Pipeline and Migration Are Verified | FR2, FR9 | T010, T011, T012, T013, T014, T015 |

---

## Dependency Graph

```text
T001 → T002 → T003 ─┬─→ T004 ───────────────┐
                    ├─→ T005 ───────────────┤
                    ├─→ T006 ───────────────┤
                    └─→ T007 → T008 ────────┤
                                             ▼
                                            T009 → T010 → T011 ─┬─→ T012 ─┐
                                                                 └─→ T013 ─┤
                                                                            ▼
                                                                           T014
                                                                            │
                                                        published v2 ───────┤
                                                                            ▼
                                                                           T015
```

**Critical path**: T001 → T002 → T003 → T007 → T008 → T009 → T010 → T011 → T012 → T014 → T015

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #151 | 2026-08-13 | Initial feature spec |

---

## Validation Checklist

- [x] Each task has a single auditable responsibility.
- [x] Dependencies are explicit and acyclic.
- [x] File paths match the current repository structure.
- [x] Skill-bundled work explicitly routes through `$skill-creator`.
- [x] Deletion, migration, preservation, and idempotence each have verifiable checks.
- [x] All acceptance criteria map to Gherkin and implementation/verification tasks.
- [x] Manual pipeline exercise and static/unit coverage are both included.
- [x] Historical records are outside implementation rewrite scope.
- [x] Published-install proof is separated from local verification.
