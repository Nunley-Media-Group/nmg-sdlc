# Design: Replace status-only live smoke with mutable delivery verification

**Issue**: #343
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/269-fix-project-runtime-loading-under-compiled-omp-host/

---

## Overview

Keep `repository.nmg-sdlc-smoke` registered as an always-required provider. Replace `steering/extensions/nmg-sdlc-smoke.mjs` so it clones the allowlisted consumer repo, fail-closes on policy misses, and spawns exactly one child running this checkout's `scripts/sdlc-execute.mjs run` with the configured issue tokens. Pass only when GitHub observation proves each queued issue `CLOSED` with exactly one merged PR and an observed head SHA. Status JSON is ignored as a pass predicate.

The nmg-sdlc verify worker remains observer/invoker: it is not `runExecute` in-process. Re-entry is blocked with `NMG_SDLC_SMOKE_OWNED=1`. Local clones are deleted only on `passed`.

---

## Architecture

### Component Diagram

