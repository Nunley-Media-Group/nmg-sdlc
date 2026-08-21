# Design: Remove the Automated SDLC Loop and Unattended Mode

**Issue**: #151
**Status**: Approved

## Architecture

The extension exposes interactive native-plan commands and print-safe automated commands. `/sdlc-execute` is an explicit Herdr orchestrator; sibling OMP workers own start, implementation, verification, and delivery. No persistent in-process runner, unattended-mode flag, retry daemon, or hidden background loop remains.

## Migration Boundary

`/sdlc-upgrade-project` detects known legacy runner artifacts and proposes deterministic removal. It does not mutate issue history, unknown project files, labels, or unrelated workflows. Superseded specifications remain recoverable from Git but are not normative in the working tree.

## Verification

`scripts/__tests__/plugin-surface-verification.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, and `scripts/verify-plugin-surface.mjs` cover the installed surface and orchestration boundary.
