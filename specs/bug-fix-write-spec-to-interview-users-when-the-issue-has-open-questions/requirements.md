# Defect Report: Fix write-spec to interview users when the issue has open questions

**Issue**: #94
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley
**Severity**: Medium
**Related Spec**: `specs/feature-write-spec-skill/`

---

## Reproduction

### Steps to Reproduce

1. Create a GitHub issue via `/draft-issue` whose body contains an `## Open Questions` section with at least one unresolved item, or whose acceptance criteria are vague/underspecified (e.g., ACs that reference undefined terms, or FRs without priorities).
2. Run `/start-issue #N` to create the branch.
3. Run `/write-spec #N` in interactive mode (no `.codex/unattended-mode` sentinel present).
4. Observe Phase 1 (SPECIFY) behavior.

### Environment

| Factor | Value |
|--------|-------|
| **Plugin** | `nmg-sdlc` |
| **Affected skill** | `skills/write-spec/SKILL.md` |
| **Affected reference** | `skills/write-spec/references/review-gates.md` (Phase 1 template) |
| **Plugin version** | 1.55.0 |
| **Mode** | Interactive (and the bug is specifically about interactive mode — unattended is the intentional bypass) |

### Frequency

Always — the skill has no interview step, so it bypasses interviewing on every run regardless of issue quality.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Before writing `requirements.md`, `/write-spec` inspects the issue body for unresolved open questions or underspecified acceptance criteria. When gaps are detected in interactive mode, it asks the user (via `interactive prompt`) to resolve them, then incorporates the answers into the drafted requirements. When the issue is well-specified, the interview is skipped. In unattended mode, the interview is bypassed automatically. |
| **Actual** | `/write-spec` Phase 1 reads the issue and writes `requirements.md` directly — no detection of open questions, no interview. The Phase 1 review gate's `**Open Questions**` field is purely display (copied forward from the issue), not an actionable step. |

### Relevant Code References

- `skills/write-spec/SKILL.md` Phase 1 / Process (steps 1–6) jumps from "Read the issue" to "Create `requirements.md`" with no interview step in between.
- `skills/write-spec/references/review-gates.md` Phase 1 Requirements Summary template renders `**Open Questions**: [list any, or "None"]` as display output, but nothing in the workflow acts on unresolved items before the file is written.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Interview Fires on Open Questions (Interactive Mode)

**Given** a GitHub issue whose body contains an `## Open Questions` section with at least one unresolved item
**And** `.codex/unattended-mode` does not exist
**When** `/write-spec #N` runs
**Then** before `requirements.md` is written, the skill calls `interactive prompt` for each unresolved open question
**And** the user's answers are incorporated into the drafted `requirements.md` (resolved items do not appear in the final `## Open Questions` section of the spec)

### AC2: Interview Fires on Underspecified Acceptance Criteria (Interactive Mode)

**Given** a GitHub issue whose acceptance criteria are underspecified (e.g., ACs missing Given/When/Then structure, ACs that reference undefined terms, or an empty/missing Acceptance Criteria section)
**And** `.codex/unattended-mode` does not exist
**When** `/write-spec #N` runs
**Then** before `requirements.md` is written, the skill asks targeted clarifying questions via `interactive prompt`
**And** the answers shape the ACs written into `requirements.md`

### AC3: Adaptive Skip for Well-Specified Issues

**Given** a GitHub issue with no `## Open Questions` section (or an empty one) and well-formed Given/When/Then acceptance criteria
**And** `.codex/unattended-mode` does not exist
**When** `/write-spec #N` runs
**Then** the interview step detects no gaps and is skipped without calling `interactive prompt`
**And** the skill proceeds directly to drafting `requirements.md`

### AC4: Unattended Mode Bypasses the Interview

**Given** an issue with open questions or underspecified ACs
**And** `.codex/unattended-mode` exists (headless run)
**When** `/write-spec #N` runs
**Then** the interview step does NOT call `interactive prompt`
**And** the skill proceeds directly to drafting `requirements.md` using only the issue body
**And** a one-line log note is emitted stating that the interview was bypassed due to unattended mode (per the unattended-mode logging convention)

### AC5: Amendment Mode Still Runs the Interview

**Given** Spec Discovery resolves to an existing feature spec (amendment mode)
**And** the amending issue has open questions or underspecified ACs
**And** `.codex/unattended-mode` does not exist
**When** `/write-spec #N` runs
**Then** the interview fires for the new-issue gaps before the amendment is applied to `requirements.md`
**And** the answers influence only the appended content — existing ACs/FRs remain unchanged

### AC6: Bug-Labelled Issues Get a Tailored Interview

**Given** a bug-labelled issue with missing reproduction steps, environment info, or an unclear root-cause hypothesis
**And** `.codex/unattended-mode` does not exist
**When** `/write-spec #N` runs
**Then** the interview probes defect-specific gaps (reproduction, expected-vs-actual, root cause) rather than feature-scope questions
**And** the answers populate the defect requirements template accordingly

### AC7: Gap Detection Is Documented and Bounded

**Given** the skill is entering Phase 1
**When** gap detection runs
**Then** the set of gap signals is explicitly documented in the skill (not inferred silently)
**And** the interview asks at most a bounded number of questions per run (to prevent runaway prompting on pathologically vague issues)
**And** if detection is inconclusive, the skill proceeds without interviewing and notes the decision in the spec body (e.g., under `## Open Questions`)

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add a gap-detection step to `skills/write-spec/SKILL.md` Phase 1, fired after reading the issue and before any requirements drafting (applies to both creation and amendment modes). | Must |
| FR2 | The gap-detection step detects at minimum: (a) a non-empty `## Open Questions` section in the issue body, (b) missing or structurally malformed acceptance criteria (no Given/When/Then in any AC), (c) for bug-labelled issues, missing reproduction steps or missing expected-vs-actual. | Must |
| FR3 | When gaps are detected in interactive mode, fire `interactive prompt` one question per gap (up to a bounded max; the skill documents the cap), free-text allowed via the "Other" affordance, and thread the answers into the drafted spec. | Must |
| FR4 | When no gaps are detected, skip the interview entirely — no `interactive prompt` call, no interactive friction. | Must |
| FR5 | When `.codex/unattended-mode` exists, bypass the interview as a pre-approved gate per `references/unattended-mode.md` and emit the required one-line divergence note. | Must |
| FR6 | When amendment mode is active, run the interview against the amending issue's gaps only; never re-interview about already-approved spec content. | Should |
| FR7 | Tailor the interview's question set to the issue classification (feature vs. defect) so bug-labelled issues probe defect-specific gaps (reproduction, root cause) instead of scope/AC questions. | Should |
| FR8 | Record any unresolved questions that remained after the interview (e.g., user declined to answer, or the cap was reached) in the spec's `## Open Questions` section so downstream phases and reviewers can see them. | Should |

---

## Out of Scope

- Introducing a `draft-issue`-parity adaptive-depth heuristic (the three-signal `filesFound` / `componentsInvolved` / `descriptionVagueness` system). A lighter gap-detection-driven approach is sufficient.
- Changes to `/draft-issue` or its interview mechanism.
- Reshaping the Phase 1 review gate UI or the `**Open Questions**` display field in `references/review-gates.md` (the field remains a display summary — the new interview is a separate pre-write step).
- Changes to unattended-mode mechanics or the sentinel file, beyond honoring the pre-approved bypass for the new step.
- Interviewing during Phase 2 (Design) or Phase 3 (Tasks) — this defect is scoped to Phase 1 only.
- Retroactively re-interviewing on already-drafted specs (the interview fires at Phase 1 entry, not on re-runs against existing `requirements.md`).

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed (Medium)
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included (AC3 — adaptive skip must not regress well-specified issues)
- [x] Fix scope is minimal — no feature work mixed in (interview is the fix; no changes to gate UI, draft-issue, or sentinel mechanics)
- [x] Out of scope is defined

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #94 | 2026-04-23 | Initial defect report |
