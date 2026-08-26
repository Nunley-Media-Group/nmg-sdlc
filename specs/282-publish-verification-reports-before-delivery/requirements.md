# Defect Report: Publish verification reports before delivery

**Issue**: #282
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/7-verify-code-skill/

---

## User Story

**As a** developer running nmg-sdlc execute
**I want** passed verification evidence published before delivery
**So that** the required report cannot make the delivery worktree dirty

## Background

Verify-code writes `specs/N-SLUG/verification-report.md` after implementation and review commits are published. It currently writes a passed handoff without committing the report. `sdlc-deliver` then correctly rejects the dirty worktree. This generic lifecycle gap deadlocks otherwise successful delivery.

**Version bump**: patch

## Acceptance Criteria

### AC1: Passed reports are published

**Given** verification produces a valid Pass or PR Evidence Pending report
**When** verification finalizes
**Then** the exact report is staged, committed conventionally, and pushed without force before the passed handoff is written

### AC2: Delivery receives a clean published head

**Given** report publication succeeds
**When** execute advances to delivery
**Then** the branch is synchronized with its upstream
**And** no non-runtime path is dirty
**And** delivery observes the published report head

### AC3: Unexpected changes fail closed

**Given** a non-runtime path other than the active verification report is dirty
**When** verification finalizes
**Then** it writes a failed intervention handoff
**And** delivery does not start

### AC4: Git failures fail closed

**Given** staging, committing, upstream resolution, or pushing the report fails
**When** verification finalizes
**Then** it writes a stable failed intervention handoff
**And** never claims the report was published

### AC5: Resume is idempotent

**Given** the identical report is already committed and published
**When** verification resumes
**Then** it creates no empty commit
**And** may pass only after proving the branch is synchronized and clean

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Add a deterministic report-publication controller used by verify-code. | Must |
| FR2 | Permit only the active report as a non-runtime dirty path. | Must |
| FR3 | Exclude `.omp/` runtime state from publication and cleanliness decisions. | Must |
| FR4 | Commit only when the report differs from HEAD; never create empty commits. | Must |
| FR5 | Push without force and require a synchronized upstream before passing. | Must |
| FR6 | Controller writes and validates the verify handoff; prompt prose cannot invent it. | Must |
| FR7 | Add stack-agnostic regression coverage for publish, resume, unexpected dirt, and git failures. | Must |

## Out of Scope

- Weakening `sdlc-deliver` cleanliness checks.
- Publishing product changes from verification.
- Project-specific versioning or test commands.
- Rewriting report content or verification outcomes.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #282 | 2026-08-26 | Initial approved bug-fix spec |
