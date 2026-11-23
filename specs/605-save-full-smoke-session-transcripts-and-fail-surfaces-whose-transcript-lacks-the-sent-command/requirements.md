# Defect Report: Save full smoke session transcripts and fail surfaces whose transcript lacks the sent command

**Issue**: #605
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code

## Reproduction

1. Run the pre-merge gate's `repository.nmg-sdlc-smoke` validation so the verify worker drives an interactive surface such as `/sdlc-draft-issue` in tmux, as `steering/snippets/project-smoke.md` directs.
2. Open the saved `.nmg-sdlc/smoke/surfaces/draft-issue.log`.
3. It holds only about the last screen; the sent command and earlier dialogs are missing, and the surface still passes.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Each saved transcript contains the interactive session for its surface from the sent command to completion, and a surface record whose transcript does not contain the record's sent command fails the gate with a reason naming the transcript |
| **Actual** | Transcripts hold about one screen, and the gate passes them |

## Acceptance Criteria

### AC1: Saved transcripts cover the whole session

**Given** the smoke instructions for driving an interactive surface in tmux
**When** a surface session runs longer than one screen and its transcript is saved as instructed
**Then** the transcript contains the sent command and the session output through completion

### AC2: A transcript without the sent command fails the surface

**Given** a surface record with `"status": "passed"` whose transcript file does not contain the record's `command` text
**When** the smoke validation checks the record
**Then** the surface fails with `nmg-sdlc-smoke surface not exercised: <surface>` and a reason stating the transcript lacks the sent command

### AC3: Complete transcripts still pass

**Given** a current, passed surface record whose transcript contains the record's `command` text
**When** the smoke validation checks the record
**Then** the surface passes as before

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The smoke instructions capture each surface session's output, from the sent command to completion, into the surface's `.log` | Must |
| FR2 | The surface record check fails a record whose transcript does not contain its `command` text, ignoring whitespace | Must |
| FR3 | Existing record checks (repo, surface, head, status, command, issue, transcript location and type) are unchanged | Must |

## Out of Scope

- Changing which surfaces are exercised or how sessions are driven
- Retaining transcripts beyond the gate's existing record directory

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #605 | 2026-11-23 | Initial defect report |
