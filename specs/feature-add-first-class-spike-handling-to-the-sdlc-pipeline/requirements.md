# Requirements: First-Class Spike Handling for the SDLC Pipeline

**Issues**: #99
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley

---

## User Story

**As a** developer starting a research or evaluation task in any consumer project
**I want** a dedicated spike template in `/draft-issue` and a research-only pipeline in `/write-spec`
**So that** spike issues produce a committed ADR + implementation issue(s) via a PR to main — never code — without requiring mid-flight scope pivots

---

## Background

The SDLC currently treats every issue as a shippable change: `/write-spec` generates a requirements/design/tasks tree, `/write-code` implements it, `/open-pr` bumps the version and ships. This shape breaks for research spikes where the deliverable is a *decision plus a decomposition*, not a PR's worth of code.

This pattern emerged organically on nmg-game-dev issue #5 (texture-generation spike): `/write-spec` produced a conventional feature spec, the user correctly identified it was undersized, and recovery required manual post-hoc research, umbrella-spec rewriting, and 15 child issues. The work was correct but ad-hoc. The `spike` label already exists (seeded by `/onboard-project`) but no SDLC skill reads it.

Codifying spike handling as a first-class variant — parallel to the existing `bug` variant — ensures the next spike doesn't require the user to drag the skill out of shape through review gates. It also provides a formal "Defer to spike" exit from the `/write-spec` Phase 1 interview (added by #94) so unanswered questions can be graduated to a spike issue without abandoning the current spec.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Spike Template in `/draft-issue`

**Given** a user describes a research or evaluation task in `/draft-issue`
**When** the issue-type classification prompt is shown
**Then** a Spike option is available alongside Feature, Bug, and Epic
**And** selecting it automatically applies the `spike` label
**And** the issue body is populated from a spike-specific template containing Research Questions, Candidate Set (if known), Time-box, Expected Output Shape (ADR / umbrella+children / single-PR), and Honest-Gap Protocol sections

### AC2: `/write-spec` Spike Detection and Phase 0

**Given** a GitHub issue has the `spike` label
**When** the user runs `/write-spec #N`
**Then** the skill runs Phase 0: Research (via `agents/spike-researcher.md`)
**And** Phase 1 SPECIFY, Phase 2 PLAN, and Phase 3 TASKS are skipped entirely
**And** the spike pipeline ends after Phase 0 + `/open-pr`

### AC3: Phase 0 Produces a Committed ADR and GitHub Artifact

**Given** Phase 0 research has completed
**When** the Human Review Gate is presented
**Then** a gap-analysis ADR has already been committed to `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md` **before** the gate (not after)
**And** the user chooses one of three scope shapes:
- single-PR — findings appended to the spike issue
- umbrella+children — new umbrella issue created with ADR summary, child implementation issues linked back to the spike
- re-scope+redraft — spike issue edited with refined scope before `/write-spec` re-runs

### AC4: `/open-pr` No Version Bump for Spikes

**Given** a branch contains a spike-labelled issue's research spec
**When** the user runs `/open-pr #N`
**Then** the skill creates a PR to main containing the ADR and any committed spec files
**And** the version in `VERSION`, `plugin.json`, and `marketplace.json` is **not** bumped
**And** `CHANGELOG.md` is **not** updated

### AC5: `/write-code` and `/verify-code` Abort on Spike Issues

**Given** a GitHub issue has the `spike` label
**When** the user runs `/write-code #N` or `/verify-code #N`
**Then** the skill aborts immediately with the message: _"Spikes don't produce code — run `/open-pr` to merge the research spec"_
**And** no code files are modified
**And** no verification report is posted

### AC6: Defer-to-Spike Option in `/write-spec` Phase 1 Interview

**Given** `/write-spec` has entered the Phase 1 interview because the issue has open or unresolved questions
**When** the user is presented with options to answer a question
**Then** a "Defer to spike" option is available in the menu
**And** selecting it creates a spike issue for the unanswered question (via the `/draft-issue` spike template)
**And** the current issue is marked as blocked on the new spike issue (via a `Depends on: #spike-N` body edit)

### AC7: `references/spike-variant.md` Added

**Given** any SDLC skill encounters the `spike` label
**When** it reads the variant-dispatch logic
**Then** it loads `skills/write-spec/references/spike-variant.md` (parallel to `skills/write-spec/references/defect-variant.md`)
**And** the reference documents the full spike pipeline shape, Phase 0 agent invocation, HRG options, and the no-code invariant

### AC8: `references/umbrella-mode.md` Added

**Given** `/write-spec` runs the Seal-Spec Flow or a spike's Phase 0 chooses umbrella+children
**When** it needs to create the umbrella structure
**Then** it reads `skills/write-spec/references/umbrella-mode.md`
**And** the reference formalizes the `## Multi-PR Rollout` heading as the trigger, the child-issue body template, the `Depends-on-parent: #N` line convention, and the `epic-child-of-<N>` label naming

### AC9: `/run-retro` Spike ADR Aging Detection

**Given** the retrospective runs and spike ADRs exist in `docs/decisions/`
**When** any ADR was committed more than 6 months ago
**Then** `/run-retro` surfaces it as a re-spike candidate in the retrospective output
**And** the output includes: the original decision summary, the ADR commit date, and a suggested re-evaluation rationale

### AC10: Spike-Labelled Issues Skip Spec Discovery

**Given** an issue has the `spike` label
**When** `/write-spec` reaches Spec Discovery
**Then** parent-link resolution and keyword-based discovery are bypassed
**And** the skill proceeds directly to Phase 0 regardless of any existing feature spec

### AC11: Unattended Mode Auto-Approves Phase 0 HRG

**Given** `.claude/unattended-mode` exists when `/write-spec #N` runs on a spike-labelled issue
**When** Phase 0 completes
**Then** the Phase 0 HRG applies the deterministic default: umbrella+children when the research finds ≥ 2 independent implementation components, else single-PR
**And** no `AskUserQuestion` is called
**And** a one-line divergence note is emitted (e.g., `Unattended mode: Phase 0 HRG applied deterministic default (umbrella+children)`)

### Generated Gherkin Preview

```gherkin
Feature: First-Class Spike Handling
  As a developer starting a research or evaluation task
  I want a dedicated spike template and research-only pipeline
  So that spike issues produce a committed ADR without mid-flight scope pivots

  Scenario: Spike option appears in /draft-issue classification
    Given I am drafting a research task in /draft-issue
    When the issue-type classification prompt is shown
    Then a Spike option is offered alongside Feature, Bug, and Epic
    And selecting it applies the spike label and spike body template

  Scenario: /write-spec runs Phase 0 research on spike-labelled issues
    Given issue #N carries the spike label
    When I run /write-spec #N
    Then Phase 0 runs the spike-researcher agent
    And Phases 1–3 are skipped

  # ... (full scenarios in feature.gherkin)
```

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `/draft-issue` adds a Spike classification option with a spike-specific body template | Must |
| FR2 | Spike template includes Research Questions, Candidate Set, Time-box, Expected Output Shape, and Honest-Gap Protocol sections | Must |
| FR3 | `/draft-issue` automatically applies the `spike` label when Spike is selected | Must |
| FR4 | `/write-spec` detects the `spike` label via `gh issue view #N --json labels --jq '.labels[].name'` | Must |
| FR5 | Phase 0 spawns `agents/spike-researcher.md` with the issue body and steering context as input | Must |
| FR6 | Phase 0 commits the gap-analysis ADR to `docs/decisions/` before the HRG is presented (not optional) | Must |
| FR7 | The Phase 0 HRG offers three scope shapes: single-PR, umbrella+children, re-scope+redraft | Must |
| FR8 | `/open-pr` detects the `spike` label and skips version bump, CHANGELOG, and VERSION updates | Must |
| FR9 | `/write-code` detects the `spike` label and aborts with the specified message | Must |
| FR10 | `/verify-code` detects the `spike` label and aborts with the specified message | Must |
| FR11 | `/write-spec` Phase 1 interview includes a "Defer to spike" option when open questions are present | Must |
| FR12 | Selecting "Defer to spike" creates a spike issue via the spike template and marks the current issue blocked | Must |
| FR13 | `skills/write-spec/references/spike-variant.md` is added parallel to `defect-variant.md` | Must |
| FR14 | `skills/write-spec/references/umbrella-mode.md` is added | Must |
| FR15 | `/run-retro` scans `docs/decisions/` for spike ADRs and computes each ADR's age from its commit date | Should |
| FR16 | ADRs older than 6 months are flagged as re-spike candidates in the retrospective output | Should |
| FR17 | In unattended mode, Phase 0 HRG auto-approves using the deterministic-default gate: umbrella+children when multi-component, else single-PR | Could |
| FR18 | Spike-labelled issues skip Spec Discovery (parent-link and keyword) and proceed directly to Phase 0 | Must |
| FR19 | `steering/tech.md` Version Bump Classification table adds a `spike` row marked as "skip" so the rule is editable without skill edits | Must |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Stack-agnostic** | Spike variant must not hardcode a research domain, language, or tool — steering docs provide specifics; the spike-researcher agent only consumes issue body + steering |
| **OS-agnostic** | ADR file creation and commit must use cross-platform paths (forward slashes, `node:path` if any script involved); date slug format `YYYY-MM-DD` works on all platforms |
| **Unattended-mode safe** | Phase 0 HRG and Defer-to-Spike interview option both honor `.claude/unattended-mode` per the deterministic-default pattern — no blocking prompts under automation |
| **Idempotency** | Re-running `/write-spec #N` on a spike-labelled issue detects an existing ADR in `docs/decisions/` and does not create a duplicate |
| **Traceability** | The committed ADR filename includes the spike issue number (or slug) so downstream tooling (run-retro ADR-aging scan) can link ADR → originating issue |

---

## Data Requirements

### Input Data (Phase 0)

| Source | Used For |
|--------|----------|
| GitHub issue body | Spike template sections — Research Questions, Candidate Set, Time-box, Expected Output Shape, Honest-Gap Protocol |
| `steering/product.md` | User persona and product vision context |
| `steering/tech.md` | Technology constraints the research must respect |
| `steering/structure.md` | Code organization patterns for downstream decomposition |

### Output Data (Phase 0)

| Artifact | Location | Content |
|----------|----------|---------|
| Gap-analysis ADR | `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md` | Decision summary, alternatives considered, honest gaps, recommendation |
| Scope shape | One of: spike-issue-comment / umbrella-issue / redrafted-spike-issue | Set by Phase 0 HRG |
| Child issues (if umbrella+children) | GitHub issues with `Depends-on-parent: #umbrella-N` body lines | Child implementation scope |

---

## Dependencies

### Internal Dependencies
- [x] `spike` GitHub label exists (seeded by `/onboard-project`)
- [x] `/write-spec` Phase 1 interview added by #94 (provides the insertion point for the "Defer to spike" option)
- [x] Seal-Spec Flow in `/write-spec` (umbrella+children scope shape calls into this unchanged)
- [x] `references/unattended-mode.md` gate semantics (deterministic-default pattern used in Phase 0 HRG)

### External Dependencies
- [x] `gh` CLI (already required — no new external dep)

### Blocked By
- None

---

## Out of Scope

- Changes to the Seal-Spec Flow mechanism itself — the spike variant calls into it as-is
- Automating the spike/not-spike judgment — the user always applies the label via `/draft-issue`
- Non-GitHub issue trackers
- Changes to `/open-pr`'s normal version-bump path for non-spike issues
- Automating child-issue content generation — Phase 0 surfaces research; the user decides decomposition at the HRG
- Migrating existing closed issues to the spike type (going forward only)
- Retrospective analysis of ADR *content* — FR15/16 only flag ADRs by age, not quality

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Spike-labelled issues reach a PR without scope pivots | 100% of spikes after the variant lands | Manual review of the next 3 spike issues after merge |
| Phase 0 produces a committed ADR before the HRG | 100% of spike runs | Grep `docs/decisions/` for matching ADR before HRG output in session log |
| Unattended-mode spike runs complete without escalation | ≥ 1 end-to-end automation cycle | SDLC runner logs show no escalation for a spike-labelled issue |

---

## Open Questions

- None — the issue body was complete; gap detection found no signals.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #99 | 2026-04-23 | Initial feature spec |

---

## Validation Checklist

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements (design.md will map to files)
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases (unattended mode, idempotent re-run, skip discovery) are specified
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented (or resolved)
