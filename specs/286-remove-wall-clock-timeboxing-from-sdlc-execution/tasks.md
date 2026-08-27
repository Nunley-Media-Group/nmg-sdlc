# Tasks: Remove wall-clock timeboxing from SDLC execution

**Issue**: #286
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG

---

## Schema and Runtime

- [x] T1 — Make `timeoutMs` optional in steering validation input and define omission as no deadline.
- [x] T2 — Remove timer races and elapsed-time child termination from built-in command and extension-provider execution.
- [x] T3 — Add explicit signal-driven cancellation with stable cancelled outcomes.
- [x] T4 — Add confirmed process-loss classification and owned process-group cleanup.
- [x] T5 — Implement POSIX and Windows cleanup without shell interpolation or unrelated-process targeting.

## Workflow and Canonical Verification

- [x] T6 — Remove deadline flags and elapsed-time waits from the OMP exercise harness.
- [x] T7 — Preserve unbounded Herdr/controller waits and cover confirmed worker loss.
- [x] T8 — Remove finite polling exits from current review and CI workflow contracts.
- [x] T9 — Remove subprocess deadlines from current canonical verification commands and providers.

## Managed Contracts and Documentation

- [x] T10 — Remove timeout fields from steering manifests, generators, fixtures, schemas, and managed checksums.
- [x] T11 — Update README, contribution-facing guidance, technical and verification steering, and generated plan contracts.
- [x] T12 — Record the change under CHANGELOG `[Unreleased]` without rewriting historical evidence.

## Regression Coverage

- [x] T13 — Cover omitted and legacy `timeoutMs` behavior without a finite deadline.
- [x] T14 — Cover healthy long-running command and provider completion.
- [x] T15 — Cover pre-launch and in-flight cancellation plus listener cleanup.
- [x] T16 — Cover process loss, POSIX/Windows group cleanup, and already-exited cleanup.
- [x] T17 — Cover unbounded RPC, Herdr, review, CI, and canonical verification contracts.

## Verification and Delivery

- [x] T18 — Run focused runtime, workflow, controller, and managed-artifact tests.
- [x] T19 — Run the complete local contribution, Jest, compatibility, steering, inventory, plugin-surface, and live smoke gates.
- [x] T20 — Commit a verification report correlating every acceptance criterion to exact commands and outcomes.
- [ ] T21 — Open a linked PR, remediate eligible automated review and CI, and merge exact verified HEAD.
- [ ] T22 — Close issue #286, publish the minor release, install it into OMP, and prove the installed version.

## Verification Evidence

See `verification-report.md`: 681 full-suite tests passed with 2 intentional skips; 216 focused supervision/controller tests passed; plugin surface, current specs, 43-item skill inventory, verify-code exercise, three workflow-bundle validations, steering coverage 2/2, live smoke, and diff hygiene passed. No gate used a finite timeout replacement.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #286 | 2026-08-27 | Initial approved task plan |
