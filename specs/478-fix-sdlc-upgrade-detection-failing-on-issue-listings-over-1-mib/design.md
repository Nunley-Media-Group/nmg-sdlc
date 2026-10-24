# Root Cause Analysis: Fix sdlc-upgrade detection failing on issue listings over 1 MiB

**Issue**: #478
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG

## Root Cause

`defaultRun` in `scripts/sdlc-upgrade.mjs` calls `spawnSync` without `maxBuffer`. Node's 1 MiB default terminates `gh api --paginate --slurp repos/<owner>/<repo>/issues …` once its output passes that size, and `detectIssueDependencyUpgrade` reports the non-zero result as an unreadable listing.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-upgrade.mjs` | `defaultRun` | Uses the 1 MiB default buffer |

## Fix Strategy

Pass `maxBuffer: MAX_COMMAND_OUTPUT_BYTES` (256 MiB) in `defaultRun`. An explicit `options.maxBuffer` still wins.
