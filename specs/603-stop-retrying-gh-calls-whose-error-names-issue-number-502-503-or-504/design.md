# Root Cause Analysis: Stop retrying gh calls whose error names issue number 502, 503 or 504

**Issue**: #603
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/575-commit-resolved-queue-head-merges-and-retry-transient-github-reads-in-sdlc-execute/

## Root Cause

`TRANSIENT_GH_OUTPUT` in `scripts/sdlc-execute.mjs` is the pattern `transientGhFailure` tests against a failed `gh` call's stderr and stdout. It contains the bare alternative `\b50[234]\b`, which matches the standalone numbers 502, 503 and 504 anywhere in the output. GitHub error messages that name an object by number, such as `Could not resolve to an issue or pull request with the number of 502`, match it, so `retryingRun` sleeps and reruns a call that can never succeed.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-execute.mjs` | `TRANSIENT_GH_OUTPUT` | Pattern that marks failure output as transient |
| `scripts/sdlc-execute.mjs` | `transientGhFailure` | Classifies a failed `gh` response |
| `scripts/sdlc-execute.mjs` | `retryingRun` | Reruns a transient `gh` failure after each backoff delay |

## Fix Strategy

Remove the `\b50[234]\b` alternative from `TRANSIENT_GH_OUTPUT`. The remaining alternatives already match every real HTTP 502–504 report: `HTTP 5\d\d` matches `HTTP 502`, `HTTP 503` and `HTTP 504`, and `bad gateway`, `service unavailable` and `gateway timeout` match the status phrases with or without the number. No other alternative, and no code in `transientGhFailure` or `retryingRun`, changes.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-execute.mjs` | Delete the `\b50[234]\b` alternative from `TRANSIENT_GH_OUTPUT` | AC1, FR1 |

## Blast Radius

`retryingRun` wraps the controller's `gh` calls, including the issue evidence reads in `statusEvidence`. After the fix, a failure whose output holds a bare 502–504 with no `HTTP` prefix, status phrase or other transient signal fails on the first attempt. HTTP 5xx, network and timeout failures are retried as before, so the #575 scenario in `scripts/__tests__/sdlc-execute.test.mjs` (`HTTP 502: Bad Gateway`) keeps passing.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Remove the bare-number alternative | Selected | The other alternatives already cover every HTTP status form the issue lists |
| Replace it with a pattern that excludes "number of" and `#` prefixes | Rejected | An exclusion list cannot cover every message that names an object by number |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #603 | 2026-11-23 | Initial defect design |
