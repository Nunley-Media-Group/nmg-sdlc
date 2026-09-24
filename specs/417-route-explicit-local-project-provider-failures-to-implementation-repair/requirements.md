# Defect Report: Route explicit local project-provider failures to implementation repair

**Issue**: #417
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

## Bug Report
A required registered project provider that executes a deterministic local test command can report `failed` while the controller treats every `project.*` failure as external intervention. MileDar #169 retains a failed robot-integration artifact at head `226c77f7ede44a987db5936f624dd82012df49a2`: Kubernetes/Tilt/API/device were ready, Flutter integration tests passed eight cases before a repeated login hit API 5/15m shared-IP rate limiting. API Jest and Flutter unit/widget passed. No failure is a passing gate.

## Root Cause Analysis
`scripts/verification-readiness.mjs` recognizes only failed required `builtin.command` results as actionable; the project result has no repairability field. The finalizer and execute recovery therefore cannot return this local fixture/runtime defect to implementation. Adding a required marker alone cannot recover the retained five-key artifact without changing the consumer's steering identity and head.

**User Confirmed**: Yes

## Acceptance Criteria
### AC1: Explicit new provider contract
**Given** a registered, required, applicable project provider executes a deterministic local test command and reports failed with a valid explicit repairability signal and command evidence
**When** verification classifies the exact issue/head, complete-coverage artifact
**Then** it may route to implementation repair without changing the failed result or reporting a pass.

### AC2: Fail closed on prerequisites and unsupported evidence
**Given** a missing or malformed repairability signal, invalid envelope or identity, absent command execution evidence, readiness/cluster/device failure, missing credentials, incomplete external prerequisite, unrelated external failure, stale head, or incomplete coverage
**When** recovery is evaluated
**Then** it remains intervention; neither summary prose nor a bare failed project status authorizes repair.

### AC3: Recover the retained pre-marker artifact without rewriting it
**Given** a pre-marker artifact whose exact SHA-256 digest, issue, head, failed handoff, owner and branch are operator-authorized for one recovery
**When** the controller evaluates the retained MileDar #169 artifact
**Then** an explicit one-use override can consume the original evidence and route to implement without changing the artifact/report, trusting a summary string, or bypassing the failed gate.

### AC4: Restore ordinary lifecycle with bounded authority
**Given** a valid actionable failed verify handoff and no previous consumption
**When** the owning controller resumes
**Then** it returns to standard implement ownership and subsequently reruns both reviews and every gate; a foreign owner, changed head, or repeated consumption remains blocked.

## Functional Requirements
| ID | Requirement | Priority |
|---|---|---|
| FR1 | Validate an optional explicit failed local-command provider signal without relaxing existing provider result shape or identity. | Must |
| FR2 | Bind repair classification to registered validation, required applicability, exact issue/head and complete coverage. | Must |
| FR3 | Provide one-use digest-bound operator authorization for legacy unmarked evidence without rewriting that evidence. | Must |
| FR4 | Reuse existing verify-to-implement recovery, report publication, worker ownership, reviews and verification gates. | Must |

## Out of Scope
- Editing MileDar #169, its fixture, steering, or retained artifact.
- Treating a failed or incomplete gate as passed; weakening project readiness or credential checks.
- Creating Herdr workspaces, tabs, named sessions, or servers for this plugin issue.
