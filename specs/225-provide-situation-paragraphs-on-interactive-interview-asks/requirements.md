# Requirements: Provide situation paragraphs on interactive interview asks

**Issue**: #225
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/209-remove-draft-issue-run-total-ask-quota/

---

## User Story

**As a** developer running interactive `/sdlc-*` commands in Oh My Pi
**I want** each interview or preference question to include a short paragraph of situation
**So that** I can choose an option without reconstructing context from the chat transcript

---

## Background

Interactive commands use built-in `ask` for preferences and tradeoffs. The shared contract in `references/interactive-gates.md` requires 2–4 options, recommended-first ordering, and at most three questions per call. It does not require the `question` to restate the situation that makes those options meaningful. Required canned gates stay short by design. Interview and preference probes may still be asked as bare labels.

This issue covers interview and preference asks on `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, and `/sdlc-run-retro`. The required vehicle is a short paragraph in the `question` field. The `ask` schema is unchanged.

---

## Acceptance Criteria

### AC1: Interview asks include a situation paragraph

**Given** an interactive `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, or `/sdlc-run-retro` session is about to ask an interview or preference question
**When** it calls `ask`
**Then** the `question` includes a short paragraph stating the situation and the facts needed to choose among the shown options
**And** the user can select an option from that prompt without relying on earlier chat text

### AC2: Required canned gates stay canned

**Given** draft-issue classification, milestone, or split confirmation, or write-spec continue/finish
**When** that required gate runs
**Then** the existing canned question and option labels remain
**And** those gates are not required to add a situation paragraph

### AC3: Paragraph stays short and existing ask shape is preserved

**Given** an interview or preference ask needs context
**When** the workflow composes the question
**Then** it uses a short paragraph, not the full need statement or issue body
**And** the call still has 2–4 options, recommended first, and at most three questions
**And** `ask` is still not used for final draft approval or "does this match"

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Interview and preference `ask` questions in draft-issue, write-spec, onboard-project, upgrade-project, and run-retro include a short situation paragraph | Must | Vehicle is the `question` field |
| FR2 | The shared interactive interview contract documents that requirement | Must | `references/interactive-gates.md` Interview section |
| FR3 | Classification, milestone, split, and write-spec continue/finish wording stay as they are | Must | Also leave draft-issue need-gather when `$ARGUMENTS` is absent unchanged |
| FR4 | Existing per-call shape, preference-only use, and no-review-ask rules stay | Must | 2–4 options, recommended first, max 3 questions per call |
| FR5 | Contract tests fail if the interview references drop the situation-paragraph requirement | Should | Extend `scripts/__tests__/interactive-plan-contract.test.mjs` |
| FR6 | Per-option `description` may still be used but is not the required vehicle for the paragraph | Could | Do not change the `ask` schema |

---

## Out of Scope

- Changing the Oh My Pi `ask` tool schema or UI
- Adding situation paragraphs to classification, milestone, split, need-gather when `$ARGUMENTS` is absent, or write-spec continue/finish
- Automated `/sdlc-execute` workers and other non-interactive skills
- Changing interview budgets or adding review/approval asks

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #225 | 2026-08-23 | Initial feature spec |
