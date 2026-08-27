# Tasks: Remove wall-clock timeboxing from SDLC execution

**Issue**: #286
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG

---

## Schema and Runtime

- [ ] T1 — Make `timeoutMs` optional in steering validation input and define omission as no deadline.
- [ ] T2 — Remove timer races and elapsed-time child termination from built-in command and extension-provider execution.
- [ ] T3 — Add explicit signal-driven cancellation with stable cancelled outcomes.
- [ ] T4 — Add confirmed process-loss classification and owned process-group cleanup.
- [ ] T5 — Implement POSIX and Windows cleanup without shell interpolation or unrelated-process targeting.

## Workflow and Canonical Verification

- [ ] T6 — Remove deadline flags and elapsed-time waits from the OMP exercise harness.
- [ ] T7 — Preserve unbounded Herdr/controller waits and cover confirmed worker loss.
- [ ] T8 — Remove finite polling exits from current review and CI workflow contracts.
- [ ] T9 — Remove subprocess deadlines from current canonical verification commands and providers.

## Managed Contracts and Documentation

- [ ] T10 — Remove timeout fields from steering manifests, generators, fixtures, schemas, and managed checksums.
- [ ] T11 — Update README, contribution-facing guidance, technical and verification steering, and generated plan contracts.
- [ ] T12 — Record the change under CHANGELOG `[Unreleased]` without rewriting historical evidence.

## Regression Coverage

- [ ] T13 — Cover omitted and legacy `timeoutMs` behavior without a finite deadline.
- [ ] T14 — Cover healthy long-running command and provider completion.
- [ ] T15 — Cover pre-launch and in-flight cancellation plus listener cleanup.
- [ ] T16 — Cover process loss, POSIX/Windows group cleanup, and already-exited cleanup.
- [ ] T17 — Cover unbounded RPC, Herdr, review, CI, and canonical verification contracts.

## Verification and Delivery

- [ ] T18 — Run focused runtime, workflow, controller, and managed-artifact tests.
- [ ] T19 — Run the complete contribution, Jest, compatibility, steering, inventory, plugin-surface, and live smoke gates.
- [ ] T20 — Commit a verification report correlating every acceptance criterion to exact commands and outcomes.
- [ ] T21 — Open a linked PR, remediate eligible automated review and CI, and merge exact verified HEAD.
- [ ] T22 — Close issue #286, publish the minor release, install it into OMP, and prove the installed version.

## Verification Evidence

Evidence is recorded after implementation in `verification-report.md` and this section. Every command entry includes its exact outcome and affected-path behavior. No gate may use a finite timeout replacement.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #286 | 2026-08-27 | Initial approved task plan |
