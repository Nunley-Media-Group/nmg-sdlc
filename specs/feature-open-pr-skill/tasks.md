# Tasks: Creating PRs Skill

**Issues**: #8, #128, #108
**Date**: 2026-04-25
**Status**: Complete
**Author**: Codex (retroactive)

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 1 | [x] |
| Plugin Files | 1 | [x] |
| Integration | 1 | [x] |
| Testing | 1 | [x] |
| Phase 5: Enhancement — Issue #128 | 4 | [x] |
| Phase 6: Enhancement — Issue #108 | 8 | [x] |
| **Total** | **16** | |

---

## Task Format

Each task follows this structure:

```
### T[NNN]: [Task Title]

**File(s)**: `{layer}/path/to/file`
**Type**: Create | Modify | Delete
**Depends**: T[NNN], T[NNN] (or None)
**Acceptance**:
- [x] [Verifiable criterion 1]
- [x] [Verifiable criterion 2]

**Notes**: [Optional implementation hints]
```

Map `{layer}/` placeholders to actual project paths using `structure.md`.

---

## Phase 1: Setup

### T001: Create Skill Directory

**File(s)**: `plugins/nmg-sdlc/skills/open-pr/`
**Type**: Create
**Depends**: None
**Status**: Complete
**Acceptance**:
- [x] Directory exists

---

## Phase 2: Plugin Files

### T002: Create Skill Definition

**File(s)**: `plugins/nmg-sdlc/skills/open-pr/SKILL.md`
**Type**: Create
**Depends**: T001
**Status**: Complete
**Acceptance**:
- [x] SKILL.md has valid frontmatter with minimal Codex frontmatter
- [x] Documents 4-step workflow (read context, generate content, push/create, output)
- [x] PR body template with summary, ACs, test plan, spec links, Closes #N
- [x] Conventional commit prefix for PR titles
- [x] Automation mode completion signal documented

---

## Phase 3: Integration

### T003: Configure Allowed Tools

**File(s)**: `plugins/nmg-sdlc/skills/open-pr/SKILL.md`
**Type**: Modify
**Depends**: T002
**Status**: Complete
**Acceptance**:
- [x] Allowed tools: Read, Glob, Grep, Bash(gh:*), Bash(git:*)
- [x] No Write/Edit needed (read-only + gh commands)

---

## Phase 4: Testing

### T004: Create BDD Feature File

**File(s)**: `specs/feature-open-pr-skill/feature.gherkin`
**Type**: Create
**Depends**: T002
**Status**: Complete
**Acceptance**:
- [x] All 4 acceptance criteria have corresponding scenarios

---

## Phase 5: Enhancement — Issue #128 (Interactive CI Monitor + Auto-Merge)

### T005: Add Step 7 — Interactive CI Monitor Prompt (Opt-In / Opt-Out)

**File(s)**: `plugins/nmg-sdlc/skills/open-pr/SKILL.md`
**Type**: Modify
**Depends**: T002
**Status**: Complete
**Acceptance**:
- [x] New Step 7 section documents the `interactive prompt` prompt with two options: "Yes, monitor CI and auto-merge" and "No, I'll handle it"
- [x] Step 7 is explicitly gated by `.codex/unattended-mode` absence — the entire block is skipped when the sentinel is present (no prompt, no polling, no merge invocation) per AC8 and AC9
- [x] Opt-out path ends with the existing Step 6 "Next step: Wait for CI to pass..." output unchanged (AC6)
- [x] Opt-in path transitions to T006 polling logic
- [x] Section cross-references `steering/retrospective.md` for the active-suppression pattern

**Notes**: The existing Step 6 output block already branches on the sentinel — restructure so the opt-out branch reuses that exact text. Do NOT duplicate the "Next step" message.

### T006: Document CI Polling Loop and Merge Success Path

**File(s)**: `plugins/nmg-sdlc/skills/open-pr/SKILL.md`
**Type**: Modify
**Depends**: T005
**Status**: Complete
**Acceptance**:
- [x] Polling loop specifies `gh pr checks <num> --json name,state,link` with 30-second cadence and 30-minute total timeout (constants documented inline)
- [x] Success path invokes `gh pr merge <num> --squash --delete-branch`, then `git checkout main && git branch -D <branch>`
- [x] On all checks passing and successful merge, the skill prints a clean-state completion line (e.g., "Merged and cleaned up — you are back on main")
- [x] Polling cadence matches `scripts/sdlc-runner.mjs` (line 937) — skill instructions cite this for future-proofing
- [x] Handles pre-merge mergeability check via `gh pr view <num> --json mergeable,mergeStateStatus`; non-`CLEAN` states route to T007 failure path

**Notes**: Reference the terminal-state mapping table in `design.md` → "Terminal-State Mapping" so the skill instructions stay aligned with the design.

### T007: Document CI Failure and No-CI Graceful-Skip Paths

**File(s)**: `plugins/nmg-sdlc/skills/open-pr/SKILL.md`
**Type**: Modify
**Depends**: T005
**Status**: Complete
**Acceptance**:
- [x] Failure path (FAILURE, CANCELLED, TIMED_OUT, non-mergeable) prints each failing check's name and details URL (from `--json link`), does NOT invoke `gh pr merge`, and does NOT run `git branch -D` (AC7)
- [x] "no checks reported" path prints "No CI configured — skipping auto-merge" and exits without merging (AC7 + retrospective learning on absent integrations)
- [x] Polling timeout exceeded is treated as a failure with a clear message (not a silent merge)
- [x] Failure output leaves the user on the feature branch so they can investigate

**Notes**: No branch deletion on failure — the user needs the branch intact to push follow-up fixes.

### T008: Add Gherkin Scenarios for AC5–AC9

**File(s)**: `specs/feature-open-pr-skill/feature.gherkin`
**Type**: Modify
**Depends**: T005, T006, T007
**Status**: Complete
**Acceptance**:
- [x] Scenario: User opts in — happy path (AC5)
- [x] Scenario: User opts out — exits with existing Next step output (AC6)
- [x] Scenario: CI fails during monitoring — reports and stops (AC7)
- [x] Scenario: No CI configured — graceful skip (AC7 + retrospective)
- [x] Scenario: Unattended mode suppresses new prompt (AC8)
- [x] Scenario: Unattended mode actively suppresses polling and merge invocations (AC9)
- [x] New scenarios tagged `# Added by issue #128`

---

## Phase 6: Enhancement — Issue #108 (Fold Commit and Push Into Open-pr)

### T009: Replace Open-pr Abort-only Preflight With Delivery Preparation

**File(s)**: `skills/open-pr/SKILL.md`, `skills/open-pr/references/preflight.md`
**Type**: Modify
**Depends**: T002
**Status**: Complete
**Acceptance**:
- [x] `$nmg-sdlc:open-pr` stages eligible tracked and untracked non-runner-artifact changes before PR creation
- [x] `.codex/sdlc-state.json` and `.codex/unattended-mode` remain filtered from delivery decisions and are not published
- [x] Dirty non-runner work is no longer an immediate preflight failure when it can be committed safely
- [x] Clean already-pushed branches continue without creating a redundant commit and report that no additional commit was needed

### T010: Move Version-bump Application Into Open-pr Delivery Commit

**File(s)**: `skills/open-pr/SKILL.md`, `skills/open-pr/references/version-bump.md`, `skills/open-pr/references/pr-body.md`
**Type**: Modify
**Depends**: T009
**Status**: Complete
**Acceptance**:
- [x] `$nmg-sdlc:open-pr` applies the label-based version bump before creating the delivery commit when the issue is not spike-labelled and a `VERSION` file exists
- [x] `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, and stack-specific version files stay synchronized per `steering/tech.md`
- [x] `--major` remains manual-only and escalates in unattended mode before any mutation
- [x] PR body version lines read the committed version artifacts after delivery preparation completes

### T011: Move Rebase and Safe Push Behavior Into Open-pr

**File(s)**: `skills/open-pr/SKILL.md`, `skills/open-pr/references/preflight.md`
**Type**: Modify
**Depends**: T010
**Status**: Complete
**Acceptance**:
- [x] `$nmg-sdlc:open-pr` fetches `origin`, checks ancestry against `origin/main`, and rebases when local is behind
- [x] Rebase conflicts in version artifacts stop the workflow and emit the same interactive/unattended escalation semantics as the existing commit-push contract
- [x] Rebased branches push with `git push --force-with-lease=HEAD:{EXPECTED_SHA}` where `EXPECTED_SHA` is captured before rebase
- [x] Push success is verified by confirming `git log origin/{branch}..HEAD --oneline` is empty before `gh pr create`

### T012: Remove or Deprecate Commit-push Public Skill Surface

**File(s)**: `skills/commit-push/SKILL.md`, `.codex-plugin/plugin.json`
**Type**: Modify | Delete
**Depends**: T011
**Status**: Complete
**Acceptance**:
- [x] `$nmg-sdlc:commit-push` is no longer presented as a required or available public workflow step
- [x] If kept for compatibility, the skill is a deprecation stub that directs users to `$nmg-sdlc:open-pr`
- [x] Plugin inventory and descriptions do not advertise commit-push as a normal SDLC step
- [x] No downstream skill still declares commit-push as its required predecessor

### T013: Collapse Runner Delivery Step Into Create-pr

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: T011
**Status**: Complete
**Acceptance**:
- [x] `commitPush` is removed from the deterministic `STEP_KEYS` sequence
- [x] The createPR/open-pr prompt instructs the skill to commit, version, rebase, push, and create the PR in one step
- [x] Runner preconditions and state hydration no longer treat "branch pushed" as a completed standalone commitPush step
- [x] The `DIVERGED: re-run commit-push...` bounce-back path is removed because open-pr owns divergence reconciliation

### T014: Update Public Workflow Documentation and Integration Diagrams

**File(s)**: `README.md`, `skills/*/SKILL.md`, `references/*.md`, `skills/*/references/*.md`
**Type**: Modify
**Depends**: T012, T013
**Status**: Complete
**Acceptance**:
- [x] README workflow diagrams show `verify-code` → `open-pr` → `address-pr-comments`
- [x] Skill descriptions and Integration with SDLC Workflow sections no longer include commit-push as a separate step
- [x] References that mention commit-push handoff or bounce-back behavior are removed or rewritten around open-pr delivery preparation
- [x] Public docs still explain where version bumping, CHANGELOG updates, and push verification happen

### T015: Update Runner and Open-pr Contract Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, `scripts/__tests__/exercise-open-pr-epic.test.mjs`, `scripts/__tests__/*open-pr*.test.mjs`
**Type**: Modify
**Depends**: T013, T014
**Status**: Complete
**Acceptance**:
- [x] Runner tests assert the new step order and shifted downstream step numbers
- [x] Prompt contract tests assert createPR/open-pr owns commit, version, rebase, push, and PR creation
- [x] Tests cover clean branch no-op delivery and dirty branch commit delivery
- [x] Tests cover removal of commit-push bounce-back and stale public workflow references

### T016: Exercise Open-pr Delivery End-to-end

**File(s)**: `scripts/__tests__/exercise-open-pr-epic.test.mjs`, `/tmp/nmg-sdlc-test-*`
**Type**: Modify
**Depends**: T015
**Status**: Complete
**Acceptance**:
- [x] Exercise `$nmg-sdlc:open-pr` against a disposable project with dirty work and confirm it commits, bumps, pushes, and prepares PR creation
- [x] Exercise an already clean/pushed branch and confirm no redundant commit is created
- [x] Exercise unattended mode and confirm no interactive force-push or CI-monitor prompt appears
- [x] Record verification evidence suitable for `$nmg-sdlc:verify-code`

---

## Dependency Graph

```
Phase 1–4 (existing):
T001 ──▶ T002 ──▶ T003 ──▶ T004

Phase 5 (Issue #128):
T002 ──▶ T005 ──┬──▶ T006 ──┐
                 └──▶ T007 ──┼──▶ T008

Phase 6 (Issue #108):
T002 ──▶ T009 ──▶ T010 ──▶ T011 ──┬──▶ T012 ──┬──▶ T014 ──┐
                                    └──▶ T013 ──┘           ├──▶ T015 ──▶ T016
                                                             └────────────┘
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #8 | 2026-02-15 | Initial feature spec |
| #128 | 2026-04-18 | Add Phase 5 enhancement — Interactive CI monitor + auto-merge (T005–T008) |
| #108 | 2026-04-25 | Add Phase 6 enhancement — fold commit, version, rebase, and push into open-pr; remove separate commit-push workflow step (T009–T016) |

---

## Validation Checklist

- [x] Each task has single responsibility
- [x] Dependencies correctly mapped
- [x] Acceptance criteria are verifiable
- [x] File paths reference actual project structure
- [x] BDD testing task included (T008)
- [x] No circular dependencies
