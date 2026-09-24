# Defect Report: Treat old smoke failure as historical across changed verification identity

**Issue**: #423
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

## Reproduction

Plugin #418 retains failed `.omp/sdlc/verification/418.json` and its clone from smoke #133. At a changed candidate head, the fresh explicit queue is #135, with no matching recovery-store owner. `inspectLegacySmokeFailure` rejects the old failed request and its #133 execute evidence as invalid; the registered provider stops before cloning #135.

## Expected vs Actual

| | Behavior |
|---|---|
| **Expected** | An unambiguously different, internally attributable old verification identity or queue is retained as history; the fresh request takes the normal clone/baseline/owned-controller path without replaying or deleting old evidence. |
| **Actual** | Old identity or queue mismatch returns `invalid`, blocking fresh verification with `nmg-sdlc-smoke legacy recovery evidence invalid`. |

## Acceptance Criteria

### AC1: Different historical attempt

**Given** one older failed smoke artifact with a coherent different exact verification identity or proven different smoke queue, and no current recovery-store owner
**When** a new registered verification starts
**Then** the provider ignores the old artifact as recovery authority and starts a new clone and baseline for the explicit current queue
**And** preserves the artifact and old retained clone without replay or deletion.

### AC2: Same-attempt unsafe evidence

**Given** an artifact attributable to the current exact identity and queue but malformed, ambiguous, nonterminal or lacking nested delivery proof
**When** legacy recovery is inspected
**Then** it fails closed with the existing actionable legacy-evidence diagnostic, without new clone or duplicate dispatch.

### AC3: Valid same-attempt recovery

**Given** a legitimate exact-identity failed delivery with valid legacy evidence
**When** the provider resumes
**Then** it uses the existing bounded recovery and at-most-once path, not a new nested dispatch.

### AC4: Registered consumer gate

**Given** fresh smoke #135 for changed-head plugin #418
**When** registered verification runs from the same plugin worktree
**Then** it reaches the owned controller instead of stopping at legacy preflight
**And** only an actual new exact-head MERGED implementation PR and CLOSED smoke issue can pass the gate.
