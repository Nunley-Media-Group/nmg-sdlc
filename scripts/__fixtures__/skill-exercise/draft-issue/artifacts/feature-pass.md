# Add audit-ready deployment summaries

## User Story

**As a** release maintainer
**I want** deployment summaries to include issue, spec, and verification evidence
**So that** reviewers can confirm release readiness without searching across tools.

## Acceptance Criteria

### AC1: Summary Links Issue Evidence

**Given** a deployment summary is generated
**When** the related issue exists
**Then** the summary includes the issue number, title, and URL.

### AC2: Summary Links Spec Evidence

**Given** a deployment summary is generated
**When** a spec package exists for the issue
**Then** the summary links requirements, design, tasks, and Gherkin files.

### AC3: Summary Links Verification Evidence

**Given** a deployment summary is generated
**When** verification has completed
**Then** the summary includes the verification report path and pass/fail status.

## Out of Scope

- Creating or mutating deployment infrastructure.
