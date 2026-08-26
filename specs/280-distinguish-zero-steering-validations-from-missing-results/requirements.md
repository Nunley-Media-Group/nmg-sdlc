# Defect Report: Distinguish zero steering validations from missing results

**Issue**: #280
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/214-replace-markdown-steering-with-a-managed-runtime-sdlc-steering-and-deterministic-verification/

---

## User Story

**As a** developer using deterministic nmg-sdlc verification
**I want** zero declared validations to remain distinct from missing declared results
**So that** projects without project-specific validation registrations do not deadlock while declared checks still fail closed

## Background

A schema-valid steering manifest may declare `validations: []`. The runtime correctly executes no providers and currently emits `results: []` with `ceiling: null`. The verify-code workflow says “missing results” cap verification at Incomplete without defining whether that means an absent declared result or an empty result array. Workers can therefore reject the valid zero-declaration state as `steering_results_missing` even though the deterministic runner reports success.

The fix must be stack-agnostic. It must make declaration/result coverage machine-readable and preserve fail-closed behavior whenever a declared validation is absent, duplicated, unknown, stale, malformed, or unsuccessful.

**Version bump**: patch

---

## Acceptance Criteria

### AC1: Zero declarations are complete

**Given** a schema-valid steering manifest declares zero validations
**When** deterministic steering verification runs
**Then** the artifact reports zero declared validations and zero recorded results
**And** declaration/result coverage is complete
**And** no verification ceiling is imposed solely because `results` is empty

### AC2: Missing declared results fail closed

**Given** the manifest declares one or more validations
**When** any declared validation has no result
**Then** declaration/result coverage is incomplete
**And** the verification ceiling is `Incomplete`
**And** verify-code cannot report Pass or PR Evidence Pending

### AC3: Duplicate and unknown results fail closed

**Given** deterministic result records are compared with manifest declarations
**When** a validation id is duplicated or a result id was not declared
**Then** coverage is incomplete
**And** the artifact identifies the duplicate or unknown id without accepting the evidence

### AC4: Existing required-result semantics remain authoritative

**Given** declaration/result coverage is complete
**When** verification computes its ceiling
**Then** only applicable required results affect the ceiling under the existing status rules
**And** optional and non-applicable records remain recorded without weakening required checks

### AC5: Every consumer uses one explicit contract

**Given** the runner CLI, verify-code workflow, generated command surface, public documentation, and tests describe deterministic steering results
**When** users or workers interpret an artifact
**Then** they distinguish zero declarations from missing declared results using the machine-readable coverage summary
**And** they do not infer failure from `results.length === 0` alone

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Compute a deterministic declaration/result coverage summary from exact validation ids. | Must |
| FR2 | Treat empty declarations plus empty results as complete. | Must |
| FR3 | Treat missing, duplicate, or unknown result ids as Incomplete before ordinary status ceiling calculation. | Must |
| FR4 | Persist coverage counts and bounded mismatch ids in the verification artifact and runner JSON output. | Must |
| FR5 | Keep existing identity binding, provider invocation, applicability, required-result, stale-evidence, and status semantics unchanged. | Must |
| FR6 | Synchronize workflow, generated command, schema/reference, README, and changelog wording. | Must |
| FR7 | Add stack-agnostic regressions for zero, missing, duplicate, unknown, and complete declaration/result sets. | Must |

## Out of Scope

- Adding project-specific validations to existing projects.
- Automatically deriving executable commands from prose.
- Weakening any declared required validation.
- Changing provider configuration, identity hashes, or applicability conditions.
- PennyScan-specific handling.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #280 | 2026-08-26 | Initial approved bug-fix spec |
