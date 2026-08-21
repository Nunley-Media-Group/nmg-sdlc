# Design: Start Issue

**Issue**: #10
**Status**: Approved

## Architecture

The public surface is `automated start stage`. Normative behavior lives in `skills/start-issue/` and follows the OMP extension, native `/plan`, and Herdr OMP worker boundaries defined by steering.

## Boundaries

- Interactive decisions use native plan and bounded ask gates.
- Automated stages fail closed with explicit handoff evidence and do not ask users questions.
- GitHub, filesystem, and process mutations remain inside the stage that owns them.
- Singular `specs/{N}-{slug}/` identity is required for ordinary feature and bug delivery.
- Historical behavior not represented by this package is intentionally non-normative and remains recoverable from Git.

## Failure Model

Missing prerequisites, ambiguous ownership, stale exact-head evidence, or unavailable required tooling stop the owning stage. No compatibility shim may report success without the observable contract.

## Verification

The maintained checks are `scripts/__tests__/start-issue-selection-contract.test.mjs`. They must exercise the public outcome rather than source-text coincidence.
