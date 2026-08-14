# Requirements: Cumulative Scope Fixture

**Issues**: #10, #20, #30
**Date**: 2026-08-14
**Status**: Amended
**Author**: Fixture

## Acceptance Criteria

### AC1: Adopted Existing Delivery Contract

**Given** an existing contract
**When** issue #20 adopts it
**Then** it becomes current delivery without changing owner

### AC2: Active Owned Contract

**Given** issue #20
**When** its work runs
**Then** its owned behavior is delivered

### AC3: Future Contract

**Given** future issue #30
**When** issue #20 runs
**Then** future behavior remains excluded

### AC4: Prior Regression Contract

**Given** completed issue #10 behavior
**When** issue #20 is verified
**Then** the declared regression remains preserved

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Existing deliverable adopted by issue #20. | Must |
| FR2 | Active behavior owned by issue #20. | Must |
| FR3 | Future behavior owned by issue #30. | Must |
| FR4 | Prior behavior selected only for regression. | Must |
