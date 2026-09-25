# Design: Resume execute from branch evidence and deliver only full-green verification

**Issue**: #436
**Date**: 2026-09-25
**Status**: Approved
**Author**: NMG

## Architecture

`scripts/sdlc-execute.mjs` reads branch and live evidence through `scripts/sdlc-status.mjs` and `scripts/issue-spec-scope.mjs`, dispatches only `start`, `implement`, `verify`, and `deliver` workers, and reports owned panes to `scripts/sdlc-execute-supervisor.mjs`. `scripts/sdlc-safe-recoveries.mjs` keeps publication-scope and exact-commit reconciliation without a ledger. `scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-recover-verification.mjs`, and `scripts/verification-readiness.mjs` validate fresh registered evidence. `scripts/sdlc-deliver.mjs` adds `prepare-version` and `prepare-pr-evidence` and reconciles live PR/issue state. `src/sdlc-verification-runtime.mjs` defers project providers until required local commands pass; `steering/extensions/nmg-sdlc-smoke.mjs` binds receipts to the invocation.

## Boundaries

- No fixed retry ceiling; unchanged failures require different diagnosis.
- No force push, forged approval, or merge before full-green exact-head evidence.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #436 | 2026-09-25 | Initial feature design |
