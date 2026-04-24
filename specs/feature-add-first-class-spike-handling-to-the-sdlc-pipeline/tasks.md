# Tasks: First-Class Spike Handling for the SDLC Pipeline

**Issues**: #99
**Date**: 2026-04-23
**Status**: Planning
**Author**: Rich Nunley

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 2 | [ ] |
| Plugin-Shared Artifacts | 5 | [ ] |
| Skill Integrations | 8 | [ ] |
| Testing | 2 | [ ] |
| **Total** | **17 tasks** | |

**Skill-Bundled routing**: Every task that edits a SKILL.md, a file under `skills/*/references/`, a file at `references/` root, or an `agents/*.md` must route through `/skill-creator` per `steering/tech.md` → "Authoring rule". The `spec-implementer` agent enforces this via the SKILL-BUNDLED FILE DETECTOR in `agents/spec-implementer.md`. There is no hand-edit fallback — if `/skill-creator` is unavailable, the task escalates and the implementation halts.

---

## Phase 1: Setup

### T001: Add `spike` row to Version Bump Classification table

**File(s)**: `steering/tech.md`
**Type**: Modify
**Depends**: None
**Routing**: Direct `Edit` — steering docs are not skill-bundled.
**Acceptance**:
- [ ] Under `## Versioning` → `### Version Bump Classification`, insert a new row:
  ```
  | `spike` | skip | Research-only PR — no release, no bump |
  ```
- [ ] The `skip` verdict is documented in prose immediately after the table so readers understand it is a special value (not a placeholder)
- [ ] No other rows are modified

**Notes**: This row is read by `references/version-bump.md` (Task T014) as the canonical declaration; the spike-skip logic itself is implemented in `version-bump.md`.

### T002: Document `docs/decisions/` directory convention

**File(s)**: `README.md` (Repository Structure section), `CLAUDE.md` (Repository Structure section)
**Type**: Modify
**Depends**: None
**Routing**: Direct `Edit` — root docs are not skill-bundled.
**Acceptance**:
- [ ] `README.md` lists `docs/decisions/` as the ADR directory with a one-line description noting it is created on first spike
- [ ] `CLAUDE.md` Repository Structure section lists `docs/decisions/` with the same description
- [ ] No `docs/decisions/.gitkeep` file is created — the directory is created on demand by `/write-spec` Phase 0

**Notes**: The directory does not need to pre-exist. Phase 0 creates it via the directory-create-on-write pattern (`mkdir -p docs/decisions` before the file write).

---

## Phase 2: Plugin-Shared Artifacts

### T003: Create `agents/spike-researcher.md`

**File(s)**: `agents/spike-researcher.md`
**Type**: Create
**Depends**: None
**Routing**: `/skill-creator` — `agents/*.md` is skill-bundled per `steering/tech.md`.
**Acceptance**:
- [ ] YAML frontmatter includes: `name: spike-researcher`, `description` naming the Phase 0 research purpose and auto-invocation by `write-spec`, `tools: Read, Glob, Grep, WebSearch, WebFetch` (no Write/Edit), `model: opus`, `skills: write-spec`
- [ ] "When Auto-Invoked" section points to `/write-spec` Phase 0
- [ ] "Research Process" section enumerates: read issue body + steering docs, enumerate candidate set, research each option, identify honest gaps, recommend
- [ ] "Output" section specifies the structured markdown contract with sections: Research Goal, Candidate Set, Findings, Honest Gaps, Recommendation, Decomposition (including `component-count: N`), References
- [ ] The agent does NOT call `EnterPlanMode`, does NOT use `Task` to spawn subagents, and does NOT write files (per `steering/structure.md` → Agent Contracts)

### T004: Create `skills/write-spec/references/spike-variant.md`

**File(s)**: `skills/write-spec/references/spike-variant.md`
**Type**: Create
**Depends**: T003
**Routing**: `/skill-creator` — per-skill reference.
**Acceptance**:
- [ ] "Detecting the variant" section covers the `gh issue view #N --json labels | grep spike` check
- [ ] "Skipping Spec Discovery" sentence explicitly states the bypass
- [ ] "Phase 0 procedure" describes the 13-step flow from `design.md` § Phase 0 Flow
- [ ] Interactive HRG menu with three options (single-PR, umbrella+children, re-scope+redraft)
- [ ] Unattended deterministic default: `component-count >= 2 → umbrella+children`, else `single-PR`; re-scope+redraft is never auto-selected; divergence note format specified
- [ ] Idempotency rule: detect existing `docs/decisions/*-#{N}-gap-analysis.md` and skip to HRG
- [ ] No-code invariant: requirements.md / design.md / tasks.md / feature.gherkin are NEVER produced for spike issues
- [ ] Points to `references/umbrella-mode.md` for the umbrella+children shape and to `../../references/unattended-mode.md` for the deterministic-default gate semantics

### T005: Create `skills/write-spec/references/umbrella-mode.md`

**File(s)**: `skills/write-spec/references/umbrella-mode.md`
**Type**: Create
**Depends**: None
**Routing**: `/skill-creator` — per-skill reference.
**Acceptance**:
- [ ] Documents the `## Multi-PR Rollout` heading as the trigger (mirrors the Seal-Spec Flow's existing rule in `skills/write-spec/SKILL.md` § 3b)
- [ ] Child issue body template includes a `Depends on: #{umbrella-N}` line convention (the epic-child-downgrade rule in `references/version-bump.md` § 4a already parses this)
- [ ] Label naming: children carry `epic-child-of-{N}` plus their type label
- [ ] Creation procedure: via `/draft-issue` batch mode seeded from the design's Delivery Phases table
- [ ] Cross-references three authoritative sources (Seal-Spec Flow in `write-spec/SKILL.md`, Epic Coordination template in `draft-issue/references/multi-issue.md`, version-bump downgrade in `open-pr/references/version-bump.md`) so readers know which file owns which behaviour

### T006: Create `skills/draft-issue/references/spike-template.md`

**File(s)**: `skills/draft-issue/references/spike-template.md`
**Type**: Create
**Depends**: None
**Routing**: `/skill-creator` — per-skill reference.
**Acceptance**:
- [ ] Frontmatter `**Consumed by**: draft-issue Step 6` and `**Triggering condition**: classification === 'spike'` (parallel shape to `feature-template.md` and `bug-template.md`)
- [ ] Template markdown block contains sections: Spike Summary, Research Questions, Candidate Set, Time-box, Expected Output Shape (with the three checkboxes from design.md), Honest-Gap Protocol, Out of Scope
- [ ] "Authoring Guidance" section matches the style of the other two templates (title starts with a verb like "Evaluate" / "Investigate"; typically no ACs — the spike deliverable is the ADR)

### T007: Create `skills/run-retro/references/adr-aging.md`

**File(s)**: `skills/run-retro/references/adr-aging.md`
**Type**: Create
**Depends**: None
**Routing**: `/skill-creator` — per-skill reference.
**Acceptance**:
- [ ] Documents `Glob docs/decisions/*.md` + `git log --follow --format=%aI -- {file}` to compute ADR ages
- [ ] Age threshold: 180 days (6 months) — flagged ADRs become re-spike candidates
- [ ] Output format: a "Re-Spike Candidates" section appended to `steering/retrospective.md` with columns `ADR | Age (days) | Original decision summary`
- [ ] Section is **omitted** from retrospective output when no ADRs are > 180 days old
- [ ] Graceful degradation: if `docs/decisions/` does not exist, the reference is not even loaded (Step 1.6 guards this)

---

## Phase 3: Skill Integrations

### T008: Add Spike Detection to `skills/write-spec/SKILL.md`

**File(s)**: `skills/write-spec/SKILL.md`
**Type**: Modify
**Depends**: T004, T005
**Routing**: `/skill-creator` — SKILL.md edit.
**Acceptance**:
- [ ] Insert a new `## Spike Detection` section immediately after the existing `## Defect Detection` section (between line ~70 and the Phase 1 heading)
- [ ] The new section contains the `gh issue view #N --json labels --jq '.labels[].name'` snippet followed by `Read references/spike-variant.md when any label is spike` — using the same reference-pointer grammar as defect detection
- [ ] The Spike Detection section states precedence: spike takes precedence over defect (a label-carrying issue is never both at the same time, but the rule is spelled out)
- [ ] The `## Spec Discovery` section gains one sentence: `Spike-labelled issues skip Spec Discovery entirely (same as bug-labelled issues) and proceed directly to Phase 0 per references/spike-variant.md.`
- [ ] No changes to Phase 1/2/3 steps — the variant pointer in Spike Detection short-circuits the workflow

### T009: Add "Defer to spike" option to `skills/write-spec/references/interview.md`

**File(s)**: `skills/write-spec/references/interview.md`
**Type**: Modify
**Depends**: T004, T006, T010 (needs `/draft-issue` spike path working)
**Routing**: `/skill-creator` — per-skill reference.
**Acceptance**:
- [ ] The two-option `AskUserQuestion` menu for "Unresolved Open Questions" gaps on **feature issues** is expanded to three options: `[1] Answer`, `[2] Defer to spike`, `[3] Skip — leave unresolved`
- [ ] Bug-labelled issues keep the existing two-option menu (defer-to-spike does not apply to bug repro gaps per design.md)
- [ ] Selecting `[2] Defer to spike` documents the procedure: derive a spike title from the gap question, run `/draft-issue` in spike-template mode (or directly `gh issue create --label spike --body "..."` using the spike template), capture the new issue number, edit the current issue's body to add `Depends on: #{spike-N}`, thread a placeholder into the requirements draft (`See spike #{spike-N} for resolution`)
- [ ] Unattended mode: the spike-deferral path is not auto-selected (skip is still the unattended default for unresolved questions) — document this explicitly

### T010: Add Spike classification to `skills/draft-issue/SKILL.md`

**File(s)**: `skills/draft-issue/SKILL.md`
**Type**: Modify
**Depends**: T006
**Routing**: `/skill-creator` — SKILL.md edit.
**Acceptance**:
- [ ] Step 2 classification `AskUserQuestion` adds a fourth option: `"Spike" — A research/evaluation task producing a decision (ADR) not code`
- [ ] `classification` enum extended: `∈ {feature, bug, epic, spike}`
- [ ] Step 6 template dispatch adds: `Read references/spike-template.md when classification === 'spike'.`
- [ ] Step 8 label application adds: `Spike → spike` (lazily create with color `0052CC` if absent); `automatable` does NOT apply to spikes
- [ ] Step 5b Automation Eligibility question is skipped entirely when `classification === 'spike'` (spikes are not automation-eligible by default)

### T011: Add Step 1.5 abort to `skills/write-code/SKILL.md`

**File(s)**: `skills/write-code/SKILL.md`
**Type**: Modify
**Depends**: T004 (spike variant needs to be real before abort behavior is meaningful)
**Routing**: `/skill-creator` — SKILL.md edit.
**Acceptance**:
- [ ] New `### Step 1.5: Spike Abort` section inserted between Step 1 (Identify Context) and Step 2 (Read Specs)
- [ ] Section contains the `gh issue view #N --json labels --jq '.labels[].name'` check
- [ ] On `spike` label: print exactly `Spikes don't produce code — run /open-pr to merge the research spec` and exit 0
- [ ] The skill does NOT read specs, does NOT enter plan mode, does NOT call `spec-implementer` when the abort fires
- [ ] The abort fires in both interactive and unattended modes (it is a correctness guard, not a user-preference question)

### T012: Add Step 1.5 abort to `skills/verify-code/SKILL.md`

**File(s)**: `skills/verify-code/SKILL.md`
**Type**: Modify
**Depends**: T004
**Routing**: `/skill-creator` — SKILL.md edit.
**Acceptance**:
- [ ] New `### Step 1.5: Spike Abort` section inserted between Step 1 (Load Specifications) and Step 2 (Load Issue)
- [ ] Section body matches T011 — same detection check, same fixed message, exit 0
- [ ] The skill does NOT post a verification report to the issue when the abort fires
- [ ] The skill does NOT call the architecture-reviewer subagent when the abort fires

### T013: Modify `skills/open-pr/SKILL.md` Step 2 guard

**File(s)**: `skills/open-pr/SKILL.md`
**Type**: Modify
**Depends**: T001, T014
**Routing**: `/skill-creator` — SKILL.md edit.
**Acceptance**:
- [ ] Step 2 header's reference pointer is rewritten: `Read references/version-bump.md when a VERSION file exists at the project root AND the issue does not carry the spike label — spike issues skip Steps 2 and 3 entirely. The spike-skip branch is documented in references/version-bump.md § Spike handling.`
- [ ] Step 4 (Generate PR Content) adds a note: when the spike flag is set, the PR body template omits the `Version` line and includes `Type: Spike research (no version bump)`

### T014: Add Spike handling to `skills/open-pr/references/version-bump.md`

**File(s)**: `skills/open-pr/references/version-bump.md`
**Type**: Modify
**Depends**: T001
**Routing**: `/skill-creator` — per-skill reference.
**Acceptance**:
- [ ] New `## Spike handling (no bump)` section at the top of the file (before `## Step 2`)
- [ ] Section body: detect `spike` label via `gh issue view #N --json labels --jq '.labels[].name'`; skip Steps 2 and 3 entirely; do NOT read `VERSION`, do NOT write `CHANGELOG.md`, do NOT write `plugin.json` or `marketplace.json`; record `spike = true` for Step 4 template use
- [ ] Rationale paragraph explains that spike PRs ship only the ADR + spec files and must not roll the version
- [ ] Section notes the `steering/tech.md` Version Bump Classification row as the canonical declaration (T001 added it)

### T015: Add Step 1.6 ADR aging pointer to `skills/run-retro/SKILL.md`

**File(s)**: `skills/run-retro/SKILL.md`
**Type**: Modify
**Depends**: T007
**Routing**: `/skill-creator` — SKILL.md edit.
**Acceptance**:
- [ ] New `### Step 1.6: Scan ADRs for Aging` section inserted between Step 1.5 (Load State) and Step 2 (Filter Eligible Specs)
- [ ] Section uses the standard pointer grammar: `Read references/adr-aging.md when docs/decisions/ exists — the reference covers scanning ADR files, reading commit dates, flagging ADRs older than 6 months, and emitting re-spike candidate rows.`
- [ ] If `docs/decisions/` does not exist, the step is skipped (no error, no warning)
- [ ] Step 7 (Write Retrospective Document) adds a mention that the ADR aging section is appended when `adr-aging.md` found re-spike candidates

---

## Phase 4: Testing

### T016: Create `specs/feature-add-first-class-spike-handling-to-the-sdlc-pipeline/feature.gherkin`

**File(s)**: `specs/feature-add-first-class-spike-handling-to-the-sdlc-pipeline/feature.gherkin`
**Type**: Create
**Depends**: None (authored alongside the spec per `/write-spec` convention)
**Routing**: Direct `Write` — not skill-bundled (it is a spec artefact).
**Acceptance**:
- [ ] Valid Gherkin syntax
- [ ] One Scenario per AC1–AC11 from `requirements.md`
- [ ] Feature description matches the user story (`As a developer … / I want … / So that …`)
- [ ] Concrete examples — use real-looking data (issue numbers, slugs, file paths)
- [ ] Scenarios are independent (no shared mutable state)
- [ ] Declarative style — describe *what*, not *how*

### T017: Define exercise-test matrix for `/verify-code`

**File(s)**: Documented in this `tasks.md` (no new file)
**Type**: Verify (no file changes)
**Depends**: T008–T015
**Routing**: N/A — verification task.
**Acceptance**:
- [ ] `/verify-code` Step 5a detects all six modified SKILL.md files + new references + new agent as plugin changes → triggers exercise testing
- [ ] Exercise plan covers each AC per design.md § Testing Strategy (11 exercise scenarios)
- [ ] Each exercise runs against a disposable test project with steering/ scaffolded (per `steering/structure.md` → Test Project Scaffolding)
- [ ] Exercise results are recorded in the verification report with pass/fail per AC
- [ ] Any exercise that cannot be run automatically (e.g., multi-turn interactive HRG without Agent SDK) is explicitly noted for manual follow-up rather than silently skipped

---

## Dependency Graph

```
T001 ─┬────────────────────────────────────┐
      │                                    │
      └─▶ T014 ──▶ T013                    │
                                           │
T002                                       │
                                           │
T003 ──▶ T004 ──┬──▶ T008                 │
                │                          │
                ├──▶ T011                  │
                │                          │
                └──▶ T012                  │
                                           │
        T005 ─────▶ T008                   │
                                           │
        T006 ─────▶ T010 ──▶ T009          │
                            │              │
                            └──▶ T004 ────┘ (T009 depends on T004 transitively)
                                           │
        T007 ─────▶ T015                   │
                                           │
        T010 ─────▶ T009                   │
                                           │
  All Phase 3 done ──▶ T017                │
                                           │
  T016 authored alongside this tasks.md ──┘
```

**Critical path**: T003 (spike-researcher agent) → T004 (spike-variant.md) → T008 (write-spec SKILL.md) → T017 (exercise testing).

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #99 | 2026-04-23 | Initial feature spec |

---

## Validation Checklist

- [x] Each task has single responsibility
- [x] Dependencies are correctly mapped (see graph above)
- [x] Tasks can be completed independently (given dependencies)
- [x] Acceptance criteria are verifiable
- [x] File paths reference actual project structure (per `structure.md`)
- [x] Test tasks are included — T016 for Gherkin scenarios, T017 for exercise testing coverage
- [x] No circular dependencies (T003 / T006 / T010 chain is linear)
- [x] Tasks are in logical execution order — Setup → References → Skill Integrations → Testing
- [x] Skill-bundled routing documented on every applicable task
