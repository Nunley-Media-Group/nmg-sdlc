# Add account CSV export

## User Story

**As a** workspace owner
**I want** to export account records as CSV
**So that** I can analyze stored data.

## Acceptance Criteria

### AC1: Export Records

**Given** exportable account records exist
**When** an authorized owner requests CSV
**Then** the response contains escaped CSV rows.

### AC2: Require External Approval

**Given** the CSV export is ready
**When** release is requested
**Then** obtain counsel approval and require the requester to prove ownership before release.

### AC3: Deny Unauthorized Export

**Given** stored authorization data denies access
**When** export is requested
**Then** the service returns 403.

## Out of Scope

- Adding PDF export behavior.
