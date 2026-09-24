# Tasks: Treat old smoke failure as historical across changed verification identity

**Issue**: #423
**Date**: 2026-09-23
**Status**: Approved
**Author**: NMG

### T001: Attribute historical and current attempts

**Files**: `steering/extensions/nmg-sdlc-smoke.mjs`, `scripts/__tests__/nmg-sdlc-smoke.test.mjs`

Separate coherent old identity/queue evidence from current recovery proof. Retain strict matching-attempt checks and recovery-store precedence; prove no replay, no deletion and a fresh explicit-queue clone/baseline.

### T002: Verify bounded recovery and safety

**Files**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `steering/extensions/nmg-sdlc-smoke.mjs`

Cover malformed/ambiguous same-identity evidence, valid exact-identity legacy resume, and a historical #133-to-#135 transition without weakening merged/closed delivery checks.

### T003: Document and deliver exact behavior

**Files**: `README.md`, `CHANGELOG.md`, `specs/423-treat-old-smoke-failure-as-historical-across-changed-verification-identity/`, `steering/extensions/nmg-sdlc-smoke.mjs`

Run focused and full tests, isolated candidate install, registered #135 smoke if no prior nested dispatch, review and exact-head PR delivery; preserve all evidence and avoid unchanged retries.
