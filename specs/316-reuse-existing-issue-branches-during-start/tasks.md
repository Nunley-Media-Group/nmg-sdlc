# Tasks: Reuse existing issue branches during start

**Issue**: #316
**Date**: 2026-08-28
**Status**: Approved

---

## Implementation

- [x] Update `scripts/start-issue.mjs` to reuse an exact local canonical branch.
- [x] Update `scripts/start-issue.mjs` to fetch and track an exact origin canonical branch.
- [x] Preserve `gh issue develop` for a genuinely missing branch.
- [x] Add behavioral regression coverage in `scripts/__tests__/start-issue-controller.test.mjs`.
- [x] Record the fix in `CHANGELOG.md`.

## Verification

- [x] Run `cd scripts && npm test -- --runInBand __tests__/start-issue-controller.test.mjs`.
- [x] Run the repository contribution and verification gates applicable to the changed paths.
