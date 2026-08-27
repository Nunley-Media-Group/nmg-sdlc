# Feature Requirements: Remove wall-clock timeboxing from SDLC execution

**Issue**: #286
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/214-replace-markdown-steering-with-a-managed-runtime-sdlc-steering-and-deterministic-verification/

---

## User Story

**As a** developer running nmg-sdlc workflows and verification
**I want** healthy work to remain supervised without arbitrary wall-clock deadlines
**So that** long-running delivery and verification complete according to real process state rather than elapsed time

## Background

Current steering validation descriptors require `timeoutMs` in the finite range 1 through 900000. Built-in commands and extension providers are terminated when that deadline elapses. Canonical exercise commands also inject `--timeout-ms` and OMP `--max-time`, while review polling documentation still defines elapsed-time exits. These independent deadlines can terminate healthy work and report a timeout instead of its actual outcome.

The replacement contract is state-based. Missing `timeoutMs` is valid and means no deadline. Current generated and managed descriptors omit the field. A supervised operation terminates only on success, genuine failure, explicit cancellation, or confirmed process loss. Cancellation and process loss clean up the owned process group without affecting unrelated processes.

**Version bump**: minor

## Acceptance Criteria

### AC1: Missing timeout means no deadline

**Given** a steering validation omits `timeoutMs`
**When** the steering runtime validates and executes it
**Then** the descriptor is valid
**And** the command or provider receives no wall-clock deadline
**And** the former finite 1 through 900000 requirement is absent

### AC2: Managed contracts omit finite timeout fields

**Given** project steering is generated, onboarded, upgraded, or checked for drift
**When** canonical validation descriptors are written or compared
**Then** they omit `timeoutMs`
**And** generated documentation and verification commands omit `--timeout-ms`, `--max-time`, and equivalent finite process deadlines
**And** repeated generation remains deterministic

### AC3: Healthy command and provider execution is unbounded

**Given** a built-in command or extension provider remains alive and valid beyond a former deadline
**When** verification supervises it
**Then** elapsed time alone does not terminate it
**And** its eventual success or genuine failure is preserved

### AC4: Herdr and controller waits are unbounded

**Given** an nmg-sdlc Herdr worker or controller operation remains alive
**When** execute or delivery waits for its state transition
**Then** the wait has no finite timeout, poll-count ceiling, or elapsed-time exit
**And** no `--kind pi` worker is started
**And** Herdr is never stopped by this change

### AC5: Explicit cancellation terminates owned work

**Given** a caller explicitly cancels an active command, provider, or exercise child
**When** cancellation is observed
**Then** the owned process group is terminated using platform-appropriate behavior
**And** already-exited processes are tolerated
**And** the outcome is stably classified as cancelled rather than timeout, success, or process loss

### AC6: Confirmed process loss fails closed

**Given** a supervised child or Herdr pane disappears before a valid terminal result
**When** the controller confirms that loss
**Then** waiting ends
**And** remaining owned descendants are cleaned up where applicable
**And** the outcome is a stable process-loss failure
**And** no unrelated process is terminated

### AC7: Canonical verification remains strict

**Given** an applicable required validation
**When** it fails, crashes, returns malformed or stale evidence, is cancelled, or loses its process
**Then** verification remains failed or incomplete according to the existing fail-closed rules
**And** removing deadlines does not weaken identity, evidence, provider, or coverage validation

### AC8: Regression coverage proves state-based termination

**Given** the implementation test suite
**When** focused and full gates run
**Then** tests cover omitted `timeoutMs`, rejection of obsolete timeout-bearing canonical descriptors where managed exactness requires it, long-running healthy execution, explicit cancellation, confirmed process loss, POSIX and Windows cleanup selection, already-exited cleanup, and unbounded Herdr/controller waits

### AC9: Public and managed documentation is synchronized

**Given** users and project workflows consume nmg-sdlc guidance
**When** they read README, workflow references, steering, schemas, generated plans, and changelog
**Then** each current contract describes state-based unbounded supervision
**And** no current canonical instruction prescribes a finite wall-clock deadline

### AC10: Contribution and release proof is complete

**Given** the exact feature-branch HEAD
**When** delivery runs
**Then** all contribution, contract, managed-artifact, workflow exercise, plugin-surface, and live smoke gates pass without finite timeout substitution
**And** that exact verified HEAD is merged through a linked PR
**And** issue #286 closes
**And** the required release is published and installed into the active OMP installation with version proof

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Accept steering validation records without `timeoutMs`; absence means no deadline. | Must |
| FR2 | Remove finite timeout fields and flags from current generated, managed, and canonical verification contracts. | Must |
| FR3 | Supervise commands and providers until real terminal state or explicit cancellation. | Must |
| FR4 | Expose cancellation through an `AbortSignal`-compatible interface without embedding an automatic deadline. | Must |
| FR5 | Terminate only the owned process group, with POSIX and Windows implementations and already-exited tolerance. | Must |
| FR6 | Distinguish cancellation, launch failure, nonzero exit, signal exit, malformed result, and confirmed process loss with stable outcomes. | Must |
| FR7 | Keep Herdr waits and active review/check polling unbounded while the worker/pane remains observable. | Must |
| FR8 | Preserve deterministic steering hashes, validation coverage, evidence identity, and fail-closed aggregation. | Must |
| FR9 | Cover every acceptance criterion through Gherkin plus behavioral or live evidence. | Must |
| FR10 | Publish and prove the installed minor release. | Must |

## Non-Functional Requirements

- Node.js ESM and Node.js 20+ compatibility.
- Cross-platform path and child-process behavior on POSIX and Windows.
- No avoidable polling, allocation, or process spawning.
- No cleanup action may target a process outside the child/process group created by nmg-sdlc.
- Cancellation listeners must be removed after settlement.
- Historical released changelog and superseded spec evidence remain truthful and unchanged.

## Out of Scope

- Adding retries, larger deadlines, watchdog deadlines, or hidden timeout defaults.
- Weakening validation, evidence identity, exact-head delivery, or required-check semantics.
- Replacing `--kind omp` with another Herdr worker kind.
- Stopping or restarting Herdr.
- Rewriting historical released changelog entries or archived verification reports.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #286 | 2026-08-27 | Approved remediation: delivery pending states and execute handoff/screen/review observations remain unbounded while their process is live |
| #286 | 2026-08-27 | Initial approved feature requirements |
