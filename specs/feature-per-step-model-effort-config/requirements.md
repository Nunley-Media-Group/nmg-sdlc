# Requirements: Per-Step Model and Effort Level Configuration

**Issues**: #77, #91, #130
**Date**: 2026-04-18
**Status**: Draft
**Author**: Codex (spec-writer)

---

## User Story

**As a** developer or SDLC automation agent running the SDLC workflow
**I want** per-step model and effort level configuration
**So that** each SDLC phase uses the optimal model for its task — high-reasoning models for planning and spec writing, efficient models for mechanical work — balancing quality and cost

---

## Background

The SDLC runner currently uses a single global model (`config.model`, default `"gpt-5.5"`) for all steps. Every `codex exec --cd` subprocess runs on the same model at the same (unspecified) effort level. This is suboptimal: spec writing and architecture review benefit from GPT-5.5-class reasoning, while implementation coding and mechanical tasks can use GPT-5.4 efficiently.

Codex supports two relevant configuration mechanisms:
1. **Skill frontmatter `model` field** — enforced at runtime when a skill is loaded manually. Currently no nmg-sdlc SKILL.md files declare this field (only the `architecture-reviewer` agent does).
2. **`model_reasoning_effort` environment variable** — session-scoped, valid values: `low`, `medium`, `high`. Currently never set by the runner.

The runner's `buildCodexArgs()` function already supports per-step `maxTurns` and `timeoutMin` via the step config object, but `model` is hardcoded to the global `MODEL` variable and `effort` is not handled at all.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Runner Supports Per-Step Model Override

**Given** a `sdlc-config.json` with a step that has a `model` field (e.g., `"writeSpecs": { "model": "gpt-5.5", ... }`)
**When** the runner executes that step
**Then** the Codex subprocess is spawned with `--model` set to the step's model value

**And** the global `model` config is used as fallback for steps without a per-step `model`

**Example**:
- Given: config has `"model": "gpt-5.4"` globally and `"writeSpecs": { "model": "gpt-5.5" }`
- When: the runner executes the writeSpecs step
- Then: `codex exec --cd ... --model gpt-5.5` is invoked

### AC2: Runner Supports Per-Step Effort Override

**Given** a `sdlc-config.json` with a step that has an `effort` field (e.g., `"writeSpecs": { "effort": "high" }`)
**When** the runner executes that step
**Then** the Codex subprocess is spawned with `model_reasoning_effort` set to the step's effort value in its environment

**And** the global `effort` config is used as fallback for steps without a per-step `effort`

**Example**:
- Given: config has `"effort": "high"` globally and `"startIssue": { "effort": "medium" }`
- When: the runner executes the startIssue step
- Then: the subprocess environment includes `model_reasoning_effort=medium`

### ~~AC3: Implementing-Specs Always Splits Into Planning and Coding Phases~~ (Superseded by AC10)

~~**Given** the runner reaches the implement step~~
~~**When** it executes write-code~~
~~**Then** it always runs two separate `codex exec --cd` subprocesses sequentially~~

> **Superseded by AC10 (issue #91):** The implement step now uses a single `runCodex()` invocation, matching all other runner steps. The skill's unattended-mode logic handles planning internally.

### AC4: Backward Compatibility Preserved

**Given** a `sdlc-config.json` without any per-step `model` or `effort` fields (existing format)
**When** the runner executes all steps
**Then** all steps use the global `model` (defaulting to `"gpt-5.5"` if unset) with no `model_reasoning_effort` set (preserving current behavior)

### AC5: Config Template Shows Per-Step Model/Effort Examples

**Given** a user reads `sdlc-config.example.json`
**When** they review the step configuration
**Then** each step includes `model` and `effort` fields with recommended defaults matching the recommendations matrix from the issue
**And** the implement step shows a flat step config (no nested `plan`/`code` objects) with `model: "gpt-5.5"` and `effort: "medium"` as defaults

### AC6: Skill Frontmatter Includes Model Field

**Given** any nmg-sdlc SKILL.md file
**When** Codex loads it for manual invocation
**Then** the runner `model` field enforces the recommended model for that skill's execution

**Example**:
- Given: `write-spec/SKILL.md` has `model: gpt-5.5` in frontmatter
- When: a user manually runs `/nmg-sdlc:write-spec`
- Then: Codex uses the GPT-5.5 model for that session regardless of the session's default model

### AC7: README Documents Model/Effort Recommendations

**Given** a user reads the README
**When** they look for model/effort guidance
**Then** they find a table of recommended model and effort settings per skill/step
**And** instructions for overriding defaults via runner config

### AC8: Global Effort Fallback Works

**Given** a `sdlc-config.json` with a global `effort` field but no per-step effort overrides
**When** the runner executes any step
**Then** every subprocess is spawned with `model_reasoning_effort` set to the global effort value

**Example**:
- Given: config has `"effort": "high"` and no per-step effort fields
- When: runner executes writeSpecs step
- Then: subprocess environment includes `model_reasoning_effort=high`

### AC9: Invalid Model or Effort Values Are Rejected

**Given** a `sdlc-config.json` with an invalid `effort` value (e.g., `"effort": "maximum"`) or an empty `model` value
**When** the runner starts
**Then** it exits with a non-zero exit code and a descriptive error message identifying the invalid field and valid options

### AC10: Single Invocation for Implement Step

**Given** the runner reaches Step 4 (implement)
**When** it executes the implement step
**Then** it calls `runCodex()` once (like all other steps), using the skill's unattended-mode to handle planning and execution internally
**And** the `runImplementStep()` function is no longer called
**And** the `resolveImplementPhaseConfig()` function is no longer used

**Example**:
- Given: runner reaches step 4 with issue #42 on branch 42-add-feature
- When: it executes the implement step
- Then: a single `codex exec --cd` subprocess runs with `--model gpt-5.5` and `model_reasoning_effort=medium`

### AC11: Implement Step Default Model and Effort

**Given** no step-level or global model/effort overrides are configured for the implement step
**When** the implement step resolves its configuration
**Then** it defaults to model `gpt-5.5` and effort `medium`

**Example**:
- Given: config has no `implement.model` or `implement.effort` fields, and no global overrides
- When: runner resolves implement step config
- Then: model resolves to `"gpt-5.5"`, effort resolves to `"medium"`

### AC12: Runner Prompt Simplified

**Given** the runner builds the prompt for Step 4
**When** `.codex/unattended-mode` is active
**Then** the prompt no longer includes "Do NOT call EnterPlanMode" (the skill handles this via its own unattended-mode detection)

### AC13: Backward Compatibility — Legacy plan/code Config

**Given** an existing config file that still has `plan` and `code` sub-objects under `steps.implement`
**When** the runner validates the config
**Then** it ignores the unused sub-objects gracefully (no validation errors, no crashes)
**And** the step-level `implement.model` and `implement.effort` fields are used (the nested `plan`/`code` sub-objects are simply ignored)

### AC15: Writing-Specs Auto-Mode Always Amends Existing Spec

**Given** `.codex/unattended-mode` exists
**And** the write-spec spec discovery step finds one or more matching feature specs
**When** the skill decides whether to amend or create a new spec
**Then** it skips the `interactive prompt` prompt entirely and proceeds directly in amendment mode (amend the top-scored existing spec)
**And** the decision does not depend on option ordering in any `interactive prompt` call

### AC14: Create PR Step Default maxTurns Increased

**Given** a user runs the SDLC runner with default configuration
**When** the runner reaches the createPR step (Step 7)
**Then** the default `maxTurns` in `sdlc-config.example.json` is 30 (increased from 15)

---

## Issue #130 — Optimize defaults for latest model lineup (GPT-5.5, GPT-5.4, GPT-5.4 Mini)

### AC16: Per-step defaults revisit is holistic

**Given** the latest Codex model lineup and OpenAI's published effort-level guidance
**When** a maintainer reviews `scripts/sdlc-config.example.json`
**Then** every step has an explicit `model`, `maxTurns`, and `timeoutMin`, and an explicit `effort` if and only if the model supports effort (i.e., GPT-5.5 or GPT-5.4 variants)

### AC17: Hard cap on GPT-5.5 usage

**Given** the shipped example config
**When** every step is inspected
**Then** `gpt-5.5` appears only on `writeSpecs`, `implement`, and `verify`
**And** every other step (`startCycle`, `startIssue`, `commitPush`, `createPR`, `monitorCI`, `merge`) uses `gpt-5.4` or `gpt-5.4-mini`

### AC18: `startCycle` is explicitly pinned

**Given** the example config
**When** `startCycle` is loaded
**Then** it has an explicit `model` field (does not inherit the global default)

### AC19: Runner hardcoded default updated

**Given** `resolveStepConfig()` at `scripts/sdlc-runner.mjs:221–226`
**When** both the step and global config omit `model`
**Then** the fallback returns `'gpt-5.4'` (not `'gpt-5.5'`)
**And** when both omit `effort`, the fallback returns `'medium'`

### AC20: README recommendations table rewritten

**Given** `README.md` lines 174–186
**When** a user reads the "Recommended model assignments" table
**Then** every row reflects the new defaults and includes a one-line rationale citing the published OpenAI effort guidance

### AC21: CHANGELOG entry added

**Given** the `[Unreleased]` section of `CHANGELOG.md`
**When** this change ships
**Then** a user-visible entry summarizes which step defaults changed and the rationale

### AC22: `init-config` ships new defaults

**Given** a user runs `/nmg-sdlc:init-config` on a fresh project
**When** `sdlc-config.json` is written
**Then** it contains the new defaults verbatim (no template placeholders left for per-step model/effort)

### AC23: `upgrade-project` surfaces curated diff

**Given** an existing `sdlc-config.json` with the previous defaults
**When** `/nmg-sdlc:upgrade-project` runs interactively
**Then** it plays back an old-vs-new diff for the changed step defaults with a batch-approve option
**And** in unattended mode, the diff is reported in the summary but not auto-applied (consistent with existing value-drift rules)

### AC24: Test suite passes with new defaults

**Given** `scripts/__tests__/sdlc-runner.test.mjs`
**When** the suite runs against the new defaults
**Then** all tests pass, including coverage for: `xhigh` accepted, `max` rejected, effort-on-gpt-5.4-mini rejected, and new global default (`gpt-5.4` / `medium`) resolving correctly

### AC25: Guardrails documented

**Given** the feature's `design.md`
**When** a reviewer reads the rationale
**Then** the document explicitly addresses:
- How the new defaults avoid re-triggering the GPT-5.5 rate-limit patterns (`specs/bug-model-rate-limits/`)
- Why `implement` at `xhigh` remains within the 150-turn / 30-min budget on large issues
- Why `monitorCI` at `gpt-5.4`/`medium` retains enough headroom to diagnose + fix CI failures

### AC26: `verify` step sizing is evidence-backed

**Given** `verify` performs checklist validation **and** applies auto-fixes
**When** the spec phase selects model/effort for `verify`
**Then** the choice is justified against the fix-application workload (not just checklist validation)
**And** the candidate comparison (`gpt-5.4/high`, `gpt-5.5/medium`, `gpt-5.5/high`) is captured in `design.md`

### AC27: `xhigh` is accepted; `max` is rejected

**Given** `scripts/sdlc-runner.mjs:26` `VALID_EFFORTS`
**When** `validateConfig()` runs
**Then** `'xhigh'` is an allowed value
**And** `'max'` is explicitly rejected with an error message stating that `max` is intentionally excluded from nmg-sdlc defaults

### AC28: Effort on GPT-5.4 Mini steps is rejected

**Given** a step config with `"model": "gpt-5.4-mini"` and any `"effort"` value
**When** `validateConfig()` runs
**Then** validation fails with an error explaining that GPT-5.4 Mini does not support the effort parameter

### AC29: Effort tier literal names match OpenAI's spec

**Given** the runner's allowed effort tiers
**When** tier strings are compared to OpenAI's documented names
**Then** the runner accepts `low`, `medium`, `high`, `xhigh` verbatim (literally `xhigh`, not `x-high`, `extra-high`, or `xtra-high`)

### AC30: Per-step defaults match the reference table

**Given** the shipped example config
**When** each step is inspected
**Then** model/effort/maxTurns/timeoutMin match this table:

| Step | Model | Effort | Turns | Time | Rationale |
|---|---|---|---|---|---|
| `startCycle` | `gpt-5.4-mini` | — | 10 | 5 | Single `gh` query; effort unsupported on GPT-5.4 Mini |
| `startIssue` | `gpt-5.4` | `low` | 25 | 5 | Mechanical: `gh issue develop`, branch setup |
| `writeSpecs` | `gpt-5.5` | `xhigh` | 60 | 15 | OpenAI: "start with xhigh for coding and agentic" |
| `implement` | `gpt-5.5` | `xhigh` | 150 | 30 | Long-horizon agentic coding; current `medium` under-provisions |
| `verify` | `gpt-5.5` | `high` | 100 | 20 | Reasoning + fixes; `high` is the balance sweet spot |
| `commitPush` | `gpt-5.4-mini` | — | 15 | 5 | Deterministic git ops; effort unsupported |
| `createPR` | `gpt-5.4` | `low` | 45 | 5 | Template-driven PR body + version bump |
| `monitorCI` | `gpt-5.4` | `medium` | 60 | 20 | Must diagnose CI + apply minimal fixes |
| `merge` | `gpt-5.4-mini` | — | 10 | 5 | Single `gh pr merge`; effort unsupported |

> **Note:** The Turns column reflects the AC36 floors (supersedes the initial values proposed in the issue body; see AC35–AC37 and the Addendum below).

### AC31: Global runner defaults follow the hard cap

**Given** `resolveStepConfig()` fallback to module defaults
**When** a step and global config both omit `model`/`effort`
**Then** the default is `gpt-5.4` / `medium` (cost-aware; no GPT-5.5 by default)

### AC32: Skills declare model and effort in frontmatter

**Given** any nmg-sdlc `SKILL.md` file that participates in the SDLC pipeline (`draft-issue`, `start-issue`, `write-spec`, `write-code`, `verify-code`, `open-pr`, `run-retro`, `setup-steering`, `init-config`, `run-loop`, `upgrade-project`)
**When** Codex loads the skill for manual invocation
**Then** the frontmatter declares a `model` field matching the runner's per-step model
**And** declares an `effort` field when the model supports effort (GPT-5.5 or GPT-5.4), using the same value as the runner's per-step effort
**And** omits the `effort` field when the model is GPT-5.4 Mini

### AC33: Frontmatter values match runner config

**Given** the reference table in AC30 and the skill-to-step mapping
**When** runner config is compared with runner config
**Then** corresponding values match exactly:
- `write-spec` → `model: gpt-5.5, effort: xhigh`
- `write-code` → `model: gpt-5.5, effort: xhigh`
- `verify-code` → `model: gpt-5.5, effort: high`
- `start-issue` → `model: gpt-5.4, effort: low`
- `open-pr` → `model: gpt-5.4, effort: low`
- `draft-issue` → `model: gpt-5.4, effort: medium` (interview work benefits from balanced effort)
- `run-retro` → `model: gpt-5.5, effort: high` (defect-pattern analysis)
- `setup-steering` → `model: gpt-5.5, effort: high` (steering doc creation)
- `init-config` → `model: gpt-5.4-mini` (mechanical template substitution; no effort)
- `run-loop` → `model: gpt-5.4, effort: low` (spawns subprocess; no heavy reasoning)
- `upgrade-project` → `model: gpt-5.5, effort: high` (diff + judgment work)

### AC34: Precedence is documented

**Given** README.md's model/effort guidance section
**When** a user reads about interactive vs unattended behavior
**Then** the precedence chain is documented:
`model_reasoning_effort env var (runner)` > `runner config` > `session /model / /effort` > `model default`

---

## Issue #130 Addendum — Blanket maxTurns Bump (#181 incident)

A recent runner failure on issue #181 in a downstream repo (agentchrome) surfaced that the current `maxTurns` budgets — particularly for `verify` (60) — are too tight for real work. The architecture-reviewer subagent terminated mid-exploration via `error_max_turns` after 819s, triggered the consecutive-escalation failure-loop guard, and exited the runner. Since this spec already revisits the full per-step config surface, the `maxTurns` column is revised alongside the `model`/`effort` tuning. The related false-positive pattern-matcher defect that compounded #181 is tracked as issue #133 (out of scope here).

### AC35: Every step's `maxTurns` budget is revisited with headroom

**Given** OpenAI's current GPT-5.5 / GPT-5.4 / GPT-5.4 Mini lineup and observed real-world runner behavior (issue #181 evidence)
**When** each step's `maxTurns` value is proposed
**Then** the value has at least 50% headroom above the longest-observed successful run of that step in collected telemetry, or (if telemetry is absent for that step) is conservatively sized at no less than the floors in AC36
**And** `design.md` records the evidence or the conservative-floor rationale per step

### AC36: Proposed `maxTurns` floors per step

**Given** the shipped example config (`scripts/sdlc-config.example.json`)
**When** each step's `maxTurns` is inspected
**Then** values meet or exceed these floors:

| Step | Current | Proposed floor | Rationale |
|---|---|---|---|
| `startCycle` | 5 | 10 | Issue picker may need to inspect multiple open issues before selecting |
| `startIssue` | 15 | 25 | `gh issue develop` plus branch hygiene and initial state capture |
| `writeSpecs` | 40 | 60 | Three-document synthesis (requirements, design, tasks) on non-trivial features |
| `implement` | 100 | 150 | Long-horizon coding with test runs and self-review loops |
| `verify` | 60 | 100 | Checklist validation **plus** architecture-reviewer subagent **plus** auto-fix application (verify exhausted 60 turns on #181) |
| `commitPush` | 10 | 15 | Git operations + optional pre-commit hook retry |
| `createPR` | 30 | 45 | Version bump, CHANGELOG update, PR body generation |
| `monitorCI` | 40 | 60 | CI failure diagnosis can require multiple investigation rounds |
| `merge` | 5 | 10 | `gh pr merge` plus post-merge branch cleanup retries |

### AC37: AC30's Turns column is updated to match AC36

**Given** the reference table in AC30
**When** implementation lands
**Then** the `Turns` column of AC30 is updated to match the AC36 floors exactly (the two tables remain internally consistent)
**And** `timeoutMin` values are reviewed for each bumped step and raised proportionally where the old value would be saturated by the new turn budget

### Generated Gherkin Preview

```gherkin
Feature: Per-step model and effort level configuration
  As a developer or SDLC automation agent
  I want per-step model and effort level configuration
  So that each SDLC phase uses the optimal model for its task

  Scenario: Per-step model override
    Given a config with step-level model "gpt-5.5" for writeSpecs and global model "gpt-5.4"
    When the runner executes the writeSpecs step
    Then the Codex subprocess is invoked with "--model gpt-5.5"

  Scenario: Per-step effort override
    Given a config with step-level effort "medium" for startIssue and global effort "high"
    When the runner executes the startIssue step
    Then the subprocess environment includes "model_reasoning_effort=medium"

  Scenario: Implement step uses single invocation
    Given a config with implement step configuration
    When the runner executes the implement step
    Then a single runCodex call is made (not two sequential phases)
    And the subprocess uses "--model gpt-5.5" and "model_reasoning_effort=medium" by default

  Scenario: Implement step prompt omits EnterPlanMode warning
    Given the runner builds the prompt for step 4
    When the prompt is constructed
    Then it does not contain "Do NOT call EnterPlanMode"

  Scenario: Backward compatibility without per-step config
    Given a config with only global model "gpt-5.5" and no per-step overrides
    When the runner executes any step
    Then the Codex subprocess uses "--model gpt-5.5"
    And no model_reasoning_effort is set

  Scenario: Legacy plan/code config is ignored gracefully
    Given a config with plan and code sub-objects under steps.implement
    When the runner validates the config
    Then no validation errors are raised
    And the step-level model and effort are used

  Scenario: Config validation rejects invalid effort
    Given a config with effort value "maximum"
    When the runner starts
    Then it exits with a non-zero code and an error message about invalid effort

  Scenario: Create PR step defaults to 30 maxTurns
    Given the default sdlc-config.example.json
    When the createPR step configuration is read
    Then maxTurns is 30

  Scenario: Writing-specs unattended-mode always amends existing spec
    Given unattended-mode is active
    And spec discovery finds a matching existing feature spec
    When the skill decides whether to amend or create
    Then it proceeds directly in amendment mode without calling interactive prompt
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add per-step `model` field to runner step config with global fallback | Must | `step.model \|\| config.model \|\| 'gpt-5.5'` |
| FR2 | Add per-step `effort` field to runner step config with global fallback | Must | `step.effort \|\| config.effort \|\| undefined` |
| FR3 | Set `model_reasoning_effort` env var on Codex subprocess when effort is configured | Must | Only set when a value is resolved; omit entirely when no effort is configured |
| ~~FR4~~ | ~~Always split write-code into plan + code phases~~ | ~~Must~~ | Superseded by FR11 |
| FR5 | Update `sdlc-config.example.json` with per-step model/effort defaults | Must | Match the recommendations matrix from the issue |
| FR6 | Add runner `model` config to all SKILL.md files | Must | Enforced by Codex at runtime for manual users |
| FR7 | Add model/effort recommendations table to README | Should | Helps users understand and customize the defaults |
| FR8 | Validate `effort` values against `['low', 'medium', 'high']` at config load time | Must | Fail fast with descriptive error |
| FR9 | Validate `model` values are non-empty strings at config load time | Must | Prevent empty/null from reaching `--model` |
| FR10 | Preserve backward compatibility for configs without per-step overrides | Must | Existing configs must continue to work unchanged |
| FR11 | Remove `runImplementStep()` and route Step 4 through the standard `runCodex()` path | Must | Single invocation matches all other steps |
| FR12 | Remove `resolveImplementPhaseConfig()` function | Must | No longer needed without plan/code split |
| FR13 | Update default model to `gpt-5.5` and effort to `medium` for the implement step in `sdlc-config.example.json` | Must | Flat config, no nested `plan`/`code` objects |
| FR14 | Remove nested `plan`/`code` config from `sdlc-config.example.json` | Must | Simplify to flat step config |
| FR15 | Simplify Step 4 prompt in `buildCodexArgs()` to remove "Do NOT call EnterPlanMode" instruction | Must | Skill handles unattended-mode internally |
| FR16 | Update `validateConfig()` to stop validating `plan`/`code` sub-objects (ignore gracefully) | Should | Legacy configs should not break |
| FR17 | Increase `createPR` step default `maxTurns` to 30 in `sdlc-config.example.json` | Must | PR creation needs more turns for version bumping |
| FR18 | Fix write-spec unattended-mode spec discovery to skip `interactive prompt` and directly amend | Must | Current instruction says "auto-select Option 1" which is fragile; should skip the prompt entirely |
| FR19 | Update `scripts/sdlc-config.example.json` per the AC30 table (with AC36 turn floors) | Must | Issue #130 |
| FR20 | Enforce GPT-5.5 hard cap (writeSpecs, implement, verify only) | Must | Issue #130 — AC17 |
| FR21 | Change `resolveStepConfig()` defaults to `gpt-5.4` / `medium` (sdlc-runner.mjs:221–226) | Must | Issue #130 — AC19, AC31 |
| FR22 | Expand `VALID_EFFORTS` to `['low', 'medium', 'high', 'xhigh']`; keep `max` rejected | Must | Issue #130 — AC27, AC29 |
| FR23 | Reject `effort` on GPT-5.4 Mini steps in `validateConfig()` with a clear message | Must | Issue #130 — AC28 |
| FR24 | Rewrite `README.md` recommendations table with rationale column | Must | Issue #130 — AC20 |
| FR25 | Add `[Unreleased]` CHANGELOG entry with rationale and migration note | Must | Issue #130 — AC21 |
| FR26 | Update `scripts/__tests__/sdlc-runner.test.mjs`: cover `xhigh` accept, `max` reject, gpt-5.4-mini+effort reject, new global defaults | Must | Issue #130 — AC24 |
| FR27 | `upgrade-project` surfaces a curated "recommended defaults" diff (interactive only) with batch-approve | Must | Issue #130 — AC23 |
| FR28 | Validate `init-config` template substitution preserves new defaults verbatim | Must | Issue #130 — AC22 |
| FR29 | Document `max`-exclusion and gpt-5.4-mini-no-effort rules as user-facing guidance in README | Should | Issue #130 |
| FR30 | `design.md` cites OpenAI's published effort-level guidance with source links | Should | Issue #130 |
| FR31 | Add runner `model`/`effort` config to all SDLC skills per AC33 mapping | Must | Issue #130 — AC32, AC33 |
| FR32 | Document precedence chain in README (env var > frontmatter > session > default) | Must | Issue #130 — AC34 |
| FR33 | Update `scripts/sdlc-config.example.json` `maxTurns` values per AC36 floors | Must | Issue #130 addendum — AC35, AC36 |
| FR34 | Review and adjust `timeoutMin` alongside `maxTurns`; pair rationale in `design.md` | Must | Issue #130 addendum |
| FR35 | Add a dedicated `[Unreleased]` CHANGELOG bullet for the turn-budget revision citing #181 | Must | Issue #130 addendum |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | No measurable overhead — config field resolution is O(1) string lookup per step |
| **Reliability** | Runner fails fast on invalid config before spawning any subprocesses |
| **Compatibility** | Cross-platform: effort env var works on macOS, Linux, and Windows |
| **Maintainability** | New config fields follow the same pattern as existing `maxTurns`/`timeoutMin` per-step overrides |

---

## Dependencies

### Internal Dependencies
- [x] `sdlc-runner.mjs` — existing `buildCodexArgs()` and step config merging infrastructure
- [x] `sdlc-config.example.json` — existing config template
- [x] All `SKILL.md` files — existing skill definitions (11 skills)
- [x] `write-code/SKILL.md` — already has unattended-mode support (line 22)

### External Dependencies
- [x] Codex CLI `--model` flag — already supported
- [x] `model_reasoning_effort` env var — already supported by Codex
- [x] SKILL.md runner `model` field — already supported by Codex

### Blocked By
- None

---

## Out of Scope

- Automatic model selection based on task complexity or token usage
- Dynamic effort adjustment during a step
- ~~Per-skill effort in SKILL.md frontmatter (not supported by Codex — effort is session-level via env var)~~ **Reversed by issue #130** — Codex now supports `effort` in runner config; AC32/AC33 require it.
- Changes to the architecture-reviewer agent's model declaration (already hardcoded to GPT-5.5)
- Per-step temperature or max-token configuration
- Changes to `write-code` SKILL.md itself (its unattended-mode logic is already correct) — issue #130 only adds frontmatter
- Changes to the plugin manifest model field

### Out of Scope (Issue #130)

- Adding new runner config fields beyond existing `model`/`effort`/`maxTurns`/`timeoutMin`
- Changing fallback-chain semantics (`step → global → default`)
- Creating new skills or slash commands
- Empirical live SDLC dry-runs as a merge gate (unit tests + docs only for this issue)
- Backporting defaults to v1 releases
- Adding the `max` effort tier to the allowlist — explicit policy exclusion
- Refactoring any non-runner component
- Collecting new telemetry before proposing turn values — the AC36 floors are conservative starting points; telemetry-driven tuning is a future issue
- Modifying the runner's failure-loop guard or `IMMEDIATE_ESCALATION_PATTERNS` — the pattern-matcher false-positive is tracked as #133

---

## Open Questions

- [x] Should the implement split be opt-in or always-on? **Decision (issue #77)**: Always-on — the split is mandatory. **Reversed by issue #91**: The split is removed; a single invocation is used. The skill's unattended-mode handles planning internally.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #77 | 2026-02-22 | Initial feature spec |
| #91 | 2026-02-23 | Replace plan/code phase split with single write-code invocation; supersede AC3/FR4; add AC10–AC15, FR11–FR18; increase createPR maxTurns to 30; fix write-spec unattended-mode spec discovery |
| #130 | 2026-04-18 | Optimize runner + skill defaults for GPT-5.5 / GPT-5.4 / GPT-5.4 Mini lineup; add `xhigh` effort tier; reject `max` and GPT-5.4 Mini+effort; shift global default to `gpt-5.4`/`medium`; hard-cap GPT-5.5 to `writeSpecs`/`implement`/`verify`; declare `model`/`effort` in runner config; blanket `maxTurns` bump motivated by #181; document precedence chain |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements
- [x] All criteria are testable and unambiguous
- [x] Edge cases and error states specified (AC4 backward compat, AC9 validation, AC13 legacy config)
- [x] Dependencies identified
- [x] Out of scope is defined
