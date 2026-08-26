# Defect Report: Navigate paginated wrapped review branch picker

**Issue**: #274
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/208-replace-execute-simplify-with-two-branch-to-main-review-and-fix-panes/

---

## User Story

**As a** Herdr operator running `/sdlc-execute`
**I want** review workers to select the repository default branch from OMP's paginated branch picker
**So that** repositories with many long branch names can complete controller-owned review gates

## Background

OMP 18.0.5 renders `/review` branch choices as a wrapped, paginated terminal list when a repository has enough long branch names. Only the current page is visible. `isCompleteWrappedReviewBranchPicker()` currently reconstructs rendered fragments against the complete Git branch list and requires the default branch to appear exactly once. A valid first page is therefore rejected when `main` is off-screen, no navigation keys are sent, and execute stops with `review_failed` before the project-aware review prompt is submitted.

This is an nmg-sdlc review-picker parser/controller defect. Project steering is outside the failure boundary.

**Version bump**: patch

---

## Acceptance Criteria

### AC1: Recognize a complete paginated wrapped picker

**Given** OMP renders a structurally complete wrapped branch picker page
**And** the visible rows reconstruct to one contiguous segment of the known Git branch order
**And** exactly one visible option owns the cursor
**When** the repository default branch is outside that page
**Then** execute recognizes the branch picker without requiring every branch or `main` to be visible

### AC2: Select the default branch from the current option

**Given** a recognized branch picker whose cursor is on a known branch
**When** execute selects the repository default branch
**Then** it sends deterministic directional key events from the current branch index to the default branch index
**And** sends Enter after navigation
**And** waits for the review worker to start and settle before submitting the project-aware review prompt

### AC3: Preserve fail-closed picker validation

**Given** terminal content is partial, malformed, ambiguous, unrelated, has no cursor, has multiple cursors, or cannot reconstruct to a unique contiguous known-branch segment
**When** execute observes it
**Then** it does not send branch-selection keys
**And** the review step fails closed with `review_failed`

### AC4: Preserve review lifecycle variants

**Given** fresh or retained review workers use existing numbered, unnumbered, wrapped, or paginated wrapped picker layouts
**When** execute drives review1 or review2
**Then** existing supported layouts continue to select the repository default branch
**And** project steering remains uninvolved until branch selection and host review complete

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Parse visible wrapped fragments as a unique contiguous segment of `git branch -a --format=%(refname:short)` output rather than requiring the complete branch list. | Must |
| FR2 | Require the picker title, navigation footer, at least two complete visible options, and exactly one cursor on the first fragment of its option. | Must |
| FR3 | Compute directional navigation from the parsed cursor branch to the repository default branch and append Enter. | Must |
| FR4 | Use existing Herdr argument-array calls, wait boundaries, handoff behavior, and `review_failed` stop semantics. | Must |
| FR5 | Add fresh-worker and retained-worker regression coverage using a paginated first page with wrapped long names and off-screen `main`. | Must |

## Out of Scope

- Changing OMP or Herdr picker rendering.
- Changing project steering, review prompts, review findings, or fix-pane behavior.
- Adding fuzzy branch-name matching or guessing unknown picker rows.
- Changing the repository default-branch discovery contract.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #274 | 2026-08-26 | Initial bug-fix spec |
