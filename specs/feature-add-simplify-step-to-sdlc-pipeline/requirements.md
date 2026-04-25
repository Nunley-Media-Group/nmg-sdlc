# Requirements: Add /simplify Step to SDLC Pipeline

**Issues**: #140, #106
**Date**: 2026-04-24
**Status**: Amended
**Author**: Rich Nunley

---

## User Story

**As a** developer or automated SDLC pipeline
**I want** code simplified and cleaned immediately after implementation and before verification runs
**So that** verification operates on high-quality input and rework cycles caused by fixable style or complexity issues are minimized

---

## Background

The SDLC pipeline currently moves directly from `/write-code` to `/verify-code`. When implementation produces code that could be simplified (redundant logic, unnecessary abstractions, inconsistent patterns), the verifier sees that noise alongside genuine spec deviations — increasing false findings and rework.

The `simplify` skill is a standalone Codex marketplace skill that reviews changed code for reuse, quality, and efficiency, then fixes any issues found. It is NOT bundled with `nmg-sdlc` — it may or may not be present in any given project. Inserting a `/simplify` step between implementation and verification ensures verification always operates on already-cleaned code, while graceful-degradation behavior keeps the pipeline functional in projects that have not installed `simplify`.

The integration affects three surfaces:

1. The `write-code` skill (`plugins/nmg-sdlc/skills/write-code/SKILL.md`) — invokes simplify before signalling completion
2. The `verify-code` skill (`plugins/nmg-sdlc/skills/verify-code/SKILL.md`) — re-runs simplify after each fix in Step 6
3. The SDLC runner (`scripts/sdlc-runner.mjs`) and its config template — gains a `simplify` step between `implement` and `verify`

Reference: [GitHub issue #140](https://github.com/Nunley-Media-Group/nmg-plugins/issues/140).

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: write-code invokes /simplify after all tasks complete

**Given** implementation is complete AND the `simplify` skill is installed
**When** `write-code` reaches Step 6 (Signal Completion)
**Then** `/simplify` is invoked on the changed files, any findings are addressed immediately, and only after findings are cleared does the step signal completion

**Example**:
- Given: All tasks in `tasks.md` finished and the user has `simplify` installed (e.g., from the public Codex marketplace)
- When: write-code reaches its completion-signalling step
- Then: write-code probes for skill availability, invokes `/simplify`, applies any returned fixes, then prints "Implementation complete for issue #N"

### AC2: Graceful degradation when simplify is not installed

**Given** the `simplify` skill is NOT installed in the project
**When** `write-code` or `verify-code` would invoke it
**Then** a visible warning is logged (`simplify skill not available — skipping simplification pass`) and the step proceeds without simplification

**Example**:
- Given: A project where the marketplace skill `simplify` was never installed (probe finds no skill registered)
- When: write-code finishes its tasks
- Then: write-code emits the warning string verbatim and proceeds to its completion message; the step exits with the same success status it would have without simplify

### AC3: verify-code re-simplifies after fixing findings

**Given** `verify-code` has fixed one or more findings AND the `simplify` skill is installed
**When** it finishes applying a fix in Step 6 (Fix Findings)
**Then** `/simplify` is run on the affected code before re-verifying to ensure the fix itself is clean

**Example**:
- Given: verify-code finds 3 findings and applies fixes for them in Step 6a
- When: each fix is committed in memory and verify-code transitions to 6b/6c (re-test, re-verify)
- Then: `/simplify` runs over the affected files between fix application and re-verification

### AC4: SDLC runner gains a simplify step between implement and verify

**Given** the runner is running a full pipeline cycle
**When** the pipeline advances from `implement` (step 4) to `verify` (step 5)
**Then** a `simplify` step executes between them; if the skill is unavailable it logs a warning and skips gracefully rather than failing the run

**Example**:
- Given: `STEP_KEYS` declares `[startCycle, startIssue, writeSpecs, implement, simplify, verify, commitPush, createPR, monitorCI, merge]`
- When: the runner finishes step 4 successfully and probes for the simplify step
- Then: step 5 (`simplify`) executes; on success the runner proceeds to verify (now step 6); if simplify is unavailable the runner logs `[STATUS] simplify skill not available — skipping` and advances to verify with success

### AC5: Pipeline documentation is updated

**Given** any skill `## Integration with SDLC Workflow` section, the README pipeline diagram, or the `sdlc-config.example.json` step list
**When** this issue is complete
**Then** `/simplify` appears between `/write-code` and `/verify-code` in all pipeline depictions

**Example**:
- Given: README.md contains the diagram `/draft-issue → /start-issue → /write-spec → /write-code → /verify-code → /open-pr`
- When: the change is merged
- Then: every diagram is updated to `/draft-issue → /start-issue → /write-spec → /write-code → /simplify → /verify-code → /open-pr`, including diagrams inside each pipeline skill's `## Integration with SDLC Workflow` section

### AC6: Bundled simplify skill is directly invocable

**Given** the nmg-sdlc plugin is installed
**When** a user invokes `$nmg-sdlc:simplify`
**Then** Codex identifies changed files and runs a behavior-preserving simplification pass over them

**Example**:
- Given: The active Codex session lists the nmg-sdlc plugin skills
- When: the user runs `$nmg-sdlc:simplify`
- Then: the bundled `skills/simplify/SKILL.md` workflow runs without requiring a separate skill

### AC7: Changed-file discovery matches simplify behavior

**Given** a project has unstaged or staged changes
**When** `$nmg-sdlc:simplify` starts
**Then** it inspects `git diff` or `git diff HEAD` as appropriate
**And** if no git changes exist, it reviews recently modified files mentioned by the user or edited in the current conversation

**Example**:
- Given: `git diff --name-only` returns changed source files
- When: simplify starts
- Then: those files become the review scope; if the diff is empty, the skill falls back to conversation-mentioned or recently edited files rather than reporting a false no-op

### AC8: Code reuse review is performed

**Given** changed files contain newly written or modified logic
**When** simplify reviews the diff
**Then** it searches for existing utilities, helpers, adjacent patterns, and shared modules that could replace duplicated or hand-rolled code
**And** it flags new functions or inline logic that duplicate existing functionality

### AC9: Code quality review is performed

**Given** changed files contain implementation changes
**When** simplify reviews the diff
**Then** it checks for redundant state, parameter sprawl, copy-paste variation, leaky abstractions, stringly typed code, unnecessary nesting, nested conditionals, and unnecessary comments

### AC10: Efficiency review is performed

**Given** changed files contain implementation changes
**When** simplify reviews the diff
**Then** it checks for unnecessary work, missed concurrency, hot-path bloat, recurring no-op updates, unnecessary existence pre-checks, memory leaks, and overly broad operations

### AC11: Findings are fixed or explicitly skipped

**Given** simplify finds one or more issues
**When** the findings are aggregated
**Then** worthwhile fixes are applied directly in-place while preserving behavior
**And** false positives or not-worthwhile changes are briefly noted and skipped without blocking completion

### AC12: write-code uses bundled simplify

**Given** `$nmg-sdlc:write-code` completes implementation tasks
**When** it reaches its simplify pass
**Then** it invokes bundled `$nmg-sdlc:simplify`
**And** it no longer probes for or references a separate simplify skill

### AC13: verify-code uses bundled simplify after fixes

**Given** `$nmg-sdlc:verify-code` applies fixes during its autofix loop
**When** it reaches the post-fix simplify pass
**Then** it invokes bundled `$nmg-sdlc:simplify` before re-running tests and re-verification

### AC14: Runner simplify step uses bundled simplify

**Given** the SDLC runner advances to its simplify step
**When** it builds the step prompt
**Then** the prompt instructs Codex to run `$nmg-sdlc:simplify`
**And** it does not treat simplify as optional or unavailable when this plugin is installed

### AC15: old unbundled simplify holdovers are removed from live surfaces

**Given** README, live skill docs, runner prompts, and current-contract sections of the active simplify specs reference old unbundled simplify behavior
**When** this issue is complete
**Then** those live references are updated to `$nmg-sdlc:simplify` and Codex-native wording
**And** archival history that only records past behavior is not bulk-normalized

### AC16: Skill-bundled edits route through skill-creator

**Given** this change creates or edits skill-bundled files such as `skills/simplify/SKILL.md`, skill references, shared references, or prompt contracts
**When** `$nmg-sdlc:write-code` implements those tasks
**Then** the tasks require `$skill-creator` routing
**And** there is no direct-edit fallback for those skill-bundled files

### Generated Gherkin Preview

```gherkin
Feature: Add /simplify step to SDLC pipeline

  Scenario: write-code invokes /simplify after all tasks complete
    Given implementation is complete and the simplify skill is installed
    When write-code reaches Step 6 (Signal Completion)
    Then /simplify is invoked on changed files
    And findings are addressed before completion is signalled

  Scenario: Graceful degradation when simplify is not installed
    Given the simplify skill is NOT installed
    When write-code or verify-code would invoke it
    Then a warning is logged and the step proceeds without simplification

  Scenario: verify-code re-simplifies after fixing findings
    Given verify-code has fixed one or more findings and simplify is installed
    When it finishes applying a fix
    Then /simplify is run on the affected code before re-verifying

  Scenario: SDLC runner gains a simplify step between implement and verify
    Given the runner is running a pipeline cycle
    When the pipeline advances from implement to verify
    Then a simplify step executes between them
    And if simplify is unavailable the step logs a warning and skips

  Scenario: Pipeline documentation is updated
    Given any skill Integration section, README diagram, or config step list
    When this issue is complete
    Then /simplify appears between /write-code and /verify-code in all depictions
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | `write-code` probes for simplify skill availability before invoking | Must | Probe via `Glob` over plugin/skills directories or a deterministic check the skill author can document; result must be observable in step output |
| FR2 | `write-code` invokes simplify and blocks step completion until findings are addressed | Must | Step 6 is the natural insertion point; the existing "Signal Completion" output moves to after simplify |
| FR3 | `write-code` invokes the bundled simplify skill before completion | Must | Missing bundled skill loading is a packaging defect, not a pass-through state |
| FR4 | `verify-code` applies the same simplify-then-verify pattern after each fix | Must | Insertion point is between Step 6a (Prioritize and Fix) and Step 6b (Run Tests After Fixes); same probe + warning pattern as write-code |
| FR5 | SDLC runner `STEP_KEYS` gains a `simplify` step between `implement` and `verify` | Must | Inserted at index 4 (`startCycle, startIssue, writeSpecs, implement, simplify, verify, ...`); `STEP_NUMBER` and `STEPS` derive from `STEP_KEYS` so they update automatically; downstream step numbers shift by one |
| FR6 | Runner simplify step invokes the bundled skill directly | Should | Missing bundled skill loading should fail validation rather than being treated as a successful skip |
| FR7 | README pipeline diagram and all skill integration sections updated | Must | Update `README.md` pipeline diagram, every `## Integration with SDLC Workflow` block in pipeline skills, and `sdlc-config.example.json` to include the simplify step |

### Derivative Functional Requirements (technical adjustments)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR8 | `sdlc-config.example.json` adds a `simplify` entry to `steps{}` | Must | Provides config defaults for model/effort/maxTurns/timeout matching the lightweight nature of the step |
| FR9 | Runner unit tests cover the new step ordering | Must | Update existing `STEP_KEYS and STEPS` test (`scripts/__tests__/sdlc-runner.test.mjs`) to expect 10 steps with `simplify` at index 4 |
| FR10 | Hard-coded step numbers in runner prompts are still keyed off `STEP_NUMBER` (not literals) where they reference verify/commitPush/createPR/monitorCI/merge | Must | Inserting the new step shifts numbers; any literal usage (e.g., comments mentioning "step 5") should be re-validated |
| FR11 | CHANGELOG `[Unreleased]` entry added describing the new pipeline step | Must | Per repo conventions in AGENTS.md |
| FR12 | Add `skills/simplify/SKILL.md` as a bundled nmg-sdlc skill | Must | The plugin manifest already loads `./skills/`, so adding the skill directory makes it available with the plugin |
| FR13 | Make the skill directly invocable as `$nmg-sdlc:simplify` when the plugin is installed | Must | Use the plugin namespace consistently in README, skill integration diagrams, runner prompts, and active specs |
| FR14 | Translate legacy runtime's three-review-track simplify model into Codex-compatible execution | Must | Preserve the reuse, quality, and efficiency review categories while using Codex-native file inspection, shell commands, and edits |
| FR15 | Use optional Codex explorer subagents only when explicitly authorized | Should | If the user or runner explicitly authorizes delegation, run bounded reuse, quality, and efficiency explorer reviews in parallel; otherwise perform the same checks inline |
| FR16 | Changed-file discovery uses git diffs first and a conversation/recent-file fallback second | Must | Inspect `git diff` or `git diff HEAD` based on staged state; avoid false no-op results when a user asks about recently edited files with a clean worktree |
| FR17 | Simplify fixes preserve behavior and must not introduce spec drift | Must | Changes are cleanup-only; any scope or behavior change is skipped and reported |
| FR18 | Update write-code, verify-code, and runner prompts to invoke bundled `$nmg-sdlc:simplify` | Must | Remove unbundled probe-and-skip logic from live pipeline surfaces |
| FR19 | Update README, integration diagrams, CHANGELOG, and this active spec to describe bundled simplify behavior | Must | README remains the primary public documentation; specs stay aligned with live behavior |
| FR20 | Add or update inventory and compatibility tests so the new skill is discoverable and valid | Must | Include `node scripts/skill-inventory-audit.mjs --check` and `npm run compat` coverage where applicable |
| FR21 | Add regression checks that no live pipeline surface still describes simplify as old unbundled behavior | Must | Search live README, skills, runner prompts, and current-contract spec sections; exclude archival or superseded issue #140 sections explicitly |
| FR22 | Skill-bundled implementation tasks must route through `$skill-creator` | Must | Applies to new `skills/simplify/SKILL.md` and edits under `skills/**`, root `references/**`, and `agents/*.md` |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Simplify pass should add no more than the per-step timeout configured in `sdlc-config.example.json` (default 10–15 min); skill availability probe must be O(1) — a single directory or registry lookup |
| **Security** | No new secrets introduced; simplify skill executes under the same `--dangerously-skip-permissions` envelope as other steps |
| **Reliability** | Probe-and-skip behaviour MUST be tested; an absent simplify skill must never cause the pipeline to fail |
| **Cross-Platform** | Probe must work on macOS, Windows, and Linux — use `node:path` and the existing skills-discovery pattern; no shell-specific globbing |
| **Platforms** | Reference `tech.md` — Codex CLI on macOS/Windows/Linux; Node.js v24+ for the runner |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Skill availability flag | boolean (computed) | True if a `simplify` skill is discoverable in the loaded plugin set | Yes |
| Changed file list | array of paths | Derived from `git diff` against the baseline branch | Yes (passed to simplify) |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| Simplify step status | enum (`ran`, `skipped`, `failed`) | Reported in skill output and in runner step logs |
| Files modified by simplify | array of paths | Captured for the verification report so reviewers see what changed |

---

## Dependencies

### Internal Dependencies
- [ ] Existing `write-code` skill (`plugins/nmg-sdlc/skills/write-code/SKILL.md`)
- [ ] Existing `verify-code` skill (`plugins/nmg-sdlc/skills/verify-code/SKILL.md`)
- [ ] SDLC runner (`scripts/sdlc-runner.mjs`) and its tests (`scripts/__tests__/sdlc-runner.test.mjs`)
- [ ] Runner config template (`scripts/sdlc-config.example.json`)
- [ ] README pipeline diagram (`README.md`)

### External Dependencies
- [ ] `simplify` skill from the Codex marketplace — NOT bundled, optional at runtime

### Amendment Dependency Update (#106)
- [ ] No external simplify skill dependency remains for live nmg-sdlc behavior; simplify is bundled in this plugin
- [ ] Codex CLI plugin skill loading discovers `skills/simplify/SKILL.md` through `.codex-plugin/plugin.json`
- [ ] `$skill-creator` is required during implementation for skill-bundled file creation or edits

### Blocked By
- None

---

## Out of Scope

- Changes to the `simplify` skill itself
- Changes to `/draft-issue`, `/write-spec`, `/start-issue`, or `/open-pr`
- Installing or bundling the `simplify` skill as part of nmg-sdlc
- Adding metrics or telemetry for simplify pass effectiveness
- Detecting whether simplify made meaningful changes (any change reported by simplify is accepted)

### Amendment Scope Update (#106)

Issue #106 supersedes the previous unbundled simplify contract. Bundling `$nmg-sdlc:simplify`, replacing the live probe-and-skip wording, and updating the active simplify spec are now in scope. The following remain out of scope:

- Implementing legacy runtime internals or depending on legacy runtime at runtime
- Changing program behavior while simplifying code
- Turning simplify into a full architecture, security, or spec verification review
- Bulk-normalizing archival documents that only record past behavior and are not live contracts

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Verification false-finding rate | Lower vs. pre-change baseline (informal) | Compare verification reports before and after on a set of issues |
| Pipeline reliability when simplify absent | 100% | All runner tests covering "simplify unavailable" must pass |
| Documentation coverage | 100% | Every pipeline diagram in the repo names `simplify` between `/write-code` and `/verify-code` |

---

## Open Questions

- [ ] What is the canonical detection mechanism for bundled plugin skills? (Design phase will answer using the active plugin skill-loading contract)
- [ ] Should the runner also consult `sdlc-config.json` for an explicit `simplify.enabled = false` opt-out? (Design phase will decide; default behaviour is "enabled if installed")

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #140 | 2026-04-19 | Initial feature spec |
| #106 | 2026-04-24 | Bundled nmg-sdlc simplify skill supersedes the old unbundled simplify contract |

---

## Validation Checklist

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements (the FR table calls out implementation surfaces, not implementations)
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases (skill absent in any of three call sites) are specified
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented
