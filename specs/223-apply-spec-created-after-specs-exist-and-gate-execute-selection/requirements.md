# Requirements: Apply spec-created after specs exist and gate execute selection

**Issue**: #223
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## User Story

**As a** developer running nmg-sdlc in Oh My Pi / Herdr
**I want** GitHub issues that have specs to carry a `spec-created` label, and `/sdlc-execute` to run only those issues, with a picker when I omit issue numbers
**So that** I execute specified work on purpose instead of silently picking any open issue

---

## Background

Write-spec, onboard, and upgrade can leave issue-owned spec packages in `specs/{N}-*/` while GitHub still looks unspecified. Execute today auto-selects the lowest unblocked open issue via `selectBacklog()` when arguments are empty. Labels are fetched and unused for eligibility. There is no GitHub label for “this issue has a spec,” so a specified backlog is invisible in `gh issue list` and empty `/sdlc-execute` never asks which specified issue to run.

---

## Acceptance Criteria

### AC1: Write-spec applies spec-created

**Given** `/sdlc-write-spec` successfully publishes an approved spec package for issue #N
**When** that publication completes
**Then** GitHub issue #N has the `spec-created` label
**And** applying the label a second time leaves the issue labeled once

### AC2: Empty execute presents specified issues

**Given** one or more open GitHub issues have the `spec-created` label
**When** `/sdlc-execute` is invoked with no issue numbers
**Then** every open `spec-created` issue is presented for interactive selection
**And** only the chosen issues enter the execute queue
**And** issues without `spec-created` do not appear

### AC3: Explicit list skips the picker and refuses unlabeled issues

**Given** `/sdlc-execute` is invoked with a single issue number or a comma-separated or whitespace-separated list
**When** any listed issue lacks `spec-created`
**Then** the picker is not shown
**And** no worker starts for any listed issue
**And** the command names each listed issue that lacks `spec-created`

### AC4: Labeled explicit list runs in listed order

**Given** every listed issue has `spec-created`
**When** `/sdlc-execute` is invoked with that single, comma-separated, or whitespace-separated list
**Then** the picker is not shown
**And** those issues enter the execute queue in listed order, duplicates removed first-occurrence-first

### AC5: Empty specified backlog starts nothing

**Given** no open GitHub issue has `spec-created`
**When** `/sdlc-execute` is invoked with no issue numbers
**Then** no unlabeled issues are presented
**And** no execute queue starts

### AC6: Upgrade labels issues that have specs

**Given** the project has unique `specs/{N}-*/` packages whose files declare `**Issue**: #N
**When** `/sdlc-upgrade-project` is applied
**Then** each corresponding GitHub issue receives `spec-created` if it was missing
**And** issues with no such spec package are not labeled

### AC7: Onboard labels issues that have specs

**Given** `/sdlc-onboard-project` creates or reconciles unique `specs/{N}-*/` packages whose files declare `**Issue**: #N
**When** onboarding completes
**Then** each corresponding GitHub issue has `spec-created`
**And** greenfield onboarding that creates an empty `specs/` tree adds no issue labels

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | After successful write-spec publication, apply GitHub label `spec-created` to that issue; create the repo label if it does not exist | Must | Label apply is part of `merge` success |
| FR2 | `/sdlc-execute` may start workers only for issues that have `spec-created` | Must | Live already-started workers may continue |
| FR3 | `/sdlc-execute` with no numbers interactively presents all open `spec-created` issues and runs only the selection | Must | Picker is in the execute file-command path, not native `/plan` |
| FR4 | Single, comma-separated, and whitespace-separated issue numbers are explicit lists and skip the picker | Must | Max 20 unique numbers; same usage string |
| FR5 | `/sdlc-upgrade-project` and `/sdlc-onboard-project` scan issue-owned spec packages and apply `spec-created` without a per-issue confirmation | Must | Unique dir + four files with `**Issue**: #N`; Approved not required |
| FR6 | File-based approved-spec checking remains: a labeled issue whose four-file package is not Approved still prints `Run /sdlc-write-spec #N` and does not start workers | Must | Existing `specStatus` / `isSpecApproved` |
| FR7 | Label application is idempotent and does not remove other labels | Should | `gh issue edit N --add-label spec-created` |

---

## Out of Scope

- Removing `spec-created` from issues that later lose or change spec packages
- Changing `Depends on:` or Project Done handling after a queue is chosen
- Mass-relabeling outside write-spec, onboard, and upgrade
- Epic, spike, or coordination issue types
- Moving `/sdlc-execute` onto native `/plan` or into `INTERACTIVE_COMMANDS`

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #223 | 2026-08-23 | Initial feature spec |
