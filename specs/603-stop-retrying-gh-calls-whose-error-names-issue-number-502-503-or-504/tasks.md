# Tasks: Stop retrying gh calls whose error names issue number 502, 503 or 504

**Issue**: #603
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/575-commit-resolved-queue-head-merges-and-retry-transient-github-reads-in-sdlc-execute/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- FR1: `TRANSIENT_GH_OUTPUT` no longer contains the `\b50[234]\b` alternative.
- FR2: every other alternative of `TRANSIENT_GH_OUTPUT`, and the bodies of `transientGhFailure` and `retryingRun`, are unchanged.

### T002: Implement the Regression Scenarios

**File(s)**: `scripts/__tests__/sdlc-execute-gh-retry.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- The tests call `retryingRun` from `scripts/sdlc-execute.mjs` with a fake runner that always returns the failure, and a `sleep` that records its delays.
- `@SCN001` (AC1): for stderr `GraphQL: Could not resolve to an issue or pull request with the number of 502. (repository.issue)`, and the same message with 503 and with 504, the runner is called once, no sleep is recorded, and the failure response is returned.
- `@SCN002` (AC2): for stderr `HTTP 502`, `HTTP 503`, `HTTP 504`, `502 Bad Gateway`, `503 Service Unavailable` and `504 Gateway Timeout`, the runner is called four times and the sleeps are `[1000, 2000, 4000]`.
- `@SCN003` (AC3): for stderr `request timed out`, `connection reset by peer`, `connection refused`, `could not resolve host: api.github.com`, `TLS handshake timeout` and `unexpected EOF`, and for a response with `error: { code: 'EPIPE' }`, the runner is called four times and the sleeps are `[1000, 2000, 4000]`.
- Each test cites its `@SCN` tag in its describe title.
- `@SCN001` fails without T001 and passes with it.
- `cd scripts && npm test -- __tests__/sdlc-execute-gh-retry.test.mjs` passes, and the `@SCN002` tests of #575 in `__tests__/sdlc-execute.test.mjs` still pass.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #603 | 2026-11-23 | Initial defect tasks |
