# Defect Report: Stop retrying gh calls whose error names issue number 502, 503 or 504

**Issue**: #603
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/575-commit-resolved-queue-head-merges-and-retry-transient-github-reads-in-sdlc-execute/

## Reproduction

1. Wrap a `gh` runner with `retryingRun` from `scripts/sdlc-execute.mjs`. The runner fails every call with stderr `GraphQL: Could not resolve to an issue or pull request with the number of 502. (repository.issue)`.
2. Invoke the wrapped runner with the command `gh`.
3. The runner is called four times, with sleeps of 1000, 2000 and 4000 ms, instead of once.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A failed `gh` call is transient only when its output shows a network, timeout or HTTP 5xx failure. A number that only identifies an issue, pull request or other object never makes it transient, so the call runs once |
| **Actual** | Any failure output containing the standalone number 502, 503 or 504 is classified as transient and retried three times |

## Acceptance Criteria

### AC1: An issue number is not a transient failure

**Given** a failed `gh` call whose output names issue or pull request number 502, 503 or 504 and shows no network, timeout or HTTP 5xx failure
**When** the `retryingRun` wrapper runs it
**Then** the call runs once
**And** its failure response is returned without any backoff sleep

### AC2: Real HTTP 5xx failures are still retried

**Given** a `gh` call that always fails with output reporting `HTTP 502`, `HTTP 503`, `HTTP 504`, `502 Bad Gateway`, `503 Service Unavailable` or `504 Gateway Timeout`
**When** the `retryingRun` wrapper runs it
**Then** the call runs four times with backoff sleeps of 1000, 2000 and 4000 ms

### AC3: Other transient signals are unchanged

**Given** a `gh` call that always fails with a timeout, connection reset, connection refused, DNS resolution, TLS handshake or unexpected EOF output, or with a spawn error other than a missing binary
**When** the `retryingRun` wrapper runs it
**Then** the call runs four times with backoff sleeps of 1000, 2000 and 4000 ms

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `transientGhFailure` treats the numbers 502–504 as transient only when they appear as an HTTP status: after an `HTTP` prefix, or with the status phrase `Bad Gateway`, `Service Unavailable` or `Gateway Timeout` | Must |
| FR2 | Every other existing transient classification is preserved: `HTTP 5xx`, timeouts, connection reset or refused, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `could not resolve host`, `TLS handshake`, `unexpected EOF`, and a spawn error whose code is not `ENOENT` | Must |

## Out of Scope

- Changing the retry delays or attempt count
- Retrying commands other than `gh`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #603 | 2026-11-23 | Initial defect report |
