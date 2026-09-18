# Add account CSV export

## User Story

**As a** workspace owner
**I want** to export authorized account records as CSV
**So that** I can analyze stored account data with standard tools.

## Acceptance Criteria

### AC1: Export Authorized Records

**Given** stored authorization data permits the workspace owner to export account records
**When** the owner requests a CSV export
**Then** the response contains one escaped CSV row per authorized account and emits an audit-log record.

### AC2: Deny Unauthorized Export

**Given** the stored ownerId does not match the requesting account
**When** the requester asks for a CSV export
**Then** the service returns 403 without exposing account rows.

### AC3: Bound Export Latency

**Given** the repository benchmark contains 10,000 account records
**When** the CSV export benchmark runs
**Then** p95 generation latency remains below 200 ms.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Generate standards-compliant CSV for authorized stored account records. | Must |
| FR2 | Emit an audit-log record for each completed export. | Must |

## Out of Scope

- Adding PDF export behavior.
